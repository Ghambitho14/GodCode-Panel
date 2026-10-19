import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase', () => ({
	TABLES: { orders: 'orders' },
	supabase: { from: vi.fn() },
}));
vi.mock('@/shared/utils/supabaseStorage', () => ({ isStorageObjectReference: () => false }));
vi.mock('@/modules/cash/admin/pages/AdminProvider', () => ({
	useAdmin: () => ({
		cashSystem: null,
		markOrderSessionPaid: null,
		closeOrderSession: null,
		orders: [],
		hydrateOrderItems: null,
		companyProfile: null,
	}),
}));
vi.mock('@/modules/cash/hooks/useOrderMoney', () => ({
	useOrderMoney: () => ({
		exchangeRate: null,
		formatMoney: (value) => `$${Number(value || 0)}`,
		formatOrderAmount: ({ amountUsd }) => `$${Number(amountUsd || 0)}`,
	}),
}));
vi.mock('@/modules/cash/admin/utils/receiptPrinting', () => ({ printOrderTicket: vi.fn() }));
vi.mock('@/modules/cash/services/clientPiiService', () => ({ revealOrderContact: vi.fn(async (o) => o) }));
vi.mock('@/modules/cash/components/ManualOrderModal', () => ({ default: () => null }));
vi.mock('@/modules/cash/components/OrderDetailModal', () => ({ default: () => null }));
vi.mock('@/modules/cash/components/CloseTableModal', () => ({ default: () => null }));

import OrderCard from '@/modules/cash/components/OrderCard';
import { AdminConfirmDialogHost } from '@/modules/cash/components/AdminConfirmDialog';

const order = {
	id: 'order-uuid-1',
	shift_sequence: 200,
	status: 'pending',
	client_name: 'Cliente Test',
	created_at: new Date().toISOString(),
	total: 10000,
	items: [{ name: 'Roll', quantity: 1, price: 10000 }],
};

// En el panel el host vive en Admin.jsx; aquí se monta al lado de la tarjeta.
const renderCard = (moveOrder) => render(
	<>
		<OrderCard order={order} queueIndex={1} moveOrder={moveOrder} showNotify={vi.fn()} />
		<AdminConfirmDialogHost />
	</>,
);

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('OrderCard: cancelar pedido con confirmación dentro del panel', () => {
	it('no usa window.confirm y cancela solo al confirmar', async () => {
		const confirmSpy = vi.spyOn(window, 'confirm');
		const moveOrder = vi.fn();
		const user = userEvent.setup();
		renderCard(moveOrder);

		await user.click(screen.getByTitle('Cancelar Pedido'));

		const dialog = await screen.findByRole('dialog', { name: '¿Cancelar el pedido #200?' });
		expect(dialog).toHaveAccessibleDescription(
			'Si el pedido tiene venta registrada en caja, se aplicará una devolución automática.',
		);
		expect(confirmSpy).not.toHaveBeenCalled();
		expect(moveOrder).not.toHaveBeenCalled();
		// El foco arranca en la opción segura.
		await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Volver' })).toHaveFocus());

		await user.click(within(dialog).getByRole('button', { name: 'Cancelar pedido' }));

		await waitFor(() => expect(moveOrder).toHaveBeenCalledTimes(1));
		expect(moveOrder).toHaveBeenCalledWith('order-uuid-1', 'cancelled');
		await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
		expect(confirmSpy).not.toHaveBeenCalled();
	});

	it('"Volver", Escape o tocar fuera cierran sin cancelar el pedido', async () => {
		const moveOrder = vi.fn();
		const user = userEvent.setup();
		renderCard(moveOrder);
		const cancelButton = screen.getByTitle('Cancelar Pedido');

		await user.click(cancelButton);
		await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Volver' }));
		await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
		await waitFor(() => expect(cancelButton).toHaveFocus());

		await user.click(cancelButton);
		await screen.findByRole('dialog');
		await user.keyboard('{Escape}');
		await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

		await user.click(cancelButton);
		const dialog = await screen.findByRole('dialog');
		await user.click(dialog.parentElement);
		await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

		expect(moveOrder).not.toHaveBeenCalled();
	});

	it('mantiene el foco dentro de la confirmación con Tab', async () => {
		const user = userEvent.setup();
		renderCard(vi.fn());

		await user.click(screen.getByTitle('Cancelar Pedido'));
		const dialog = await screen.findByRole('dialog');
		const back = within(dialog).getByRole('button', { name: 'Volver' });
		const confirm = within(dialog).getByRole('button', { name: 'Cancelar pedido' });
		await waitFor(() => expect(back).toHaveFocus());

		await user.tab();
		expect(confirm).toHaveFocus();
		await user.tab();
		expect(back).toHaveFocus();
		await user.tab({ shift: true });
		expect(confirm).toHaveFocus();
	});
});
