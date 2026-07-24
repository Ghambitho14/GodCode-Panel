-- Fix operator does not exist: text = bigint in settle_order_payment_v3.
--
-- order_payment_evidence.order_id and order_payment_lines.order_id are text
-- (V2 ledger), while p_order_id is bigint (orders.id). Cast when touching those
-- tables so payment registration works from the POS.
--
-- Also align V3 inserts with the V2 ledger schema:
-- - client_line_id (NOT NULL)
-- - exchange_rate as numeric (not raw jsonb text)
create or replace function public.settle_order_payment_v3(
  p_order_id bigint,
  p_client_request_id uuid,
  p_payment_lines jsonb,
  p_source text default 'operator'::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order public.orders%rowtype;
  v_user_company_id uuid;
  v_role text := current_setting('request.jwt.claim.role', true);
  v_shift_id uuid;
  v_currency text;
  v_scale numeric;
  v_balance_minor bigint;
  v_paid_minor bigint := 0;
  v_cash_minor bigint := 0;
  v_card_minor bigint := 0;
  v_online_minor bigint := 0;
  v_line jsonb;
  v_line_id uuid;
  v_method text;
  v_policy jsonb;
  v_rail text;
  v_trigger text;
  v_amount bigint;
  v_settlement_amount bigint;
  v_settlement_currency text;
  v_exchange_rate numeric;
  v_expected_amount bigint;
  v_tendered_amount bigint;
  v_tendered_currency text;
  v_change_amount bigint;
  v_enabled_methods text[];
  v_existing_result jsonb;
  v_result jsonb;
  v_existing_lines jsonb;
  v_seen_methods text[] := array[]::text[];
begin
  if p_client_request_id is null then
    raise exception 'client_request_id_required' using errcode = '22000';
  end if;
  if jsonb_typeof(coalesce(p_payment_lines, 'null'::jsonb)) <> 'array' then
    raise exception 'payment_total_mismatch' using errcode = '22000';
  end if;
  if jsonb_array_length(p_payment_lines) = 0 then
    raise exception 'payment_total_mismatch' using errcode = '22000';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found_or_not_allowed' using errcode = '42501';
  end if;

  if v_role <> 'service_role' then
    select u.company_id into v_user_company_id
    from public.users u
    where u.auth_user_id = auth.uid() and coalesce(u.is_active, true)
    limit 1;
    if v_user_company_id is distinct from v_order.company_id then
      raise exception 'order_not_found_or_not_allowed' using errcode = '42501';
    end if;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_order.company_id::text || ':' || p_client_request_id::text, 0)
  );
  select result into v_existing_result
  from public.order_transaction_requests
  where company_id = v_order.company_id
    and client_request_id = p_client_request_id
    and operation = 'settle_v3';
  if found then return v_existing_result; end if;

  v_currency := upper(coalesce(nullif(btrim(v_order.currency), ''), 'CLP'));
  v_scale := power(10::numeric, public.order_currency_fraction_digits_v1(v_currency));
  select coalesce(b.payment_methods, array[]::text[])
  into v_enabled_methods
  from public.branches b
  where b.id = v_order.branch_id;
  v_balance_minor := coalesce(
    v_order.payment_balance_minor,
    v_order.total_minor,
    public.order_major_to_minor_v1(v_order.total, v_currency)
  );
  if v_balance_minor <= 0 or v_order.payment_status = 'paid' then
    raise exception 'order_already_settled' using errcode = '22000';
  end if;

  select cs.id into v_shift_id
  from public.cash_shifts cs
  where cs.branch_id = v_order.branch_id and cs.status = 'open'
  order by cs.opened_at desc
  limit 1
  for update;
  if v_shift_id is null then
    raise exception 'cash_shift_required' using errcode = '22000';
  end if;

  for v_line in select value from jsonb_array_elements(p_payment_lines)
  loop
    v_method := nullif(btrim(v_line ->> 'methodId'), '');
    v_policy := public.payment_method_policy_v3(
      v_order.company_id, v_method, v_currency
    );
    v_rail := v_policy ->> 'rail';
    v_trigger := v_policy ->> 'settlementTrigger';
    v_amount := (v_line ->> 'amountMinor')::bigint;
    v_settlement_amount := coalesce(
      (v_line ->> 'settlementAmountMinor')::bigint,
      v_amount
    );
    v_settlement_currency := upper(coalesce(
      v_line ->> 'settlementCurrency',
      v_currency
    ));
    v_exchange_rate := nullif(v_line ->> 'exchangeRate', '')::numeric;
    if v_method is null
       or v_rail not in ('cash', 'card', 'online')
       or v_amount is null
       or v_amount <= 0
       or (
         coalesce(array_length(v_enabled_methods, 1), 0) > 0
         and not exists (
           select 1
           from unnest(v_enabled_methods) enabled_method
           where public.payment_method_key_v3(enabled_method)
             = public.payment_method_key_v3(v_method)
         )
       )
       or upper(coalesce(v_line ->> 'currency', v_currency)) <> v_currency then
      raise exception 'invalid_payment_line' using errcode = '22000';
    end if;
    if public.payment_method_key_v3(v_method) = any(v_seen_methods) then
      raise exception 'duplicate_payment_method' using errcode = '22000';
    end if;
    v_seen_methods := array_append(
      v_seen_methods,
      public.payment_method_key_v3(v_method)
    );
    if jsonb_array_length(p_payment_lines) > 1
       and coalesce((v_policy ->> 'allowMixedPayment')::boolean, true) = false then
      raise exception 'mixed_payment_not_allowed' using errcode = '22000';
    end if;
    if v_trigger = 'gateway_webhook'
       and not (v_role = 'service_role' and p_source = 'gateway_webhook') then
      raise exception 'payment_confirmation_required' using errcode = '22000';
    end if;
    if v_settlement_currency <> v_currency then
      if v_exchange_rate is null or v_exchange_rate <= 0
         or v_settlement_amount is null or v_settlement_amount <= 0 then
        raise exception 'exchange_rate_required' using errcode = '22000';
      end if;
      v_expected_amount := round(
        (v_settlement_amount::numeric
          / power(10::numeric, public.order_currency_fraction_digits_v1(v_settlement_currency)))
        / v_exchange_rate
        * v_scale
      )::bigint;
      if abs(v_expected_amount - v_amount) > 1 then
        raise exception 'payment_conversion_mismatch' using errcode = '22000';
      end if;
    elsif v_settlement_amount <> v_amount then
      raise exception 'payment_conversion_mismatch' using errcode = '22000';
    end if;
    if (v_policy ->> 'evidencePolicy') = 'required'
       and not exists (
         select 1 from public.order_payment_evidence e
         where e.order_id = p_order_id::text
           and public.payment_method_key_v3(e.method_id)
             = public.payment_method_key_v3(v_method)
           and e.status in ('uploaded', 'verified', 'pending_verification')
       ) then
      raise exception 'payment_evidence_required' using errcode = '22000';
    end if;
    v_tendered_amount := nullif(v_line ->> 'tenderedAmountMinor', '')::bigint;
    v_tendered_currency := upper(coalesce(
      nullif(v_line ->> 'tenderedCurrency', ''),
      v_settlement_currency
    ));
    v_change_amount := null;
    if v_rail = 'cash' then
      if v_tendered_amount is null
         or v_tendered_amount < v_settlement_amount
         or v_tendered_currency <> v_settlement_currency then
        raise exception 'cash_confirmation_required' using errcode = '22000';
      end if;
      v_change_amount := v_tendered_amount - v_settlement_amount;
      if nullif(v_line ->> 'changeAmountMinor', '') is not null
         and (v_line ->> 'changeAmountMinor')::bigint <> v_change_amount then
        raise exception 'cash_change_mismatch' using errcode = '22000';
      end if;
    end if;

    v_line_id := coalesce(nullif(v_line ->> 'id', '')::uuid, gen_random_uuid());
    insert into public.order_payment_lines(
      id, order_id, client_line_id, company_id, method_id, rail, amount_minor, currency,
      settlement_amount_minor, settlement_currency, exchange_rate,
      tendered_amount_minor, tendered_currency, change_amount_minor,
      evidence_policy
    ) values (
      v_line_id,
      p_order_id::text,
      coalesce(nullif(v_line ->> 'id', ''), v_line_id::text),
      v_order.company_id,
      v_method,
      v_rail,
      v_amount,
      v_currency,
      v_settlement_amount,
      v_settlement_currency,
      nullif(v_line ->> 'exchangeRate', '')::numeric,
      v_tendered_amount,
      v_tendered_currency,
      v_change_amount,
      coalesce(nullif(v_line ->> 'evidencePolicy', ''), v_policy ->> 'evidencePolicy', 'none')
    )
    on conflict (id) do nothing;

    v_paid_minor := v_paid_minor + v_amount;
    if v_rail = 'cash' then v_cash_minor := v_cash_minor + v_amount;
    elsif v_rail = 'card' then v_card_minor := v_card_minor + v_amount;
    else v_online_minor := v_online_minor + v_amount;
    end if;
  end loop;

  if v_paid_minor <> v_balance_minor then
    raise exception 'payment_total_mismatch' using errcode = '22000';
  end if;

  if v_cash_minor > 0 then
    perform public.cash_add_movement(
      v_shift_id, 'sale', v_cash_minor / v_scale,
      'Cobro pedido #' || p_order_id, 'cash', p_order_id
    );
  end if;
  if v_card_minor > 0 then
    perform public.cash_add_movement(
      v_shift_id, 'sale', v_card_minor / v_scale,
      'Cobro pedido #' || p_order_id, 'card', p_order_id
    );
  end if;
  if v_online_minor > 0 then
    perform public.cash_add_movement(
      v_shift_id, 'sale', v_online_minor / v_scale,
      'Cobro pedido #' || p_order_id, 'online', p_order_id
    );
  end if;

  v_existing_lines := case
    when jsonb_typeof(v_order.payment_lines) = 'array' then v_order.payment_lines
    else '[]'::jsonb
  end;
  update public.orders
  set payment_lines = v_existing_lines || p_payment_lines,
      payment_type = case
        when (v_cash_minor > 0)::integer + (v_card_minor > 0)::integer
          + (v_online_minor > 0)::integer > 1 then 'mixto'
        when v_cash_minor > 0 then 'tienda'
        when v_card_minor > 0 then 'tarjeta'
        else 'online'
      end,
      payment_method_specific = case
        when jsonb_array_length(p_payment_lines) = 1
          then p_payment_lines -> 0 ->> 'methodId'
        else 'mixed'
      end,
      payment_breakdown = jsonb_build_object(
        'cash', v_cash_minor / v_scale,
        'card', v_card_minor / v_scale,
        'online', v_online_minor / v_scale
      ),
      payment_timing = 'immediate',
      payment_status = 'paid',
      payment_balance_minor = 0,
      updated_at = now()
  where id = p_order_id;

  select to_jsonb(o.*) into v_result
  from public.orders o where o.id = p_order_id;
  v_result := jsonb_build_object(
    'order', v_result,
    'cashRegistered', true,
    'source', p_source
  );

  insert into public.order_transaction_requests(
    company_id, client_request_id, operation, order_id, result
  ) values (
    v_order.company_id, p_client_request_id, 'settle_v3', p_order_id, v_result
  );
  return v_result;
end;
$function$;
