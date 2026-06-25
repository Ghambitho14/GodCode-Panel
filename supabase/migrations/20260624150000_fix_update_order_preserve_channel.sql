-- Cobro / entrega: no reescribir channel ni delivery al actualizar pago (evita colisión en orders_shift_group_sequence_uidx).

CREATE OR REPLACE FUNCTION public.update_order_transaction(
  p_order_id bigint,
  p_client_name text,
  p_client_phone text,
  p_client_rut text,
  p_items jsonb,
  p_payment_type text,
  p_note text,
  p_order_type text,
  p_delivery_address jsonb DEFAULT NULL::jsonb,
  p_delivery_fee numeric DEFAULT 0,
  p_coupon_code text DEFAULT NULL::text,
  p_payment_breakdown jsonb DEFAULT NULL::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_role text;
  v_user_company_id uuid;
  v_order public.orders%ROWTYPE;
  v_normalized jsonb;
  v_items jsonb;
  v_subtotal numeric;
  v_net numeric;
  v_tax_total numeric := 0;
  v_discount_amount numeric := 0;
  v_coupon_id uuid;
  v_coupon_result jsonb;
  v_delivery_fee numeric := 0;
  v_final_total numeric;
  v_fulfillment text;
  v_channel text;
  v_payment_breakdown jsonb;
  v_updated jsonb;
  v_addr jsonb;
  v_canonical_phone text;
  v_client_id uuid;
  v_delivery_km numeric;
  v_tax_rate numeric;
  v_tax_included boolean;
  v_currency text;
  v_preserve_fulfillment boolean;
BEGIN
  SELECT lower(btrim(u.role)), u.company_id
  INTO v_user_role, v_user_company_id
  FROM public.users u
  WHERE u.auth_user_id = auth.uid() AND coalesce(u.is_active, true) = true
  LIMIT 1;

  IF v_user_company_id IS NULL THEN RAISE EXCEPTION 'auth_required' USING errcode = '42501'; END IF;
  IF v_user_role IS NULL OR v_user_role NOT IN ('owner', 'admin', 'ceo', 'cashier') THEN
    RAISE EXCEPTION 'order_edit_not_allowed' USING errcode = '42501';
  END IF;

  SELECT o.* INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id AND o.company_id = v_user_company_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found_or_not_allowed' USING errcode = '42501'; END IF;

  SELECT t.tax_rate, t.tax_included, t.currency
  INTO v_tax_rate, v_tax_included, v_currency
  FROM public.resolve_branch_tax_settings(v_order.branch_id) t;

  v_canonical_phone := public.format_cl_phone_display(p_client_phone);
  v_client_id := v_order.client_id;

  v_normalized := public.validate_and_normalize_order_items(v_order.branch_id, p_items);
  v_items := v_normalized -> 'items';
  v_subtotal := (v_normalized ->> 'subtotal')::numeric;

  v_coupon_result := public.compute_order_coupon_discount(
    v_order.company_id, p_coupon_code, v_subtotal, v_canonical_phone, p_order_id
  );
  v_discount_amount := coalesce((v_coupon_result ->> 'discount_amount')::numeric, 0);
  v_coupon_id := (v_coupon_result ->> 'coupon_id')::uuid;

  v_preserve_fulfillment := lower(btrim(coalesce(p_order_type, ''))) = 'sale';

  IF v_preserve_fulfillment THEN
    v_channel := v_order.channel;
    v_addr := v_order.delivery_address;
    v_delivery_fee := coalesce(v_order.delivery_fee, 0);
    IF coalesce(nullif(btrim(v_order.channel), ''), 'pickup') IN ('salon', 'mesa') THEN
      v_fulfillment := 'pickup';
    ELSIF v_order.delivery_address IS NOT NULL
      OR coalesce(v_order.delivery_fee, 0) > 0
      OR coalesce(nullif(btrim(v_order.channel), ''), 'pickup') = 'delivery' THEN
      v_fulfillment := 'delivery';
    ELSE
      v_fulfillment := 'pickup';
    END IF;
  ELSE
    v_fulfillment := lower(btrim(coalesce(nullif(btrim(p_order_type), ''), 'pickup')));
    IF v_fulfillment IN ('envio', 'envío', 'despacho') THEN v_fulfillment := 'delivery'; END IF;

    IF v_fulfillment = 'delivery' THEN
      v_addr := coalesce(p_delivery_address, v_order.delivery_address);
      v_delivery_fee := public.resolve_delivery_fee_for_role(
        v_user_role, v_order.branch_id, v_addr, v_subtotal, p_delivery_fee, NULL
      );
      v_channel := 'delivery';
    ELSIF v_fulfillment IN ('salon', 'mesa') THEN
      v_fulfillment := 'pickup';
      v_delivery_fee := 0;
      v_channel := 'salon';
      v_addr := NULL;
    ELSE
      v_fulfillment := 'pickup';
      v_delivery_fee := 0;
      v_channel := 'pickup';
      v_addr := NULL;
    END IF;
  END IF;

  v_net := round(greatest(0::numeric, v_subtotal - v_discount_amount), 2);
  v_tax_total := public.compute_order_tax(v_net, v_tax_rate, v_tax_included);
  IF coalesce(v_tax_included, true) THEN
    v_final_total := v_net;
  ELSE
    v_final_total := v_net + v_tax_total;
  END IF;
  IF v_fulfillment = 'delivery' THEN v_final_total := v_final_total + v_delivery_fee; END IF;
  v_final_total := round(v_final_total, 2);
  v_payment_breakdown := public.normalize_payment_breakdown_for_total(p_payment_breakdown, v_final_total);

  UPDATE public.orders o
  SET client_name = coalesce(p_client_name, o.client_name),
      client_phone = coalesce(v_canonical_phone, o.client_phone),
      client_rut = coalesce(p_client_rut, o.client_rut),
      items = v_items,
      subtotal = v_subtotal,
      tax_total = v_tax_total,
      discount_total = v_discount_amount,
      discount_coupon_id = v_coupon_id,
      total = v_final_total,
      currency = coalesce(v_currency, o.currency),
      payment_type = coalesce(p_payment_type, o.payment_type),
      note = coalesce(p_note, o.note),
      channel = v_channel,
      delivery_address = CASE WHEN v_fulfillment = 'delivery' THEN v_addr ELSE NULL END,
      delivery_fee = CASE WHEN v_fulfillment = 'delivery' THEN v_delivery_fee ELSE 0 END,
      payment_breakdown = v_payment_breakdown,
      updated_at = now()
  WHERE o.id = p_order_id;

  IF v_client_id IS NOT NULL THEN
    UPDATE public.clients
    SET name = coalesce(p_client_name, name),
        rut = CASE WHEN length(p_client_rut) > 6 THEN p_client_rut ELSE rut END,
        updated_at = now()
    WHERE id = v_client_id AND company_id = v_user_company_id;
  END IF;

  IF v_fulfillment = 'delivery' AND v_client_id IS NOT NULL AND v_addr IS NOT NULL THEN
    v_delivery_km := NULL;
    IF v_addr ? 'delivery_km' THEN
      v_delivery_km := NULLIF((v_addr ->> 'delivery_km')::numeric, 0);
    END IF;
    PERFORM public.upsert_client_delivery_address(
      v_client_id, v_user_company_id, v_addr, v_delivery_km
    );
  END IF;

  SELECT to_jsonb(o.*) INTO v_updated FROM public.orders o WHERE o.id = p_order_id;
  RETURN v_updated;
END;
$function$;
