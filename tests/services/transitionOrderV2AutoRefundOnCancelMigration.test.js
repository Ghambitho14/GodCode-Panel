import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
	resolve('supabase/migrations/20260724150000_fix_transition_order_v2_auto_refund_on_cancel.sql'),
	'utf8',
);

describe('transition_order_v2 auto refund on cancel migration', () => {
	it('refunds remaining payment lines instead of raising refund_required', () => {
		expect(sql).toContain('insert into public.order_payment_refunds');
		expect(sql).toContain('public.cash_add_movement');
		expect(sql).toContain("'Cancelación automática'");
		expect(sql).not.toContain("raise exception 'refund_required'");
	});

	it('still blocks cancel when no open cash shift and payment remains', () => {
		expect(sql).toContain("raise exception 'cash_shift_required'");
	});

	it('keeps optimistic locking on status transition', () => {
		expect(sql).toContain('p_expected_updated_at is null or o.updated_at = p_expected_updated_at');
		expect(sql).toContain("raise exception 'order_changed_or_not_allowed'");
	});
});
