-- Prevent operational closure from bypassing settlement for manual-order V2.
-- Settlement RPCs update the balance before moving the order to picked_up,
-- so a legitimate atomic "charge and close" continues to work.

create or replace function public.guard_unpaid_manual_order_closure_v1()
returns trigger
language plpgsql
set search_path = public
as $$
declare
    v_is_unpaid boolean;
begin
    if new.status is not distinct from old.status
       or new.status <> 'picked_up'
       or coalesce(new.manual_order_mode, '') not in ('quick_sale', 'session') then
        return new;
    end if;

    v_is_unpaid := case
        when new.payment_balance_minor is not null
            then new.payment_balance_minor > 0
        when new.payment_status is not null
            then new.payment_status <> 'paid'
        else coalesce(new.payment_timing, '') = 'deferred'
             or lower(coalesce(new.payment_type, '')) = 'pendiente'
    end;

    if v_is_unpaid then
        raise exception 'order_payment_required'
            using errcode = 'P0001',
                  detail = 'A manual order with an outstanding balance cannot transition to picked_up.';
    end if;

    return new;
end;
$$;

drop trigger if exists orders_guard_unpaid_manual_order_closure_v1 on public.orders;

create trigger orders_guard_unpaid_manual_order_closure_v1
before update of status, payment_status, payment_balance_minor
on public.orders
for each row
execute function public.guard_unpaid_manual_order_closure_v1();

comment on function public.guard_unpaid_manual_order_closure_v1() is
'Blocks quick_sale/session orders from reaching picked_up while payment is pending. Settlement and close must occur atomically.';
