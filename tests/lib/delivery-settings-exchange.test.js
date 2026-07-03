import { describe, expect, it } from 'vitest';
import { normalizeDeliverySettings } from '@/lib/delivery-settings';

describe('delivery-settings exchangeRate', () => {
	it('parsea exchange_rate snake_case', () => {
		const normalized = normalizeDeliverySettings({ exchange_rate: 639.703 });
		expect(normalized.exchangeRate).toBe(639.703);
	});

	it('ignora tasas inválidas', () => {
		const normalized = normalizeDeliverySettings({ exchangeRate: -5 });
		expect(normalized.exchangeRate).toBeNull();
	});
});
