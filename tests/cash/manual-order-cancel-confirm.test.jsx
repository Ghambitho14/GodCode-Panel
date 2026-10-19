import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const hookResult = {
	manualOrder: {
		items: [{ id: 'item-1', name: 'Producto', price: 10, quantity: 1 }],
		client_name: '',
		note: '',
		coupon_code: '',
		order_type: 'pickup',
		local_fulfillment_mode: 'retiro',
		v2Enabled: false,
	},
	loading: false,
	rutValid: true,
	phoneValid: true,
	receiptFile: null,
	receiptPreview: null,
	resetOrder: vi.fn(),
	draftSnapshot: null,
};

vi.mock('@/modules/cash/admin/pages/AdminProvider', () => ({
	useAdmin: () => ({
		userRole: 'ceo',
		userEmail: 'ceo@example.com',
		markOrderSessionPaid: null,
		orders: [],
		companyProfile: { country: 'CL', currency: 'CLP' },
	}),
}));
vi.mock('@/modules/cash/hooks/useManualOrder', () => ({ useManualOrder: () => hookResult }));
vi.mock('@/modules/cash/hooks/useOrderEdit', () => ({ useOrderEdit: () => hookResult }));
vi.mock('@/modules/cash/components/manual-order/useManualOrderBranchConfig', () => ({
	default: () => ({
		branchDeliveryCfg: null,
		branchDeliveryCfgLoading: false,
		branchConfigError: null,
		manualOrderSettings: null,
		paymentMethods: [],
		cartUpsellCatalogs: [],
		retryBranchConfig: vi.fn(),
	}),
}));
vi.mock('@/modules/cash/components/manual-order/ManualOrderCatalog', () => ({ default: () => null }));
vi.mock('@/modules/cash/components/CloseTableModal', () => ({ default: () => null }));
vi.mock('@/modules/cash/components/manual-order/ManualOrderCheckout', () => ({
	default: ({ handleCancelOrder }) => (
		<button type="button" onClick={handleCancelOrder}>Botón cancelar del editor</button>
	),
	DESKTOP_WIZARD_STEPS: 2,
	MOBILE_WIZARD_STEPS: 3,
	TABLET_WIZARD_STEPS: 2,
	useManualOrderCheckoutFlow: () => ({}),
}));
vi.mock('@/shared/hooks/useLockBodyScroll', () => ({ useLockBodyScroll: vi.fn() }));
vi.mock('@/shared/utils/money', () => ({ createMoneyFormatter: () => ({ formatMoney: vi.fn() }) }));
vi.mock('@/modules/cash/admin/utils/receiptPrinting', () => ({ printOrderTicket: vi.fn() }));
vi.mock('@/modules/cash/services/manualOrderDrafts', () => ({
	loadManualOrderDraft: vi.fn().mockResolvedValue(null),
	saveManualOrderDraft: vi.fn().mockResolvedValue(undefined),
	deleteManualOrderDraft: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/modules/cash/services/manualOrderV2Service', () => ({
	manualOrderV2Service: { recordMetric: vi.fn() },
}));

import ManualOrderModal from '@/modules/cash/components/ManualOrderModal';
import { AdminConfirmDialogHost } from '@/modules/cash/components/AdminConfirmDialog';

const branch = { id: 'branch-1', company_id: 'company-1', country: 'CL', currency: 'CLP' };
const editOrder = { id: 'order-9', shift_sequence: 42, status: 'active', items: hookResult.manualOrder.items };

// En el panel el host vive en Admin.jsx; aquí se monta al lado del editor.
const renderEditor = ({ moveOrder, onClose }) => render(
	<>
		<ManualOrderModal
			isOpen
			editOrder={editOrder}
			moveOrder={moveOrder}
			onClose={onClose}
			branch={branch}
			showNotify={vi.fn()}
		/>
		<AdminConfirmDialogHost />
	</>,
);

beforeAll(() => {
	window.matchMedia = vi.fn().mockImplementation((query) => ({
		matches: false,
		media: query,
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
	}));
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('editor de pedido: cancelar con confirmación dentro del panel', () => {
	it('Escape cierra solo la confirmación, sin cancelar ni cerrar el editor', async () => {
		const confirmSpy = vi.spyOn(window, 'confirm');
		const moveOrder = vi.fn().mockResolvedValue(true);
		const onClose = vi.fn();
		const user = userEvent.setup();
		renderEditor({ moveOrder, onClose });

		await user.click(await screen.findByRole('button', { name: 'Botón cancelar del editor' }));
		const dialog = await screen.findByRole('dialog', { name: '¿Cancelar el pedido #42?' });
		expect(within(dialog).getByText(/Estado actual: En cocina\./)).toBeInTheDocument();
		expect(confirmSpy).not.toHaveBeenCalled();

		await user.keyboard('{Escape}');

		await waitFor(() => expect(screen.queryByRole('dialog', { name: '¿Cancelar el pedido #42?' })).not.toBeInTheDocument());
		// El Escape no llegó al editor: no abrió su propio "¿Cerrar este pedido?".
		expect(screen.queryByText('¿Cerrar este pedido?')).not.toBeInTheDocument();
		expect(moveOrder).not.toHaveBeenCalled();
		expect(onClose).not.toHaveBeenCalled();
	});

	it('al confirmar cancela el pedido y cierra el editor', async () => {
		const moveOrder = vi.fn().mockResolvedValue(true);
		const onClose = vi.fn();
		const user = userEvent.setup();
		renderEditor({ moveOrder, onClose });

		await user.click(await screen.findByRole('button', { name: 'Botón cancelar del editor' }));
		const dialog = await screen.findByRole('dialog', { name: '¿Cancelar el pedido #42?' });
		await user.click(within(dialog).getByRole('button', { name: 'Cancelar pedido' }));

		await waitFor(() => expect(moveOrder).toHaveBeenCalledWith('order-9', 'cancelled'));
		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		expect(screen.queryByRole('dialog', { name: '¿Cancelar el pedido #42?' })).not.toBeInTheDocument();
	});
});
