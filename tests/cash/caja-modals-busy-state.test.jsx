import React from 'react';
import { cleanup, render, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/cash/hooks/useBranchMoney', () => ({
	useBranchMoney: () => ({
		currency: 'USD', locale: 'es-VE', fractionDigits: 2,
		formatMoney: (n) => `USD ${Number(n || 0).toFixed(2)}`,
		formatMoneyPlain: (n) => String(n),
	}),
}));
vi.mock('@/modules/cash/hooks/useOrderMoney', () => ({
	useOrderMoney: () => ({ formatOrderAmount: (n) => String(n) }),
}));
vi.mock('@/shared/hooks/useLockBodyScroll', () => ({ useLockBodyScroll: () => {} }));

import CashMovementModal from '@/modules/cash/components/caja/CashMovementModal';
import CashShiftModal from '@/modules/cash/components/caja/CashShiftModal';

const set = (id, value) => fireEvent.change(document.getElementById(id), { target: { value } });
const submit = () => fireEvent.submit(document.querySelector('form'));

/**
 * Los dos modales de dinero llamaban a onConfirm SIN await y cerraban el
 * dialogo de inmediato. onConfirm es asincrono y devuelve false si falla, asi
 * que un fallo dejaba al cajero creyendo que la operacion se habia guardado.
 */
describe('estado ocupado en los modales de caja', () => {
	afterEach(() => cleanup());

	describe('movimientos de caja', () => {
		const fill = () => {
			set('cash-movement-amount', '25,50');
			const desc = [...document.querySelectorAll('input,textarea')]
				.find((el) => el.id !== 'cash-movement-amount');
			fireEvent.change(desc, { target: { value: 'Compra de insumos' } });
		};

		it('no cierra el dialogo si la operacion falla', async () => {
			const onClose = vi.fn();
			const onConfirm = vi.fn().mockResolvedValue(false);
			render(<CashMovementModal isOpen variant="income" onClose={onClose} onConfirm={onConfirm} />);
			fill();
			submit();
			await waitFor(() => expect(onConfirm).toHaveBeenCalled());
			expect(onClose).not.toHaveBeenCalled();
		});

		it('cierra el dialogo cuando la operacion sale bien', async () => {
			const onClose = vi.fn();
			const onConfirm = vi.fn().mockResolvedValue(true);
			render(<CashMovementModal isOpen variant="income" onClose={onClose} onConfirm={onConfirm} />);
			fill();
			submit();
			await waitFor(() => expect(onClose).toHaveBeenCalled());
		});

		it('no envia dos veces si se pulsa repetido', async () => {
			let resolver;
			const onConfirm = vi.fn(() => new Promise((r) => { resolver = r; }));
			render(<CashMovementModal isOpen variant="income" onClose={() => {}} onConfirm={onConfirm} />);
			fill();
			submit();
			submit();
			submit();
			expect(onConfirm).toHaveBeenCalledTimes(1);
			resolver(true);
		});
	});

	describe('cierre de turno', () => {
		const activeShift = { id: 's1', branch_id: 'b1', opening_balance: 0, opened_at: new Date().toISOString() };
		const getTotals = () => ({ cashBalanceDelta: 0, card: 0, online: 0 });

		const renderClose = (onConfirm, onClose = () => {}) =>
			render(
				<CashShiftModal
					isOpen type="close" onClose={onClose} onConfirm={onConfirm}
					activeShift={activeShift} movements={[]} getTotals={getTotals} orders={[]}
				/>,
			);

		const fillCounts = () => {
			set('counted-cash', '0');
			set('counted-card', '0');
			set('counted-online', '0');
		};

		it('no cierra el dialogo si el cierre falla', async () => {
			const onClose = vi.fn();
			const onConfirm = vi.fn().mockResolvedValue(false);
			renderClose(onConfirm, onClose);
			fillCounts();
			submit();
			await waitFor(() => expect(onConfirm).toHaveBeenCalled());
			expect(onClose).not.toHaveBeenCalled();
		});

		it('cierra el dialogo cuando el cierre sale bien', async () => {
			const onClose = vi.fn();
			renderClose(vi.fn().mockResolvedValue(true), onClose);
			fillCounts();
			submit();
			await waitFor(() => expect(onClose).toHaveBeenCalled());
		});
	});
});
