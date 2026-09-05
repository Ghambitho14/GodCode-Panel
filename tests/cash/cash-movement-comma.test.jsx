import React from 'react';
import { cleanup, render, fireEvent } from '@testing-library/react';
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

import CashMovementModal from '@/modules/cash/components/caja/CashMovementModal';

const typeInto = (id, value) =>
	fireEvent.change(document.getElementById(id), { target: { value } });

const fill = (amount) => {
	typeInto('cash-movement-amount', amount);
	const desc = document.querySelector('textarea, input#cash-movement-description')
		|| [...document.querySelectorAll('input,textarea')].find((el) => el.id !== 'cash-movement-amount');
	fireEvent.change(desc, { target: { value: 'Compra de insumos' } });
	fireEvent.submit(document.querySelector('form'));
};

/**
 * Ingresos y egresos de caja tenian el mismo fallo que el cierre: parseFloat
 * sobre un importe tecleado se come los centimos ("15,20" -> 15).
 */
describe('movimientos de caja con coma decimal', () => {
	let onConfirm;
	beforeEach(() => {
		onConfirm = vi.fn();
		render(<CashMovementModal isOpen variant="income" onClose={() => {}} onConfirm={onConfirm} />);
	});
	afterEach(() => cleanup());

	it('registra los centimos cuando se escribe con coma', () => {
		fill('15,20');
		expect(onConfirm).toHaveBeenCalled();
		expect(onConfirm.mock.calls[0][1]).toBe(15.2);
	});

	it('el punto sigue funcionando igual', () => {
		fill('15.20');
		expect(onConfirm.mock.calls[0][1]).toBe(15.2);
	});

	it('parseFloat daba 15: por eso no se usa', () => {
		expect(parseFloat('15,20')).toBe(15);
	});

	it('el campo permite teclear la coma', () => {
		const input = document.getElementById('cash-movement-amount');
		typeInto('cash-movement-amount', '15,20');
		expect(input.getAttribute('type')).toBe('text');
		expect(input.getAttribute('inputmode')).toBe('decimal');
		expect(input.value).toBe('15,20');
	});

	it('no registra un importe invalido', () => {
		fill('abc');
		expect(onConfirm).not.toHaveBeenCalled();
	});
});
