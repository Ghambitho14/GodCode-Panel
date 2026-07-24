-- Keep cash_shifts.expected_balance in sync with physical cash movements.
-- Balance Esperado = opening_balance + cash sales/incomes − cash expenses.

create or replace function public.recalculate_cash_shift_totals_v1(p_shift_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.cash_shifts cs
  set total_sales = coalesce((
        select sum(case when cm.type = 'sale' then cm.amount else 0 end)
        from public.cash_movements cm where cm.shift_id = p_shift_id
      ), 0),
      total_cash = coalesce((
        select sum(case when cm.type = 'sale' and cm.payment_method = 'cash'
          then cm.amount else 0 end)
        from public.cash_movements cm where cm.shift_id = p_shift_id
      ), 0),
      total_card = coalesce((
        select sum(case when cm.type = 'sale' and cm.payment_method = 'card'
          then cm.amount else 0 end)
        from public.cash_movements cm where cm.shift_id = p_shift_id
      ), 0),
      total_online = coalesce((
        select sum(case when cm.type = 'sale' and cm.payment_method = 'online'
          then cm.amount else 0 end)
        from public.cash_movements cm where cm.shift_id = p_shift_id
      ), 0),
      expected_balance = coalesce(cs.opening_balance, 0) + coalesce((
        select sum(
          case
            when cm.payment_method = 'cash' and cm.type = 'expense' then -cm.amount
            when cm.payment_method = 'cash' then cm.amount
            else 0
          end
        )
        from public.cash_movements cm where cm.shift_id = p_shift_id
      ), 0)
  where cs.id = p_shift_id;
end;
$function$;

create or replace function public.cash_add_movement(
  p_shift_id uuid,
  p_type text,
  p_amount numeric,
  p_description text,
  p_payment_method text default null,
  p_order_id bigint default null,
  p_expense_kind text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_movement public.cash_movements;
  v_user_id uuid;
  v_company_id uuid;
  v_expense_kind text;
begin
  if not (public.is_admin() or public.is_ceo() or public.is_cashier()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_shift_id is null then
    raise exception 'shift_required' using errcode = '22000';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount_invalid' using errcode = '22000';
  end if;

  v_expense_kind := nullif(trim(p_expense_kind), '');

  if p_type = 'expense' and p_order_id is null then
    if v_expense_kind is not null and v_expense_kind not in ('operating', 'cash_withdrawal') then
      raise exception 'expense_kind_invalid' using errcode = '22000';
    end if;
    if v_expense_kind = 'cash_withdrawal' and coalesce(p_payment_method, '') <> 'cash' then
      raise exception 'cash_withdrawal_requires_cash' using errcode = '22000';
    end if;
  else
    v_expense_kind := null;
  end if;

  select id, company_id into v_user_id, v_company_id
  from public.users
  where auth_user_id = auth.uid()
  limit 1;

  if not exists (
    select 1 from public.cash_shifts where id = p_shift_id for update
  ) then
    raise exception 'shift_not_found' using errcode = 'P0002';
  end if;

  insert into public.cash_movements (
    shift_id, order_id, company_id, created_by,
    type, amount, payment_method, description, expense_kind
  ) values (
    p_shift_id, p_order_id, v_company_id, v_user_id,
    p_type, p_amount, p_payment_method, p_description, v_expense_kind
  )
  returning * into v_movement;

  perform public.recalculate_cash_shift_totals_v1(p_shift_id);

  return to_jsonb(v_movement);
end;
$function$;

-- Backfill open shifts so expected_balance matches the ledger.
select public.recalculate_cash_shift_totals_v1(s.id)
from public.cash_shifts s
where s.status = 'open';
