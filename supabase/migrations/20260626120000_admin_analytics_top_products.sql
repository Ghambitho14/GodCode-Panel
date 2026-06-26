-- Top productos agregados en servidor (evita traer items en bulk al panel de analytics).

CREATE OR REPLACE FUNCTION public.admin_analytics_top_products(
  p_company_id uuid,
  p_branch_id uuid DEFAULT NULL,
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL,
  p_limit int DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_company_id uuid;
  v_limit int;
  v_result jsonb;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_required' USING errcode = '22000';
  END IF;

  SELECT u.company_id
  INTO v_user_company_id
  FROM public.users u
  WHERE u.auth_user_id = auth.uid()
    AND coalesce(u.is_active, true) = true
  LIMIT 1;

  IF v_user_company_id IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING errcode = '42501';
  END IF;

  IF p_company_id IS DISTINCT FROM v_user_company_id THEN
    RAISE EXCEPTION 'company_not_allowed' USING errcode = '42501';
  END IF;

  v_limit := greatest(1, least(coalesce(p_limit, 5), 50));

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', agg.product_name,
        'qty', agg.qty,
        'revenue', agg.revenue
      )
      ORDER BY agg.qty DESC, agg.product_name ASC
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM (
    SELECT
      split_part(coalesce(nullif(btrim(item->>'name'), ''), 'Desconocido'), ' (', 1) AS product_name,
      sum(greatest(coalesce((item->>'quantity')::int, 1), 1))::bigint AS qty,
      sum(
        coalesce((item->>'price')::numeric, 0)
        * greatest(coalesce((item->>'quantity')::int, 1), 1)
      ) AS revenue
    FROM public.orders o
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN o.items IS NULL OR jsonb_typeof(o.items) <> 'array' THEN '[]'::jsonb
        ELSE o.items
      END
    ) AS item
    WHERE o.company_id = p_company_id
      AND o.status IS DISTINCT FROM 'cancelled'
      AND (p_branch_id IS NULL OR o.branch_id = p_branch_id)
      AND (p_start IS NULL OR o.created_at >= p_start)
      AND (p_end IS NULL OR o.created_at < p_end)
    GROUP BY 1
    ORDER BY qty DESC, product_name ASC
    LIMIT v_limit
  ) AS agg;

  RETURN coalesce(v_result, '[]'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_analytics_top_products(uuid, uuid, timestamptz, timestamptz, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_analytics_top_products(uuid, uuid, timestamptz, timestamptz, int) TO authenticated;
