-- validate_and_normalize_order_items reconstruia cada item sin `line_id`.
-- ensure_order_lines_v3 empareja las order_lines por ese `line_id`, asi que
-- al editar un pedido:
--   * si alguna linea ya estaba en preparacion o lista, guard_prepared_order_lines_v3
--     rechazaba la edicion con order_line_quantity_locked (no se podia agregar
--     delivery ni productos a un pedido "listo");
--   * si ninguna lo estaba, todas las lineas se anulaban y se recreaban,
--     perdiendo el estado de cocina.
-- Ahora el `line_id` recibido se conserva en el item normalizado.

CREATE OR REPLACE FUNCTION public.validate_and_normalize_order_items(p_branch_id uuid, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_delivery_settings jsonb;
  v_item jsonb;
  v_item_id text;
  v_product_id uuid;
  v_qty integer;
  v_name text;
  v_price numeric;
  v_has_discount boolean;
  v_discount_price numeric;
  v_unit_price numeric;
  v_extras_total numeric;
  v_manual_source text;
  v_is_extra boolean;
  v_note text;
  v_description text;
  v_catalog_row jsonb;
  v_catalog_price numeric;
  v_client_price numeric;
  v_line_id text;
  v_items jsonb := '[]'::jsonb;
  v_subtotal numeric := 0;
  v_force_catalog boolean;
begin
  if p_branch_id is null then raise exception 'branch_required' using errcode = '22000'; end if;
  if p_items is null or jsonb_array_length(p_items) is null or jsonb_array_length(p_items) = 0 then raise exception 'items_required' using errcode = '22000'; end if;

  select b.delivery_settings into v_delivery_settings from public.branches b where b.id = p_branch_id;

  for v_item in select value from jsonb_array_elements(p_items) as t(value) loop
    v_item_id := btrim(coalesce(v_item ->> 'id', ''));
    if v_item_id = '' then raise exception 'invalid_item_price' using errcode = '22000'; end if;

    v_qty := greatest(1, coalesce((v_item ->> 'quantity')::integer, 1));
    v_manual_source := lower(btrim(coalesce(v_item ->> 'manual_order_source', '')));
    v_is_extra := coalesce((v_item ->> 'is_extra')::boolean, false);
    v_note := nullif(btrim(coalesce(v_item ->> 'note', '')), '');
    if v_note is not null and length(v_note) > 140 then v_note := left(v_note, 140); end if;
    v_description := nullif(btrim(coalesce(v_item ->> 'description', '')), '');
    v_extras_total := greatest(0, coalesce((v_item ->> 'extras_total')::numeric, 0));
    v_client_price := (v_item ->> 'price')::numeric;
    v_line_id := nullif(btrim(coalesce(v_item ->> 'line_id', v_item ->> 'lineId', '')), '');

    v_force_catalog := not public.is_valid_uuid(v_item_id) or v_is_extra or v_manual_source in ('extras', 'beverages');

    v_product_id := null; v_name := null; v_price := null; v_has_discount := false; v_discount_price := null;

    if not v_force_catalog and public.is_valid_uuid(v_item_id) then
      v_product_id := v_item_id::uuid;
      select p.name, pp.price, pp.has_discount, pp.discount_price
      into v_name, v_price, v_has_discount, v_discount_price
      from public.product_prices pp
      join public.products p on p.id = pp.product_id
      join public.product_branch pb on pb.product_id = pp.product_id
      where pp.product_id = v_product_id and pp.branch_id = p_branch_id and pp.is_active = true and pb.branch_id = p_branch_id and pb.is_active = true;
      if v_price is null then raise exception 'invalid_item_price' using errcode = '22000'; end if;
    else
      v_catalog_row := public.lookup_cart_upsell_catalog_row(coalesce(v_delivery_settings, '{}'::jsonb), v_item_id);
      if v_catalog_row is null then raise exception 'invalid_item_price' using errcode = '22000'; end if;
      v_name := coalesce(nullif(btrim(v_catalog_row ->> 'name'), ''), 'Extra');
      v_catalog_price := (v_catalog_row ->> 'price')::numeric;
      if v_catalog_price is null or v_catalog_price < 0 then raise exception 'invalid_item_price' using errcode = '22000'; end if;
      v_price := v_catalog_price; v_has_discount := false; v_discount_price := null; v_product_id := null;
      if v_manual_source = '' then v_manual_source := case when v_is_extra then 'extras' else 'beverages' end; end if;
    end if;

    if v_client_price is not null and abs(v_client_price - v_price) > 0.01 then raise exception 'invalid_item_price' using errcode = '22000'; end if;

    v_unit_price := case when coalesce(v_has_discount, false) and v_discount_price is not null and v_discount_price > 0 then v_discount_price else v_price end;
    v_unit_price := greatest(0, v_unit_price + v_extras_total);
    v_subtotal := v_subtotal + (v_unit_price * v_qty);

    v_items := v_items || jsonb_build_array(
      jsonb_build_object('id', coalesce(v_product_id::text, v_item_id), 'name', coalesce(v_name, 'Producto'), 'quantity', v_qty, 'price', v_price, 'has_discount', coalesce(v_has_discount, false), 'discount_price', v_discount_price, 'extras_total', v_extras_total, 'extras', coalesce(v_item -> 'extras', '[]'::jsonb), 'description', v_description, 'note', v_note, 'manual_order_source', nullif(v_manual_source, ''), 'is_extra', v_is_extra or v_manual_source = 'extras')
      || case when v_line_id is not null then jsonb_build_object('line_id', v_line_id) else '{}'::jsonb end
    );
  end loop;

  if jsonb_array_length(v_items) = 0 then raise exception 'no_items_available' using errcode = '22000'; end if;
  return jsonb_build_object('items', v_items, 'subtotal', round(v_subtotal, 2));
end;
$function$;
