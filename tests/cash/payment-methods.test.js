import { describe, expect, it } from 'vitest';
import {
	normalizePaymentMethods,
	settlementToAccountingMinor,
	validatePaymentLines,
	deriveLegacyPaymentFields,
} from '../../src/modules/cash/domain/payment-methods';

describe('manual order payment lines', () => {
	it('normalizes branch methods and combines arbitrary rails', () => {
		const methods = normalizePaymentMethods(['cash', 'card', 'zelle'], { accountingCurrency: 'USD' });
		const lines = [
			{ id: 'a', methodId: 'cash', amountMinor: 400, currency: 'USD' },
			{ id: 'b', methodId: 'card', amountMinor: 600, currency: 'USD' },
		];
		const result = validatePaymentLines(lines, { totalMinor: 1000, currency: 'USD' }, methods);
		expect(result.valid).toBe(true);
		expect(deriveLegacyPaymentFields(result.lines, 'USD')).toMatchObject({ payment_type: 'mixto', payment_method_specific: 'mixed' });
	});

	it('canonicalizes legacy aliases without duplicating a configured method', () => {
		const methods = normalizePaymentMethods(['tienda', 'cash', 'tarjeta'], { accountingCurrency: 'CLP' });
		expect(methods.map((method) => method.id)).toEqual(['cash', 'card']);
	});

	it('converts VES settlement using persisted decimal rate', () => {
		expect(settlementToAccountingMinor(36500, 'VES', 'USD', '36.5')).toBe(1000);
	});

	it('rejects a mismatch of one minor unit', () => {
		const methods = normalizePaymentMethods(['cash'], { accountingCurrency: 'USD' });
		const result = validatePaymentLines([{ id: 'a', methodId: 'cash', amountMinor: 999, currency: 'USD' }], { totalMinor: 1000, currency: 'USD' }, methods);
		expect(result.valid).toBe(false);
		expect(result.errors.at(-1)).toMatchObject({ code: 'total_mismatch', paidMinor: 999 });
	});

	it('computes cash change in the tender currency', () => {
		const methods = normalizePaymentMethods(['cash'], { accountingCurrency: 'USD' });
		const result = validatePaymentLines([
			{ id: 'cash', methodId: 'cash', amountMinor: 1050, currency: 'USD', tenderedAmountMinor: 2000 },
		], { totalMinor: 1050, currency: 'USD' }, methods);
		expect(result.valid).toBe(true);
		expect(result.lines[0]).toMatchObject({ tenderedAmountMinor: 2000, changeAmountMinor: 950, tenderedCurrency: 'USD' });
	});
});
