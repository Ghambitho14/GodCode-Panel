import React from 'react';
import { cleanup, render, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/cash/hooks/useBranchMoney', () => ({
	useBranchMoney: () => ({
		currency: 'USD',
		locale: 'es-VE',
		fractionDigits: 2,
		formatMoney: (n) => `USD ${Number(n || 0).toFixed(2)}`,
		formatMoneyPlain: (n) => String(n),
	}),
}));
vi.mock('@/shared/hooks/useLockBodyScroll', () => ({ useLockBodyScroll: () => {} }));

import LocalExpenseModal from '@/modules/cash/components/expenses/LocalExpenseModal';

const amountInput = () => document.getElementById('local-expense-amount');

const submitWith = async (value) => {
	fireEvent.change(amountInput(), { target: { value } });
	const desc = [...document.querySelectorAll('textarea, input')]
		.find((el) => el.id && el.id !== 'local-expense-amount' && /desc/i.test(el.id));
	fireEvent.change(desc, { target: { value: 'Bolsas y servilletas' } });
	fireEvent.submit(document.querySelector('form'));
};

/**
 * Gastos del local arrastraba dos fallos a la vez: parseFloat se comia los
 * centimos, y el input era type="number" SIN step, asi que el step por defecto
 * de 1 hacia que el navegador rechazase cualquier gasto con decimales.
 */
describe('gastos del local con coma decimal', () => {
	let onConfirmOperating;
	beforeEach(() => {
		onConfirmOperating = vi.fn().mockResolvedValue(true);
		render(
			<LocalExpenseModal
				isOpen
				onClose={() => {}}
				branchId="b1"
				branchName="Horno 1"
				activeShift={{ id: 's1' }}
				onConfirmOperating={onConfirmOperating}
				showNotify={() => {}}
				companyId="c1"
			/>,
		);
	});
	afterEach(() => cleanup());

	it('registra los centimos cuando se escribe con coma', async () => {
		await submitWith('15,20');
		await waitFor(() => expect(onConfirmOperating).toHaveBeenCalled());
		expect(onConfirmOperating.mock.calls[0][1]).toBe(15.2);
	});

	it('el punto sigue funcionando igual', async () => {
		await submitWith('15.20');
		await waitFor(() => expect(onConfirmOperating).toHaveBeenCalled());
		expect(onConfirmOperating.mock.calls[0][1]).toBe(15.2);
	});

	it('el campo acepta decimales: era type=number sin step y los rechazaba', () => {
		const input = amountInput();
		fireEvent.change(input, { target: { value: '15,20' } });
		expect(input.getAttribute('type')).toBe('text');
		expect(input.getAttribute('inputmode')).toBe('decimal');
		expect(input.validity.stepMismatch).toBe(false);
		expect(input.value).toBe('15,20');
	});

	it('no registra un importe invalido', async () => {
		await submitWith('abc');
		expect(onConfirmOperating).not.toHaveBeenCalled();
	});
});
