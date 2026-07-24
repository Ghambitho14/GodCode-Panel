import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
	resolve('supabase/migrations/20260723235900_fix_named_area_delivery_fee_resolution.sql'),
	'utf8',
);

describe('named-area delivery fee migration', () => {
	it('uses the configured zone fee without requiring a privileged override', () => {
		expect(sql).toContain("v_settings -> 'namedAreas'");
		expect(sql).toContain("p_delivery_address ->> 'named_area_id'");
		expect(sql).toContain('return round(v_configured_fee, 2)');
	});

	it('preserves the existing resolver for distance and external delivery', () => {
		expect(sql).toContain('resolve_delivery_fee_for_role_legacy_v1');
		expect(sql).toContain('return public.resolve_delivery_fee_for_role_legacy_v1');
	});

	it('keeps manual overrides restricted to privileged roles', () => {
		expect(sql).toContain("p_manual_override is true and v_role in ('owner', 'admin', 'ceo')");
	});
});
