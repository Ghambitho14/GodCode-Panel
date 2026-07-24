import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
    resolve('supabase/migrations/20260723235930_guard_unpaid_manual_order_closure.sql'),
    'utf8',
);

describe('protección de cierre de pedidos manuales pendientes', () => {
    it('protege venta rápida y sesión al pasar a entregado', () => {
        expect(sql).toContain("new.status <> 'picked_up'");
        expect(sql).toContain("not in ('quick_sale', 'session')");
        expect(sql).toContain("lower(coalesce(new.channel, '')) <> 'online'");
        expect(sql).toContain('new.payment_balance_minor > 0');
        expect(sql).toContain("new.payment_status <> 'paid'");
        expect(sql).toContain("lower(coalesce(new.payment_type, '')) = 'pendiente'");
        expect(sql).toContain("raise exception 'order_payment_required'");
    });

    it('instala un trigger antes de actualizar el pedido', () => {
        expect(sql).toContain('create trigger orders_guard_unpaid_manual_order_closure_v1');
        expect(sql).toContain('before update of status, payment_status, payment_balance_minor');
        expect(sql).toContain('on public.orders');
    });
});
