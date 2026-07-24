import { describe, expect, it } from 'vitest';

import { computeShiftTotals } from '@/modules/cash/utils/cashTotals';
import { getExpectedByMethod } from '@/modules/cash/utils/shiftCloseReconciliation';

describe('balance esperado de caja', () => {
	it('suma a la apertura solamente los cobros que físicamente entran en efectivo', () => {
		const totals = computeShiftTotals([
			{ type: 'sale', amount: 118_920, payment_method: 'cash' },
			{ type: 'sale', amount: 86_960, payment_method: 'card' },
		]);

		expect(totals.income).toBe(205_880);
		expect(totals.cashBalanceDelta).toBe(118_920);
		expect(getExpectedByMethod(totals, {
			opening_balance: 1_000,
			expected_balance: 1_000,
		}).cash).toBe(119_920);
	});

	it('incluye ingresos manuales en efectivo y resta retiros físicos', () => {
		const totals = computeShiftTotals([
			{ type: 'sale', amount: 20_000, payment_method: 'cash' },
			{ type: 'income', amount: 5_000, payment_method: 'cash' },
			{ type: 'expense', amount: 3_000, payment_method: 'cash', expense_kind: 'cash_withdrawal' },
			{ type: 'expense', amount: 7_000, payment_method: 'card' },
		]);

		expect(totals.cashBalanceDelta).toBe(22_000);
		expect(getExpectedByMethod(totals, { opening_balance: 1_000 }).cash).toBe(23_000);
	});
});

