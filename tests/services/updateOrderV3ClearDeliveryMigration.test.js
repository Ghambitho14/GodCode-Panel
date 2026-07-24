import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
	resolve('supabase/migrations/20260724120000_fix_update_order_v3_clear_delivery_on_pickup.sql'),
	'utf8',
);

describe('update_order_v3 clears delivery on pickup', () => {
	it('derives newTotalMinor from the refreshed major total, not stale total_minor', () => {
		expect(sql).toContain('v_new_total_minor := public.order_major_to_minor_v1(v_current.total, v_currency)');
		expect(sql).not.toContain('coalesce(\n    v_current.total_minor');
		expect(sql).toContain('total_minor = v_new_total_minor');
	});

	it('forces fee 0 and empty delivery when fulfillment is pickup or table', () => {
		expect(sql).toContain("v_delivery := '{}'::jsonb");
		expect(sql).toContain('when v_fulfillment = \'delivery\' then coalesce((v_delivery ->> \'fee\')::numeric, 0)');
		expect(sql).toContain('else 0');
		expect(sql).toContain("p_order_type => v_order_type");
		expect(sql).toContain("when v_fulfillment = 'table' then 'salon'");
		expect(sql).toContain("else 'pickup'");
	});

	it('keeps optimistic locking, quote checks and fulfillment_changed events', () => {
		expect(sql).toContain('p_expected_updated_at');
		expect(sql).toContain("operation = 'update_v3'");
		expect(sql).toContain('public.update_order_transaction');
		expect(sql).toContain("raise exception 'quote_changed'");
		expect(sql).toContain("raise exception 'refund_required'");
		expect(sql).toContain("'fulfillment_changed'");
	});
});
