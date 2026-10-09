import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

/*
 * Editar un pedido con tamaños: cada tamaño es su propia línea, lo que se agrega desde
 * la caja cae en la línea de ese tamaño y a `update_order_v3` va el producto como `id`
 * con `size_id`. La cotización V2 no conoce tamaños: con esas líneas vale el total local.
 */

const quote = vi.fn();
const updateOrder = vi.fn();

vi.mock('@/integrations/supabase', () => ({
	supabase: { from: vi.fn(), rpc: vi.fn() },
	TABLES: new Proxy({}, { get: (_target, key) => String(key) }),
}));
vi.mock('@/shared/utils/supabaseStorage', () => ({ validateImageFile: () => ({ valid: true }) }));
vi.mock('@/modules/cash/admin/orders/services/orders', () => ({
	ordersService: { updateOrder: vi.fn(), replaceOrderReceipt: vi.fn() },
}));
vi.mock('@/modules/cash/services/manualOrderV2Service', () => ({
	manualOrderV2Service: {
		quote: (...args) => quote(...args),
		listEvidence: vi.fn(async () => []),
		recordMetric: vi.fn(),
	},
}));
vi.mock('@/modules/cash/services/orderLifecycleV3Service', () => ({
	orderLifecycleV3Service: { updateOrder: (...args) => updateOrder(...args) },
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

import { useOrderEdit } from '@/modules/cash/hooks/useOrderEdit';
import { buildCartLineId } from '@/modules/cash/hooks/manual-order/cartLines';

const BRANCH = { id: 'branch-1', company_id: 'company-1', name: 'Centro', currency: 'CLP', country: 'CL' };
const PIZZA = { id: 'prod-pizza', name: 'Pizza Napolitana', price: 6000, has_discount: false, discount_price: null };
const FAMILIAR = { id: 'size-fam', name: 'Familiar', price: 12000 };
const MEDIANA = { id: 'size-med', name: 'Mediana', price: 9000 };

function savedOrder(items) {
	const total = items.reduce((sum, item) => sum + (item.price + (item.extras_total ?? 0)) * item.quantity, 0);
	return {
		id: 501,
		total,
		total_minor: total,
		manual_order_mode: 'quick_sale',
		status: 'pending',
		updated_at: '2026-10-09T10:00:00.000Z',
		currency: 'CLP',
		channel: 'pickup',
		order_type: 'pickup',
		client_name: 'Ana',
		payment_type: 'pendiente',
		items,
	};
}

function renderEdit(order) {
	const showNotify = vi.fn();
	const onSaved = vi.fn();
	const onClose = vi.fn();
	const hook = renderHook(() => useOrderEdit(showNotify, onSaved, onClose, BRANCH, null, order, null, 'cashier', 'CL'));
	return { ...hook, showNotify, onSaved, onClose };
}

beforeEach(() => {
	quote.mockReset();
	updateOrder.mockReset();
	updateOrder.mockResolvedValue({ order: { id: 501, status: 'pending' } });
	vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('editar un pedido con tamaños', () => {
	it('suma tamaños como líneas propias y guarda con size_id sin pasar por la cotización V2', async () => {
		const { result, showNotify, onSaved } = renderEdit(savedOrder([
			{ id: 'prod-pizza', size_id: 'size-fam', size_name: 'Familiar', name: 'Pizza Napolitana (Familiar)', price: 12000, quantity: 1, line_id: 'line-1' },
		]));
		await waitFor(() => expect(result.current.couponPreview.loading).toBe(false));

		expect(result.current.manualOrder.items[0]).toMatchObject({ id: buildCartLineId('prod-pizza', 'size-fam'), product_id: 'prod-pizza' });

		act(() => result.current.addItem(PIZZA, { size: MEDIANA }));
		act(() => result.current.addItem(PIZZA, { size: FAMILIAR }));
		expect(result.current.manualOrder.items.map((item) => [item.name, item.quantity])).toEqual([
			['Pizza Napolitana (Familiar)', 2],
			['Pizza Napolitana (Mediana)', 1],
		]);
		expect(result.current.manualOrder.total).toBe(33000);

		await act(async () => { await result.current.submitOrder(); });

		expect(quote).not.toHaveBeenCalled();
		expect(updateOrder).toHaveBeenCalledTimes(1);
		const { patch } = updateOrder.mock.calls[0][0];
		expect(patch.expectedTotalMinor).toBe(33000);
		expect(patch.items.map((item) => [item.id, item.size_id, item.line_id, item.quantity, item.price])).toEqual([
			['prod-pizza', 'size-fam', 'line-1', 2, 12000],
			['prod-pizza', 'size-med', null, 1, 9000],
		]);
		expect(showNotify).toHaveBeenCalledWith('Pedido actualizado.', 'success');
		expect(onSaved).toHaveBeenCalledWith({ id: 501, status: 'pending' });
	});

	it('sin tamaños ni variantes sigue usando la cotización V2 para el total esperado', async () => {
		quote.mockResolvedValue({ totalMinor: 6000 });
		const { result } = renderEdit(savedOrder([
			{ id: 'prod-pizza', name: 'Pizza Napolitana', price: 6000, quantity: 1, line_id: 'line-1' },
		]));
		await waitFor(() => expect(result.current.couponPreview.loading).toBe(false));

		await act(async () => { await result.current.submitOrder(); });

		expect(quote).toHaveBeenCalledTimes(1);
		expect(updateOrder.mock.calls[0][0].patch.expectedTotalMinor).toBe(6000);
		expect(updateOrder.mock.calls[0][0].patch.items[0]).not.toHaveProperty('size_id');
	});

	it('el subtotal incluye los cambios de cada línea, como el carrito nuevo', async () => {
		const { result } = renderEdit(savedOrder([
			{
				id: 'prod-pizza', size_id: 'size-med', name: 'Pizza Napolitana (Mediana)', price: 9000, quantity: 2, line_id: 'line-1',
				extras: [{ name: 'Agregar queso', price: 500, quantity: 1 }], extras_total: 500,
			},
		]));
		await waitFor(() => expect(result.current.couponPreview.loading).toBe(false));
		expect(result.current.manualOrder.total).toBe(19000);

		await act(async () => { await result.current.submitOrder(); });
		expect(updateOrder.mock.calls[0][0].patch.expectedTotalMinor).toBe(19000);
	});
});
