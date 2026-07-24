-- Auto-refund payment lines when cancelling a paid manual order (V2).
--
-- transition_order_v2 previously blocked cancel with refund_required when
-- order_payment_lines had balance but order_payment_refunds did not. Legacy
-- cancel already reversed cash; align V2 by refunding remaining lines here.

create or replace function public.transition_order_v2(
  p_order_id text,
  p_status text,
  p_expected_updated_at timestamp with time zone default null::timestamp with time zone
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor jsonb := public.manual_order_actor();
  v_order jsonb;
  v_order_row public.orders%rowtype;
  v_company uuid;
  v_paid bigint;
  v_refunded bigint;
  v_shift uuid;
  v_digits integer;
  v_line record;
  v_line_refunded bigint;
  v_remaining bigint;
begin
  if v_actor is null then
    raise exception 'auth_required';
  end if;
  if p_status not in ('pending', 'active', 'completed', 'picked_up', 'cancelled') then
    raise exception 'invalid_status';
  end if;

  v_company := (v_actor->>'company_id')::uuid;

  if p_status = 'cancelled' then
    select * into v_order_row
    from public.orders o
    where o.id::text = p_order_id
      and o.company_id::text = v_actor->>'company_id'
      and public.manual_order_branch_allowed(v_actor, o.branch_id)
    for update;

    if not found then
      raise exception 'order_changed_or_not_allowed';
    end if;

    select coalesce(sum(amount_minor), 0) into v_paid
    from public.order_payment_lines
    where company_id = v_company and order_id = p_order_id;

    select coalesce(sum(amount_minor), 0) into v_refunded
    from public.order_payment_refunds
    where company_id = v_company and order_id = p_order_id;

    if v_paid > v_refunded then
      select cs.id into v_shift
      from public.cash_shifts cs
      where cs.branch_id = v_order_row.branch_id
        and cs.company_id = v_order_row.company_id
        and cs.status = 'open'
      order by cs.opened_at desc
      limit 1
      for update;

      if v_shift is null then
        raise exception 'cash_shift_required';
      end if;

      v_digits := public.manual_order_currency_digits(v_order_row.currency, null);

      for v_line in
        select *
        from public.order_payment_lines
        where company_id = v_company and order_id = p_order_id
      loop
        select coalesce(sum(amount_minor), 0) into v_line_refunded
        from public.order_payment_refunds
        where company_id = v_company
          and order_id = p_order_id
          and payment_line_id = v_line.id;

        v_remaining := v_line.amount_minor - v_line_refunded;
        if v_remaining <= 0 then
          continue;
        end if;

        perform public.cash_add_movement(
          v_shift,
          'expense',
          v_remaining::numeric / power(10::numeric, v_digits),
          'Devolución pedido #' || p_order_id,
          v_line.rail,
          v_order_row.id
        );

        insert into public.order_payment_refunds(
          company_id,
          order_id,
          client_request_id,
          payment_line_id,
          amount_minor,
          currency,
          reason,
          authorized_by
        ) values (
          v_company,
          p_order_id,
          gen_random_uuid(),
          v_line.id,
          v_remaining,
          v_order_row.currency,
          'Cancelación automática',
          auth.uid()
        );

        update public.cash_movements
        set amount_minor = v_remaining,
            currency = v_order_row.currency
        where id = (
          select cm.id
          from public.cash_movements cm
          where cm.shift_id = v_shift
            and cm.order_id = v_order_row.id
            and cm.amount_minor is null
          order by cm.created_at desc
          limit 1
        );
      end loop;
    end if;
  end if;

  update public.orders o
  set status = p_status,
      updated_at = now()
  where o.id::text = p_order_id
    and o.company_id::text = v_actor->>'company_id'
    and public.manual_order_branch_allowed(v_actor, o.branch_id)
    and (p_expected_updated_at is null or o.updated_at = p_expected_updated_at)
  returning to_jsonb(o) into v_order;

  if v_order is null then
    raise exception 'order_changed_or_not_allowed';
  end if;

  return v_order;
end;
$function$;
