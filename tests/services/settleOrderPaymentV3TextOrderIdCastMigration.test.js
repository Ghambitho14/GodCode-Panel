import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
	resolve('supabase/migrations/20260724130000_fix_settle_order_payment_v3_text_order_id_cast.sql'),
	'utf8',
);

describe('settle_order_payment_v3 text order_id cast migration', () => {
	it('casts bigint p_order_id when comparing against order_payment_evidence.order_id', () => {
		expect(sql).toContain('where e.order_id = p_order_id::text');
		expect(sql).not.toMatch(/where e\.order_id = p_order_id[^:]/);
	});

	it('casts bigint p_order_id when inserting into order_payment_lines', () => {
		expect(sql).toContain('insert into public.order_payment_lines');
		expect(sql).toContain('p_order_id::text');
	});

	it('persists client_line_id when inserting payment lines', () => {
		expect(sql).toContain('client_line_id');
		expect(sql).toContain("coalesce(nullif(v_line ->> 'id', ''), v_line_id::text)");
	});

	it('casts exchange_rate to numeric when inserting payment lines', () => {
		expect(sql).toContain("nullif(v_line ->> 'exchangeRate', '')::numeric");
	});

	it('keeps bigint order_id for orders and cash movements', () => {
		expect(sql).toContain('from public.orders where id = p_order_id for update');
		expect(sql).toContain("'Cobro pedido #' || p_order_id, 'card', p_order_id");
		expect(sql).toContain("'settle_v3', p_order_id, v_result");
	});
});
