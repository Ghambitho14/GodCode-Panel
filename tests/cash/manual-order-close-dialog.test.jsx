import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	resetOrder: vi.fn(),
	loadDraft: vi.fn().mockResolvedValue(null),
	saveDraft: vi.fn().mockResolvedValue(undefined),
	deleteDraft: vi.fn().mockResolvedValue(undefined),
}));

const dirtyOrder = {
	items: [{ id: 'item-1', name: 'Producto', price: 10, quantity: 1 }],
	client_name: '',
	note: '',
	coupon_code: '',
	order_type: 'pickup',
	local_fulfillment_mode: 'retiro',
	v2Enabled: false,
};

const hookResult = {
	manualOrder: dirtyOrder,
	loading: false,
	rutValid: true,
	phoneValid: true,
	receiptFile: null,
	receiptPreview: null,
	resetOrder: mocks.resetOrder,
	draftSnapshot: null,
};

vi.mock('@/modules/cash/admin/pages/AdminProvider', () => ({
	useAdmin: () => ({
		userRole: 'owner',
		userEmail: 'owner@example.com',
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
	default: () => <button type="button">Contenido del pedido</button>,
	DESKTOP_WIZARD_STEPS: 2,
	MOBILE_WIZARD_STEPS: 3,
	TABLET_WIZARD_STEPS: 2,
	useManualOrderCheckoutFlow: () => ({}),
}));
vi.mock('@/shared/hooks/useLockBodyScroll', () => ({ useLockBodyScroll: vi.fn() }));
vi.mock('@/shared/utils/money', () => ({ createMoneyFormatter: () => ({ formatMoney: vi.fn() }) }));
vi.mock('@/modules/cash/admin/utils/receiptPrinting', () => ({ printOrderTicket: vi.fn() }));
vi.mock('@/modules/cash/services/manualOrderDrafts', () => ({
	loadManualOrderDraft: mocks.loadDraft,
	saveManualOrderDraft: mocks.saveDraft,
	deleteManualOrderDraft: mocks.deleteDraft,
}));
vi.mock('@/modules/cash/services/manualOrderV2Service', () => ({
	manualOrderV2Service: { recordMetric: vi.fn() },
}));

import ManualOrderModal from '@/modules/cash/components/ManualOrderModal';

const branch = { id: 'branch-1', company_id: 'company-1', country: 'CL', currency: 'CLP' };

const renderModal = (overrides = {}) => render(
	<ManualOrderModal
		isOpen
		onClose={vi.fn()}
		branch={branch}
		showNotify={vi.fn()}
		{...overrides}
	/>,
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
	vi.clearAllMocks();
	mocks.loadDraft.mockResolvedValue(null);
	mocks.saveDraft.mockResolvedValue(undefined);
	mocks.deleteDraft.mockResolvedValue(undefined);
});

describe('confirmación de cierre del pedido manual', () => {
	it('aísla el modal principal, contiene el foco y lo restaura al continuar', async () => {
		const user = userEvent.setup();
		const outsideTrigger = document.createElement('button');
		outsideTrigger.textContent = 'Abrir pedido';
		document.body.append(outsideTrigger);
		outsideTrigger.focus();

		const { rerender } = renderModal();
		const closeButton = await screen.findByRole('button', { name: 'Cerrar pedido manual' });
		closeButton.focus();
		await user.click(closeButton);

		const alertDialog = await screen.findByRole('alertdialog', { name: '¿Cerrar este pedido?' });
		const continueButton = screen.getByRole('button', { name: 'Continuar' });
		const baseOverlay = document.querySelector('.manual-order-overlay');

		expect(baseOverlay).toHaveAttribute('aria-hidden', 'true');
		expect(baseOverlay).toHaveAttribute('inert');
		expect(closeButton).toBeDisabled();
		expect(alertDialog).toHaveAttribute('aria-describedby', 'manual-order-close-description');
		await waitFor(() => expect(document.activeElement).toBe(continueButton));

		await user.tab();
		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cerrar con borrador' }));
		await user.tab({ shift: true });
		expect(document.activeElement).toBe(continueButton);

		await user.click(continueButton);
		await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
		await waitFor(() => expect(document.activeElement).toBe(closeButton));

		await user.click(closeButton);
		await waitFor(() => expect(screen.getByRole('alertdialog')).toBeInTheDocument());
		await user.keyboard('{Escape}');
		await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());

		rerender(
			<ManualOrderModal
				isOpen={false}
				onClose={vi.fn()}
				branch={branch}
				showNotify={vi.fn()}
			/>,
		);
		await waitFor(() => expect(document.activeElement).toBe(outsideTrigger));
		outsideTrigger.remove();
	});

	it('bloquea acciones repetidas mientras guarda el borrador', async () => {
		let resolveSave;
		mocks.saveDraft.mockImplementation(() => new Promise((resolve) => { resolveSave = resolve; }));
		const user = userEvent.setup();
		const onClose = vi.fn();
		renderModal({ onClose });

		await user.click(await screen.findByRole('button', { name: 'Cerrar pedido manual' }));
		await user.click(await screen.findByRole('button', { name: 'Cerrar con borrador' }));

		const alertDialog = screen.getByRole('alertdialog');
		expect(alertDialog).toHaveAttribute('aria-busy', 'true');
		expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled();
		expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled();
		await user.keyboard('{Escape}');
		expect(screen.getByRole('alertdialog')).toBeInTheDocument();
		expect(mocks.saveDraft).toHaveBeenCalledTimes(1);

		resolveSave();
		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
	});

	it('descarta el borrador y cierra mediante una sola acción', async () => {
		const user = userEvent.setup();
		const onClose = vi.fn();
		renderModal({ onClose });

		await user.click(await screen.findByRole('button', { name: 'Cerrar pedido manual' }));
		await user.click(await screen.findByRole('button', { name: 'Descartar' }));

		await waitFor(() => expect(mocks.deleteDraft).toHaveBeenCalledTimes(1));
		expect(mocks.resetOrder).toHaveBeenCalled();
		expect(onClose).toHaveBeenCalledTimes(1);
	});
});
