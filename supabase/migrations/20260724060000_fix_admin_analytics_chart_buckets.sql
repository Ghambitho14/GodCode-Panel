-- Fix analytics charts: period summary must return by_day/by_hour/payments/branches,
-- handle open-ended ranges (rolling 7/15/30), and map Tienda/Online like the panel.

create or replace function public._admin_analytics_period_summary(
  p_company_id uuid,
  p_branch_id uuid,
  p_start timestamp with time zone,
  p_end timestamp with time zone,
  p_channel text default null,
  p_include_time_buckets boolean default true
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_orders bigint := 0;
  v_total_sales numeric := 0;
  v_delivery_total numeric := 0;
  v_delivery_count bigint := 0;
  v_by_day jsonb := '{}'::jsonb;
  v_by_hour jsonb := '{}'::jsonb;
  v_by_branch jsonb := '[]'::jsonb;
  v_payment jsonb := '{"cash":0,"card":0,"online":0}'::jsonb;
  v_channel text := nullif(lower(btrim(coalesce(p_channel, ''))), '');
begin
  if v_channel in ('', 'all') then
    v_channel := null;
  end if;

  with scoped as (
    select
      o.id,
      o.branch_id,
      o.total,
      o.delivery_fee,
      o.created_at,
      o.payment_type,
      o.payment_method_specific,
      o.payment_breakdown,
      coalesce(nullif(btrim(o.payment_method_specific), ''), '') <> '' as is_menu_online
    from public.orders o
    where o.company_id = p_company_id
      and (p_branch_id is null or o.branch_id = p_branch_id)
      and (p_start is null or o.created_at >= p_start)
      and (p_end is null or o.created_at < p_end)
      and o.status is distinct from 'cancelled'
      and (
        v_channel is null
        or (v_channel = 'online' and coalesce(nullif(btrim(o.payment_method_specific), ''), '') <> '')
        or (v_channel = 'store' and coalesce(nullif(btrim(o.payment_method_specific), ''), '') = '')
      )
  )
  select
    count(*)::bigint,
    coalesce(sum(total), 0),
    coalesce(sum(case when coalesce(delivery_fee, 0) > 0 then delivery_fee else 0 end), 0),
    count(*) filter (where coalesce(delivery_fee, 0) > 0)
  into v_orders, v_total_sales, v_delivery_total, v_delivery_count
  from scoped;

  if p_include_time_buckets then
    with scoped as (
      select o.created_at, o.total
      from public.orders o
      where o.company_id = p_company_id
        and (p_branch_id is null or o.branch_id = p_branch_id)
        and (p_start is null or o.created_at >= p_start)
        and (p_end is null or o.created_at < p_end)
        and o.status is distinct from 'cancelled'
        and (
          v_channel is null
          or (v_channel = 'online' and coalesce(nullif(btrim(o.payment_method_specific), ''), '') <> '')
          or (v_channel = 'store' and coalesce(nullif(btrim(o.payment_method_specific), ''), '') = '')
        )
    ),
    by_day as (
      select
        to_char((timezone('America/Santiago', created_at))::date, 'YYYY-MM-DD') as day_key,
        sum(total) as total
      from scoped
      group by 1
    )
    select coalesce(jsonb_object_agg(day_key, total), '{}'::jsonb)
    into v_by_day
    from by_day;

    with scoped as (
      select o.created_at, o.total
      from public.orders o
      where o.company_id = p_company_id
        and (p_branch_id is null or o.branch_id = p_branch_id)
        and (p_start is null or o.created_at >= p_start)
        and (p_end is null or o.created_at < p_end)
        and o.status is distinct from 'cancelled'
        and (
          v_channel is null
          or (v_channel = 'online' and coalesce(nullif(btrim(o.payment_method_specific), ''), '') <> '')
          or (v_channel = 'store' and coalesce(nullif(btrim(o.payment_method_specific), ''), '') = '')
        )
    ),
    by_hour as (
      select
        extract(hour from timezone('America/Santiago', created_at))::int as hour_key,
        count(*)::numeric as cnt
      from scoped
      group by 1
    )
    select coalesce(jsonb_object_agg(hour_key::text, cnt), '{}'::jsonb)
    into v_by_hour
    from by_hour;
  end if;

  with scoped as (
    select o.branch_id, o.total
    from public.orders o
    where o.company_id = p_company_id
      and (p_branch_id is null or o.branch_id = p_branch_id)
      and (p_start is null or o.created_at >= p_start)
      and (p_end is null or o.created_at < p_end)
      and o.status is distinct from 'cancelled'
      and (
        v_channel is null
        or (v_channel = 'online' and coalesce(nullif(btrim(o.payment_method_specific), ''), '') <> '')
        or (v_channel = 'store' and coalesce(nullif(btrim(o.payment_method_specific), ''), '') = '')
      )
  ),
  agg as (
    select
      coalesce(branch_id::text, '_sin_asignar_') as branch_id,
      coalesce(sum(total), 0) as total,
      count(*)::int as count
    from scoped
    group by 1
  )
  select coalesce(
    jsonb_agg(jsonb_build_object('branch_id', branch_id, 'total', total, 'count', count) order by total desc),
    '[]'::jsonb
  )
  into v_by_branch
  from agg;

  with scoped as (
    select
      o.total,
      public.order_analytics_payment_breakdown(
        o.payment_type,
        o.payment_method_specific,
        o.payment_breakdown,
        o.total
      ) as bd
    from public.orders o
    where o.company_id = p_company_id
      and (p_branch_id is null or o.branch_id = p_branch_id)
      and (p_start is null or o.created_at >= p_start)
      and (p_end is null or o.created_at < p_end)
      and o.status is distinct from 'cancelled'
      and (
        v_channel is null
        or (v_channel = 'online' and coalesce(nullif(btrim(o.payment_method_specific), ''), '') <> '')
        or (v_channel = 'store' and coalesce(nullif(btrim(o.payment_method_specific), ''), '') = '')
      )
  )
  select jsonb_build_object(
    'cash', coalesce(sum((bd->>'cash')::numeric), 0),
    'card', coalesce(sum((bd->>'card')::numeric), 0),
    'online', coalesce(sum((bd->>'online')::numeric), 0)
  )
  into v_payment
  from scoped;

  return jsonb_build_object(
    'order_count', v_orders,
    'orders', v_orders,
    'total_sales', v_total_sales,
    'delivery_total', v_delivery_total,
    'delivery_count', v_delivery_count,
    'by_day', v_by_day,
    'by_hour', v_by_hour,
    'by_branch', v_by_branch,
    'payment_breakdown', v_payment
  );
end;
$function$;

create or replace function public.admin_analytics_summary(
  p_company_id uuid,
  p_branch_id uuid,
  p_start timestamp with time zone,
  p_end timestamp with time zone,
  p_prev_start timestamp with time zone,
  p_prev_end timestamp with time zone,
  p_channel text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_current jsonb;
  v_previous jsonb;
begin
  v_current := public._admin_analytics_period_summary(
    p_company_id, p_branch_id, p_start, p_end, p_channel, true
  );
  v_previous := public._admin_analytics_period_summary(
    p_company_id, p_branch_id, p_prev_start, p_prev_end, p_channel, true
  );

  return jsonb_build_object(
    'current', v_current,
    'previous', v_previous,
    'orders_variation', case
      when coalesce((v_previous->>'order_count')::numeric, 0) > 0
      then round(
        (
          coalesce((v_current->>'order_count')::numeric, 0)
          - coalesce((v_previous->>'order_count')::numeric, 0)
        ) / (v_previous->>'order_count')::numeric * 100,
        1
      )
      else null
    end,
    'sales_variation', case
      when coalesce((v_previous->>'total_sales')::numeric, 0) > 0
      then round(
        (
          coalesce((v_current->>'total_sales')::numeric, 0)
          - coalesce((v_previous->>'total_sales')::numeric, 0)
        ) / (v_previous->>'total_sales')::numeric * 100,
        1
      )
      else null
    end
  );
end;
$function$;

grant execute on function public._admin_analytics_period_summary(uuid, uuid, timestamptz, timestamptz, text, boolean) to authenticated, anon;
grant execute on function public.admin_analytics_summary(uuid, uuid, timestamptz, timestamptz, timestamptz, timestamptz, text) to authenticated, anon;
