-- Named delivery areas were only respected when a privileged user explicitly
-- requested a manual override. That made create_order_transaction recompute a
-- zero delivery fee and reject an otherwise valid final total as
-- invalid_item_price.
--
-- Preserve the deployed resolver for distance/external strategies and wrap it
-- with server-authoritative named-area resolution.

do $$
begin
	if to_regprocedure(
		'public.resolve_delivery_fee_for_role_legacy_v1(text,uuid,jsonb,numeric,numeric,boolean)'
	) is null then
		alter function public.resolve_delivery_fee_for_role(
			text,
			uuid,
			jsonb,
			numeric,
			numeric,
			boolean
		) rename to resolve_delivery_fee_for_role_legacy_v1;
	end if;
end;
$$;

create or replace function public.resolve_delivery_fee_for_role(
	p_user_role text,
	p_branch_id uuid,
	p_delivery_address jsonb,
	p_subtotal numeric,
	p_requested_fee numeric,
	p_manual_override boolean default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $function$
declare
	v_settings jsonb;
	v_strategy text;
	v_named_areas jsonb;
	v_named_area_id text;
	v_configured_fee numeric;
	v_free_from numeric;
	v_minimum_subtotal numeric;
	v_role text := lower(btrim(coalesce(p_user_role, '')));
begin
	select coalesce(b.delivery_settings, '{}'::jsonb)
	into v_settings
	from public.branches b
	where b.id = p_branch_id;

	if not found then
		raise exception 'delivery_configuration_error' using errcode = '22000';
	end if;

	if coalesce((v_settings ->> 'enabled')::boolean, true) is false then
		raise exception 'delivery_disabled' using errcode = '22000';
	end if;

	v_named_areas := coalesce(
		v_settings -> 'namedAreas',
		v_settings -> 'named_areas',
		v_settings -> 'delivery_places',
		v_settings -> 'places',
		'[]'::jsonb
	);
	v_strategy := lower(coalesce(
		nullif(v_settings ->> 'deliveryPricingStrategy', ''),
		nullif(v_settings ->> 'delivery_pricing_strategy', ''),
		nullif(v_settings ->> 'pricingStrategy', ''),
		nullif(v_settings ->> 'pricing_mode', ''),
		case when jsonb_array_length(v_named_areas) > 0 then 'named_areas' else 'distance' end
	));

	if v_strategy in ('named_areas', 'namedareas')
		and jsonb_array_length(v_named_areas) > 0 then
		v_named_area_id := coalesce(
			nullif(btrim(p_delivery_address ->> 'named_area_id'), ''),
			nullif(btrim(p_delivery_address ->> 'namedAreaId'), ''),
			nullif(btrim(p_delivery_address ->> 'delivery_named_area_id'), ''),
			nullif(btrim(p_delivery_address ->> 'zone_id'), '')
		);

		if v_named_area_id is null then
			raise exception 'invalid_delivery_area' using errcode = '22000';
		end if;

		select coalesce(
			nullif(area ->> 'feeFlat', '')::numeric,
			nullif(area ->> 'fee_flat', '')::numeric,
			nullif(area ->> 'fee', '')::numeric
		)
		into v_configured_fee
		from jsonb_array_elements(v_named_areas) area
		where area ->> 'id' = v_named_area_id
		limit 1;

		if v_configured_fee is null or v_configured_fee < 0 then
			raise exception 'invalid_delivery_area' using errcode = '22000';
		end if;

		v_minimum_subtotal := coalesce(
			nullif(v_settings ->> 'minOrderSubtotal', '')::numeric,
			nullif(v_settings ->> 'min_order_subtotal', '')::numeric
		);
		if v_minimum_subtotal is not null
			and coalesce(p_subtotal, 0) < v_minimum_subtotal then
			raise exception 'delivery_minimum_subtotal' using errcode = '22000';
		end if;

		v_free_from := coalesce(
			nullif(v_settings ->> 'freeDeliveryFromSubtotal', '')::numeric,
			nullif(v_settings ->> 'free_delivery_from_subtotal', '')::numeric
		);
		if v_free_from is not null and coalesce(p_subtotal, 0) >= v_free_from then
			return 0;
		end if;

		-- A manual override remains restricted to the same privileged roles.
		-- Everyone else receives the exact server-configured zone fee.
		if p_manual_override is true and v_role in ('owner', 'admin', 'ceo') then
			if p_requested_fee is null or p_requested_fee < 0 then
				raise exception 'invalid_delivery_fee_override' using errcode = '22000';
			end if;
			return round(p_requested_fee, 2);
		end if;

		return round(v_configured_fee, 2);
	end if;

	return public.resolve_delivery_fee_for_role_legacy_v1(
		p_user_role,
		p_branch_id,
		p_delivery_address,
		p_subtotal,
		p_requested_fee,
		p_manual_override
	);
end;
$function$;

revoke all on function public.resolve_delivery_fee_for_role(
	text,
	uuid,
	jsonb,
	numeric,
	numeric,
	boolean
) from public;

grant execute on function public.resolve_delivery_fee_for_role(
	text,
	uuid,
	jsonb,
	numeric,
	numeric,
	boolean
) to authenticated, service_role;

comment on function public.resolve_delivery_fee_for_role(
	text,
	uuid,
	jsonb,
	numeric,
	numeric,
	boolean
) is 'Resolves named-area fees from branch settings; delegates distance/external pricing to the preserved legacy resolver.';
