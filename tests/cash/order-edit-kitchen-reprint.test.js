import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

/*
 * Editar un pedido que ya está en cocina saca otra comanda «MODIFICADO», tanto si
 * se guarda por `update_order_v3` (pedidos de caja) como por `update_order_transaction`
 * (pedidos antiguos): un pedido que entró como retiro y se pasó a delivery seguía con
 * «RETIRO» en la comanda.
 */

const quote = vi.fn();
const updateOrderV3 = vi.fn();
const updateOrderLegacy = vi.fn();
const fetchOrderWithItems = vi.fn();
const printOrderTicket = vi.fn();

vi.mock('@/integrations/supabase', () => ({
	supabase: { from: vi.fn(), rpc: vi.fn() },
	TABLES: new Proxy({}, { get: (_target, key) => String(key) }),
}));
vi.mock('@/shared/utils/supabaseStorage', () => ({ validateImageFile: () => ({ valid: true }) }));
vi.mock('@/modules/cash/admin/orders/services/orders', () => ({
	ordersService: { updateOrder: (...args) => updateOrderLegacy(...args), replaceOrderReceipt: vi.fn() },
}));
vi.mock('@/modules/cash/services/manualOrderV2Service', () => ({
	manualOrderV2Service: {
		quote: (...args) => quote(...args),
		listEvidence: vi.fn(async () => []),
		recordMetric: vi.fn(),
	},
}));
vi.mock('@/modules/cash/services/orderLifecycleV3Service', () => ({
	orderLifecycleV3Service: { updateOrder: (...args) => updateOrderV3(...args) },
}));
vi.mock('@/modules/cash/services/paymentEvidenceOutbox', () => ({
	queuePaymentEvidence: vi.fn(),
	uploadQueuedPaymentEvidence: vi.fn(),
}));
vi.mock('@/modules/cash/services/clientPiiService', () => ({ revealOrderContact: vi.fn() }));
vi.mock('@/modules/cash/services/clientService', () => ({
	deliveryFieldsFromClientRecord: () => null,
	maybeSaveClientDefaultDeliveryAddress: vi.fn(async () => null),
}));
vi.mock('@/modules/cash/services/analyticsService', () => ({
	fetchOrderWithItems: (...args) => fetchOrderWithItems(...args),
}));
vi.mock('@/modules/cash/admin/printing/printOrderTicket', () => ({
	printOrderTicket: (...args) => printOrderTicket(...args),
}));

import { useOrderEdit } from '@/modules/cash/hooks/useOrderEdit';

const BRANCH = { id: 'branch-1', company_id: 'company-1', name: 'Centro', address: 'Av. Uno 123', currency: 'CLP', country: 'CL' };
const PIZZA = { id: 'prod-pizza', name: 'Pizza Napolitana', price: 6000, has_discount: false, discount_price: null };
const BEBIDA = { id: 'prod-bebida', name: 'Bebida', price: 1500, has_discount: false, discount_price: null };

function savedOrder({ status = 'active', manualOrderMode = 'quick_sale', withLineIds = true } = {}) {
	return {
		id: 501,
		company_id: 'company-1',
		total: 6000,
		total_minor: 6000,
		manual_order_mode: manualOrderMode,
		status,
		updated_at: '2026-10-17T21:19:00.000Z',
		currency: 'CLP',
		channel: 'pickup',
		order_type: 'sale',
		delivery_fee: 0,
		delivery_address: null,
		client_name: 'Ana',
		payment_type: 'pendiente',
		items: [{ ...PIZZA, quantity: 1, ...(withLineIds ? { line_id: 'line-1' } : {}) }],
	};
}

function renderEdit(order) {
	const showNotify = vi.fn();
	const hook = renderHook(() => useOrderEdit(showNotify, vi.fn(), vi.fn(), BRANCH, null, order, null, 'cashier', 'CL'));
	return { ...hook, showNotify };
}

async function save(result) {
	await waitFor(() => expect(result.current.couponPreview.loading).toBe(false));
	await act(async () => { await result.current.submitOrder(); });
}

beforeEach(() => {
	quote.mockReset();
	quote.mockResolvedValue({ totalMinor: 6000 });
	updateOrderV3.mockReset();
	updateOrderLegacy.mockReset();
	fetchOrderWithItems.mockReset();
	printOrderTicket.mockReset();
	vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('comanda MODIFICADO al editar un pedido en cocina', () => {
	it('update_order_v3: un retiro que quedó como delivery sale otra vez a cocina, marcado', async () => {
		const order = savedOrder();
		updateOrderV3.mockResolvedValue({ order: { id: 501, status: 'active' } });
		const saved = { ...order, channel: 'delivery', delivery_fee: 2000, delivery_address: { address: 'Av. Siempre Viva 742' } };
		fetchOrderWithItems.mockResolvedValue(saved);

		const { result, showNotify } = renderEdit(order);
		await save(result);

		expect(updateOrderV3).toHaveBeenCalledTimes(1);
		expect(fetchOrderWithItems).toHaveBeenCalledWith({ orderId: 501, companyId: 'company-1' });
		expect(printOrderTicket).toHaveBeenCalledTimes(1);
		expect(printOrderTicket).toHaveBeenCalledWith(saved, 'Centro', null, {
			variant: 'kitchen',
			branchAddress: 'Av. Uno 123',
			branch: BRANCH,
			modified: true,
		});
		expect(showNotify).toHaveBeenCalledWith('Pedido actualizado.', 'success');
	});

	it('update_order_v3: con el pedido todavía en Entrada no se imprime nada', async () => {
		updateOrderV3.mockResolvedValue({ order: { id: 501, status: 'pending' } });
		const { result } = renderEdit(savedOrder({ status: 'pending' }));
		act(() => result.current.addItem(BEBIDA));
		await save(result);

		expect(updateOrderV3).toHaveBeenCalledTimes(1);
		expect(fetchOrderWithItems).not.toHaveBeenCalled();
		expect(printOrderTicket).not.toHaveBeenCalled();
	});

	it('update_order_transaction: agregar un producto en cocina saca una sola comanda marcada', async () => {
		const order = savedOrder({ manualOrderMode: null, withLineIds: false });
		updateOrderLegacy.mockResolvedValue({ ...order, total: 7500 });
		const saved = { ...order, total: 7500, items: [...order.items, { ...BEBIDA, quantity: 1 }] };
		fetchOrderWithItems.mockResolvedValue(saved);

		const { result } = renderEdit(order);
		act(() => result.current.addItem(BEBIDA));
		await save(result);

		expect(updateOrderV3).not.toHaveBeenCalled();
		expect(updateOrderLegacy).toHaveBeenCalledTimes(1);
		expect(updateOrderLegacy.mock.calls[0][2]).toMatchObject({ itemsChanged: true });
		expect(printOrderTicket).toHaveBeenCalledTimes(1);
		expect(printOrderTicket.mock.calls[0][0]).toBe(saved);
		expect(printOrderTicket.mock.calls[0][3]).toMatchObject({ variant: 'kitchen', modified: true });
	});

	it('update_order_transaction: cambiar solo el nombre en cocina no reimprime', async () => {
		const order = savedOrder({ manualOrderMode: null, withLineIds: false });
		updateOrderLegacy.mockResolvedValue(order);
		fetchOrderWithItems.mockResolvedValue({ ...order, client_name: 'Ana María' });

		const { result } = renderEdit(order);
		await save(result);

		expect(updateOrderLegacy).toHaveBeenCalledTimes(1);
		expect(printOrderTicket).not.toHaveBeenCalled();
	});
});
