import { describe, expect, it } from 'vitest';
import { normalizeManualOrderSettings, requirementsFor } from '../../src/modules/cash/domain/manual-order-settings';

describe('manual order settings', () => {
	it('has contextual defaults and an opt-in feature flag', () => {
		const settings = normalizeManualOrderSettings(null);
		expect(settings.enabled).toBe(false);
		expect(requirementsFor(settings, 'table').operatorReference).toBe(true);
		expect(requirementsFor(settings, 'pickup').name).toBe(true);
		expect(requirementsFor(settings, 'delivery')).toMatchObject({ name: true, phone: true, address: true, zone: true });
	});

	it('never allows immediate table settlement', () => {
		const settings = normalizeManualOrderSettings({ enabled: true, allowImmediateSessionPayment: { table: true, pickup: true } });
		expect(settings.allowImmediateSessionPayment).toEqual({ table: false, pickup: true, delivery: true });
	});
});
