-- Fix NOT NULL client_line_id when create_manual_order_atomic_v1 registers payment.
--
-- order_payment_lines.client_line_id is text NOT NULL (V2 ledger). The atomic
-- create path omitted it on INSERT. Also cast v_order_id to text for order_id.

create or replace function public.create_manual_order_atomic_v1(
  p_client_request_id uuid,
  p_client_name text,
  p_client_phone text,
  p_client_rut text,
  p_items jsonb,
  p_total numeric,
  p_total_minor bigint,
  p_currency text,
  p_payment_type text,
  p_payment_ref text,
  p_payment_method_specific text,
  p_payment_breakdown jsonb,
  p_register_payment boolean,
  p_note text,
  p_branch_id uuid,
  p_company_id uuid,
  p_status text,
  p_order_type text,
  p_delivery_address jsonb,
  p_delivery_fee numeric,
  p_delivery_fee_minor bigint,
  p_coupon_code text,
  p_client_id uuid default null::uuid,
  p_manual_order_mode text default 'quick_sale'::text,
  p_payment_timing text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id uuid;
  v_user_company_id uuid;
  v_user_role text;
  v_currency text;
  v_scale numeric;
  v_existing public.orders%rowtype;
  v_order jsonb;
  v_order_id bigint;
  v_server_total_minor bigint;
  v_shift_id uuid;
  v_cash numeric;
  v_card numeric;
  v_online numeric;
  v_paid_minor bigint;
begin
  if p_client_request_id is null then
    raise exception 'client_request_id_required' using errcode = '22000';
  end if;

  select b.company_id, upper(coalesce(nullif(btrim(b.currency), ''), 'CLP'))
  into v_company_id, v_currency
  from public.branches b
  where b.id = p_branch_id;

  select u.company_id, lower(btrim(u.role))
  into v_user_company_id, v_user_role
  from public.users u
  where u.auth_user_id = auth.uid() and coalesce(u.is_active, true)
  limit 1;

  if v_company_id is null or v_user_company_id is distinct from v_company_id
     or v_user_role not in ('owner', 'admin', 'ceo', 'cashier') then
    raise exception 'branch_not_allowed' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_company_id::text || ':' || p_client_request_id::text, 0)
  );

  select * into v_existing
  from public.orders
  where company_id = v_company_id and client_request_id = p_client_request_id
  limit 1;

  if found then
    if v_existing.branch_id is distinct from p_branch_id then
      raise exception 'idempotency_conflict' using errcode = '22000';
    end if;
    return jsonb_build_object(
      'order', to_jsonb(v_existing),
      'idempotentReplay', true,
      'cashRegistered', v_existing.payment_status = 'paid'
    );
  end if;

  if upper(btrim(coalesce(p_currency, ''))) <> v_currency then
    raise exception 'branch_currency_required' using errcode = '22000';
  end if;
  v_scale := power(10::numeric, public.order_currency_fraction_digits_v1(v_currency));
  if p_total_minor is null
     or public.order_major_to_minor_v1(p_total, v_currency) <> p_total_minor then
    raise exception 'invalid_item_price' using errcode = '22000';
  end if;
  if public.order_major_to_minor_v1(coalesce(p_delivery_fee, 0), v_currency)
     <> coalesce(p_delivery_fee_minor, 0) then
    raise exception 'invalid_delivery_fee' using errcode = '22000';
  end if;

  v_cash := coalesce((p_payment_breakdown ->> 'cash')::numeric, 0);
  v_card := coalesce((p_payment_breakdown ->> 'card')::numeric, 0);
  v_online := coalesce((p_payment_breakdown ->> 'online')::numeric, 0);
  v_paid_minor := public.order_major_to_minor_v1(v_cash + v_card + v_online, v_currency);

  if coalesce(p_register_payment, false) and v_paid_minor <> p_total_minor then
    raise exception 'payment_total_mismatch' using errcode = '22000';
  end if;
  if not coalesce(p_register_payment, false) and v_paid_minor <> 0 then
    raise exception 'deferred_payment_has_amount' using errcode = '22000';
  end if;

  if coalesce(p_register_payment, false) then
    select cs.id into v_shift_id
    from public.cash_shifts cs
    where cs.branch_id = p_branch_id and cs.status = 'open'
    order by cs.opened_at desc
    limit 1
    for update;
    if v_shift_id is null then
      raise exception 'cash_shift_required' using errcode = '22000';
    end if;
  end if;

  v_order := public.create_order_transaction(
    p_client_name => p_client_name,
    p_client_phone => p_client_phone,
    p_client_rut => p_client_rut,
    p_items => p_items,
    p_total => p_total_minor / v_scale,
    p_payment_type => case when p_register_payment then p_payment_type else 'pendiente' end,
    p_payment_ref => p_payment_ref,
    p_note => p_note,
    p_branch_id => p_branch_id,
    p_company_id => null,
    p_status => coalesce(nullif(p_status, ''), 'pending'),
    p_payment_method_specific => p_payment_method_specific,
    p_order_type => p_order_type,
    p_delivery_address => p_delivery_address,
    p_delivery_fee => p_delivery_fee_minor / v_scale,
    p_coupon_code => p_coupon_code,
    p_order_origin => null,
    p_payment_breakdown => case when p_register_payment then p_payment_breakdown else null end,
    p_client_id => p_client_id
  );
  v_order_id := (v_order ->> 'id')::bigint;

  select public.order_major_to_minor_v1(coalesce(o.total, 0), v_currency)
  into v_server_total_minor
  from public.orders o
  where o.id = v_order_id;

  if v_server_total_minor is distinct from p_total_minor then
    raise exception 'quote_changed' using errcode = '22000';
  end if;

  update public.orders
  set client_request_id = p_client_request_id,
      currency = v_currency,
      subtotal_minor = public.order_major_to_minor_v1(coalesce(subtotal, total, 0), v_currency),
      discount_total_minor = public.order_major_to_minor_v1(coalesce(discount_total, 0), v_currency),
      delivery_fee_minor = public.order_major_to_minor_v1(coalesce(delivery_fee, 0), v_currency),
      total_minor = public.order_major_to_minor_v1(coalesce(total, 0), v_currency),
      payment_lines = case when p_register_payment then
        (case when v_cash > 0 then jsonb_build_array(jsonb_build_object(
          'id', gen_random_uuid(),
          'methodId', coalesce(nullif(p_payment_method_specific, ''), 'cash'),
          'rail', 'cash',
          'amountMinor', public.order_major_to_minor_v1(v_cash, v_currency),
          'currency', v_currency,
          'evidencePolicy', 'none'
        )) else '[]'::jsonb end)
        ||
        (case when v_card > 0 then jsonb_build_array(jsonb_build_object(
          'id', gen_random_uuid(),
          'methodId', coalesce(nullif(p_payment_method_specific, ''), 'card'),
          'rail', 'card',
          'amountMinor', public.order_major_to_minor_v1(v_card, v_currency),
          'currency', v_currency,
          'evidencePolicy', 'optional'
        )) else '[]'::jsonb end)
        ||
        (case when v_online > 0 then jsonb_build_array(jsonb_build_object(
          'id', gen_random_uuid(),
          'methodId', coalesce(nullif(p_payment_method_specific, ''), 'online'),
          'rail', 'online',
          'amountMinor', public.order_major_to_minor_v1(v_online, v_currency),
          'currency', v_currency,
          'evidencePolicy', case when p_payment_ref is null then 'optional' else 'required' end
        )) else '[]'::jsonb end)
      else '[]'::jsonb end,
      manual_order_mode = case
        when p_manual_order_mode in ('quick_sale', 'session') then p_manual_order_mode
        else 'quick_sale'
      end,
      payment_timing = case when p_register_payment then 'immediate' else 'deferred' end,
      payment_status = case when p_register_payment then 'paid' else 'pending' end,
      payment_balance_minor = case when p_register_payment then 0 else p_total_minor end,
      payment_evidence_status = case when p_payment_ref is not null then 'uploaded' else null end
  where id = v_order_id;

  if coalesce(p_register_payment, false) then
    insert into public.order_payment_lines(
      id, order_id, client_line_id, company_id, method_id, rail, amount_minor, currency,
      settlement_amount_minor, settlement_currency, exchange_rate,
      tendered_amount_minor, tendered_currency, change_amount_minor,
      evidence_policy
    )
    select
      coalesce(nullif(line ->> 'id', '')::uuid, gen_random_uuid()),
      v_order_id::text,
      coalesce(nullif(line ->> 'id', ''), gen_random_uuid()::text),
      v_company_id,
      line ->> 'methodId',
      line ->> 'rail',
      (line ->> 'amountMinor')::bigint,
      v_currency,
      (line ->> 'amountMinor')::bigint,
      v_currency,
      null,
      case when line ->> 'rail' = 'cash'
        then (line ->> 'amountMinor')::bigint else null end,
      case when line ->> 'rail' = 'cash' then v_currency else null end,
      case when line ->> 'rail' = 'cash' then 0 else null end,
      coalesce(line ->> 'evidencePolicy', 'none')
    from public.orders o,
      lateral jsonb_array_elements(
        coalesce(o.payment_lines, '[]'::jsonb)
      ) as payment_line(line)
    where o.id = v_order_id
    on conflict (id) do nothing;

    if v_cash > 0 then
      perform public.cash_add_movement(v_shift_id, 'sale', v_cash,
        'Venta pedido #' || v_order_id, 'cash', v_order_id);
    end if;
    if v_card > 0 then
      perform public.cash_add_movement(v_shift_id, 'sale', v_card,
        'Venta pedido #' || v_order_id, 'card', v_order_id);
    end if;
    if v_online > 0 then
      perform public.cash_add_movement(v_shift_id, 'sale', v_online,
        'Venta pedido #' || v_order_id, 'online', v_order_id);
    end if;
  end if;

  select to_jsonb(o.*) into v_order from public.orders o where o.id = v_order_id;
  return jsonb_build_object(
    'order', v_order,
    'idempotentReplay', false,
    'cashRegistered', coalesce(p_register_payment, false)
  );
end;
$function$;
