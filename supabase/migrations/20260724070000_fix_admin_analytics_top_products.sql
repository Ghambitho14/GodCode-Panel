drop function if exists public.admin_analytics_top_products(uuid, uuid, timestamptz, timestamptz, int);

create or replace function public.admin_analytics_top_products(
  p_company_id uuid,
  p_branch_id uuid default null,
  p_start timestamptz default null,
  p_end timestamptz default null,
  p_limit int default 5
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_limit int;
  v_result jsonb;
begin
  if p_company_id is null then
    raise exception 'company_required' using errcode = '22000';
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 5), 50));

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', agg.product_name,
        'qty', agg.qty,
        'revenue', agg.revenue
      )
      order by agg.qty desc, agg.product_name asc
    ),
    '[]'::jsonb
  )
  into v_result
  from (
    select
      split_part(coalesce(nullif(btrim(item->>'name'), ''), 'Desconocido'), ' (', 1) as product_name,
      sum(greatest(coalesce((item->>'quantity')::numeric, 1), 1))::bigint as qty,
      sum(
        greatest(coalesce((item->>'quantity')::numeric, 1), 1)
        * case
            when coalesce((item->>'has_discount')::boolean, false)
              and coalesce((item->>'discount_price')::numeric, 0) > 0
            then (item->>'discount_price')::numeric
            else coalesce((item->>'price')::numeric, 0)
          end
        + coalesce((item->>'extras_total')::numeric, 0)
      ) as revenue
    from public.orders o
    cross join lateral jsonb_array_elements(
      case
        when o.items is null or jsonb_typeof(o.items) <> 'array' then '[]'::jsonb
        else o.items
      end
    ) as item
    where o.company_id = p_company_id
      and o.status is distinct from 'cancelled'
      and (p_branch_id is null or o.branch_id = p_branch_id)
      and (p_start is null or o.created_at >= p_start)
      and (p_end is null or o.created_at < p_end)
      and coalesce(nullif(btrim(item->>'name'), ''), '') <> ''
    group by 1
    order by qty desc, product_name asc
    limit v_limit
  ) as agg;

  return coalesce(v_result, '[]'::jsonb);
end;
$function$;

revoke all on function public.admin_analytics_top_products(uuid, uuid, timestamptz, timestamptz, int) from public;
grant execute on function public.admin_analytics_top_products(uuid, uuid, timestamptz, timestamptz, int) to authenticated, anon;
