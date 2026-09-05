import React from 'react';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
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
vi.mock('@/modules/cash/hooks/useOrderMoney', () => ({
	useOrderMoney: () => ({ formatOrderAmount: (n) => String(n) }),
}));
vi.mock('@/shared/hooks/useLockBodyScroll', () => ({ useLockBodyScroll: () => {} }));

import CashShiftModal from '@/modules/cash/components/caja/CashShiftModal';

const activeShift = { id: 's1', branch_id: 'b1', opening_balance: 0, opened_at: new Date().toISOString() };
const getTotals = () => ({ cashBalanceDelta: 15.2, card: 0, online: 0 });

function renderClose(onConfirm) {
	return render(
		<CashShiftModal
			isOpen
			type="close"
			onClose={() => {}}
			onConfirm={onConfirm}
			activeShift={activeShift}
			movements={[]}
			getTotals={getTotals}
			orders={[]}
		/>,
	);
}

const typeInto = (id, value) => {
	const input = document.getElementById(id);
	fireEvent.change(input, { target: { value } });
	return input;
};

const submit = () => {
	fireEvent.submit(document.querySelector('form'));
};

describe('cierre de caja con coma decimal', () => {
	let onConfirm;
	beforeEach(() => {
		onConfirm = vi.fn();
	});
	afterEach(() => {
		cleanup();
	});

	it('acepta que el cajero escriba la coma y guarda los céntimos', () => {
		renderClose(onConfirm);
		typeInto('counted-cash', '15,20');
		typeInto('counted-card', '0');
		typeInto('counted-online', '0');
		submit();

		expect(onConfirm).toHaveBeenCalledWith({ cash: 15.2, card: 0, online: 0 });
	});

	it('el punto sigue funcionando igual', () => {
		renderClose(onConfirm);
		typeInto('counted-cash', '15.20');
		typeInto('counted-card', '0');
		typeInto('counted-online', '0');
		submit();

		expect(onConfirm).toHaveBeenCalledWith({ cash: 15.2, card: 0, online: 0 });
	});

	it('el campo permite teclear la coma (no es un input numérico)', () => {
		renderClose(onConfirm);
		const input = typeInto('counted-cash', '15,20');
		expect(input.getAttribute('type')).toBe('text');
		expect(input.getAttribute('inputmode')).toBe('decimal');
		expect(input.value).toBe('15,20');
	});

	it('"Usar esperado" rellena con coma y deja cerrar', () => {
		renderClose(onConfirm);
		fireEvent.click(screen.getByTitle('Copiar el monto esperado de Efectivo físico'));
		expect(document.getElementById('counted-cash').value).toBe('15,20');

		typeInto('counted-card', '0');
		typeInto('counted-online', '0');
		submit();
		expect(onConfirm).toHaveBeenCalledWith({ cash: 15.2, card: 0, online: 0 });
	});

	it('no cierra con un importe inválido', () => {
		renderClose(onConfirm);
		typeInto('counted-cash', 'abc');
		typeInto('counted-card', '0');
		typeInto('counted-online', '0');
		submit();

		expect(onConfirm).not.toHaveBeenCalled();
		expect(screen.getByText('Ingresa el efectivo físico contado')).toBeTruthy();
	});
});
