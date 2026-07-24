import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
	resolve('supabase/migrations/20260724140000_fix_create_manual_order_atomic_client_line_id.sql'),
	'utf8',
);

describe('create_manual_order_atomic_v1 client_line_id migration', () => {
	it('inserts client_line_id when registering payment lines', () => {
		expect(sql).toContain('insert into public.order_payment_lines');
		expect(sql).toContain('client_line_id');
		expect(sql).toContain("coalesce(nullif(line ->> 'id', ''), gen_random_uuid()::text)");
	});

	it('casts bigint v_order_id to text for order_payment_lines.order_id', () => {
		expect(sql).toContain('v_order_id::text');
	});

	it('keeps cash movements and order updates on bigint order id', () => {
		expect(sql).toContain("'Venta pedido #' || v_order_id, 'card', v_order_id");
		expect(sql).toContain('where o.id = v_order_id');
		expect(sql).toContain("payment_status = case when p_register_payment then 'paid' else 'pending' end");
	});
});
