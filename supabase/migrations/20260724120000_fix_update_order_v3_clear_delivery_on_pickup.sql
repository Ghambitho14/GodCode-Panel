-- Fix quote_changed when editing a delivery order to pickup/table.
--
-- update_order_transaction updates orders.total / delivery_fee but does not
-- refresh total_minor. update_order_v3 then compared expectedTotalMinor against
-- the stale total_minor (still including the old delivery fee).
--
-- Also force an empty delivery payload when fulfillment is not delivery so a
-- leftover `{}` or previous fee cannot leak into the revalidation path.

create or replace function public.update_order_v3(
  p_order_id bigint,
  p_expected_updated_at timestamp with time zone,
  p_client_request_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order public.orders%rowtype;
  v_updated jsonb;
  v_current public.orders%rowtype;
  v_user_company_id uuid;
  v_currency text;
  v_previous_total_minor bigint;
  v_new_total_minor bigint;
  v_previous_balance_minor bigint;
  v_paid_minor bigint;
  v_new_balance_minor bigint;
  v_expected_total_minor bigint;
  v_items jsonb;
  v_fulfillment text;
  v_order_type text;
  v_delivery jsonb;
  v_delivery_address jsonb;
  v_delivery_fee numeric;
  v_result jsonb;
begin
  if p_client_request_id is null then
    raise exception 'client_request_id_required' using errcode = '22000';
  end if;
  select u.company_id into v_user_company_id
  from public.users u
  where u.auth_user_id = auth.uid() and coalesce(u.is_active, true)
  limit 1;
  select * into v_order from public.orders
  where id = p_order_id and company_id = v_user_company_id
  for update;
  if not found then
    raise exception 'order_changed_or_not_allowed' using errcode = '42501';
  end if;
  if lower(coalesce(v_order.status, '')) in ('picked_up', 'cancelled', 'canceled') then
    raise exception 'order_edit_not_allowed' using errcode = '22000';
  end if;
  if p_expected_updated_at is not null
     and v_order.updated_at is distinct from p_expected_updated_at then
    raise exception 'order_changed' using errcode = '40001';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_order.company_id::text || ':' || p_client_request_id::text, 0)
  );
  select result into v_result
  from public.order_transaction_requests
  where company_id = v_order.company_id
    and client_request_id = p_client_request_id
    and operation = 'update_v3';
  if found then return v_result; end if;

  v_currency := upper(coalesce(nullif(btrim(v_order.currency), ''), 'CLP'));
  v_previous_total_minor := coalesce(
    v_order.total_minor,
    public.order_major_to_minor_v1(v_order.total, v_currency)
  );
  v_previous_balance_minor := coalesce(
    v_order.payment_balance_minor,
    case when v_order.payment_status = 'paid' then 0 else v_previous_total_minor end
  );
  v_paid_minor := greatest(0, v_previous_total_minor - v_previous_balance_minor);

  v_items := p_patch -> 'items';
  if jsonb_typeof(coalesce(v_items, 'null'::jsonb)) <> 'array'
     or jsonb_array_length(v_items) = 0 then
    raise exception 'invalid_order_items' using errcode = '22000';
  end if;
  v_fulfillment := lower(coalesce(p_patch ->> 'fulfillment', 'pickup'));
  if v_fulfillment not in ('table', 'pickup', 'delivery') then
    raise exception 'invalid_fulfillment' using errcode = '22000';
  end if;
  if v_fulfillment = 'table'
     and nullif(btrim(p_patch ->> 'operatorReference'), '') is null then
    raise exception 'operator_reference_required' using errcode = '22000';
  end if;
  v_order_type := case
    when v_fulfillment = 'delivery' then 'delivery'
    when v_fulfillment = 'table' then 'salon'
    else 'pickup'
  end;

  -- Never fall back to the previous delivery fee when leaving delivery.
  if v_fulfillment = 'delivery' then
    v_delivery := case
      when jsonb_typeof(p_patch -> 'delivery') = 'object' then p_patch -> 'delivery'
      else '{}'::jsonb
    end;
  else
    v_delivery := '{}'::jsonb;
  end if;

  if v_fulfillment = 'delivery'
     and nullif(btrim(v_delivery ->> 'address'), '') is null
     and nullif(btrim(v_delivery ->> 'zoneId'), '') is null then
    raise exception 'delivery_address_required' using errcode = '22000';
  end if;

  v_delivery_address := case when v_fulfillment = 'delivery' then
    jsonb_strip_nulls(jsonb_build_object(
      'address', nullif(v_delivery ->> 'address', ''),
      'reference', nullif(v_delivery ->> 'reference', ''),
      'named_area_id', nullif(v_delivery ->> 'zoneId', ''),
      'delivery_km', nullif(v_delivery ->> 'km', '')::numeric
    ))
    else null end;

  v_delivery_fee := case
    when v_fulfillment = 'delivery' then coalesce((v_delivery ->> 'fee')::numeric, 0)
    else 0
  end;

  v_updated := public.update_order_transaction(
    p_order_id => p_order_id,
    p_client_name => coalesce(p_patch ->> 'clientName', v_order.client_name, ''),
    p_client_phone => coalesce(p_patch ->> 'clientPhone', v_order.client_phone, ''),
    p_client_rut => coalesce(p_patch ->> 'clientDocument', v_order.client_rut, ''),
    p_items => v_items,
    p_payment_type => coalesce(v_order.payment_type, 'pendiente'),
    p_note => coalesce(p_patch ->> 'note', v_order.note, ''),
    p_order_type => v_order_type,
    p_delivery_address => v_delivery_address,
    p_delivery_fee => v_delivery_fee,
    p_coupon_code => nullif(p_patch ->> 'couponCode', ''),
    p_payment_breakdown => v_order.payment_breakdown
  );

  select * into v_current from public.orders where id = p_order_id for update;

  -- Always derive minors from the freshly written major totals. update_order_transaction
  -- does not refresh *_minor columns, so coalescing to the old total_minor falsely
  -- raised quote_changed after removing delivery.
  v_new_total_minor := public.order_major_to_minor_v1(v_current.total, v_currency);
  v_expected_total_minor := (p_patch ->> 'expectedTotalMinor')::bigint;
  if v_expected_total_minor is not null
     and v_expected_total_minor <> v_new_total_minor then
    raise exception 'quote_changed' using errcode = '22000';
  end if;
  if v_new_total_minor < v_paid_minor then
    raise exception 'refund_required' using errcode = '22000';
  end if;
  v_new_balance_minor := v_new_total_minor - v_paid_minor;

  update public.orders
  set manual_order_mode = coalesce(manual_order_mode, 'quick_sale'),
      operator_reference = case when v_fulfillment = 'table'
        then nullif(p_patch ->> 'operatorReference', '')
        else null end,
      total_minor = v_new_total_minor,
      subtotal_minor = public.order_major_to_minor_v1(coalesce(subtotal, 0), v_currency),
      discount_total_minor = public.order_major_to_minor_v1(coalesce(discount_total, 0), v_currency),
      delivery_fee_minor = case when v_fulfillment = 'delivery'
        then public.order_major_to_minor_v1(coalesce(delivery_fee, 0), v_currency)
        else 0 end,
      payment_balance_minor = v_new_balance_minor,
      payment_status = case
        when v_new_balance_minor = 0 then 'paid'
        when v_paid_minor > 0 then 'partial'
        else 'pending'
      end,
      updated_at = now()
  where id = p_order_id;

  insert into public.order_line_events(
    order_id, order_line_id, company_id, event_type, metadata, created_by
  )
  select
    p_order_id,
    ol.id,
    v_order.company_id,
    'fulfillment_changed',
    jsonb_build_object(
      'previousOrderType', v_order.order_type,
      'newFulfillment', v_fulfillment
    ),
    auth.uid()
  from public.order_lines ol
  where ol.order_id = p_order_id
    and coalesce(v_order.order_type, '') is distinct from v_order_type
  order by ol.created_at
  limit 1
  on conflict do nothing;

  select jsonb_build_object(
    'order', to_jsonb(o.*),
    'lines', coalesce((
      select jsonb_agg(to_jsonb(ol.*) order by ol.created_at)
      from public.order_lines ol where ol.order_id = p_order_id
    ), '[]'::jsonb),
    'previousTotalMinor', v_previous_total_minor,
    'newTotalMinor', v_new_total_minor,
    'paymentBalanceMinor', v_new_balance_minor
  )
  into v_result
  from public.orders o where o.id = p_order_id;

  insert into public.order_transaction_requests(
    company_id, client_request_id, operation, order_id, result
  ) values (
    v_order.company_id, p_client_request_id, 'update_v3', p_order_id, v_result
  );
  return v_result;
end;
$function$;
