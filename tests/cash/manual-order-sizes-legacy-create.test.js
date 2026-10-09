import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Pedido manual clásico (sin V2) con tamaños: `ordersService.createOrder` valida cada
 * línea contra la sucursal y manda a `create_manual_order_atomic_v1` (que llama a
 * `create_order_transaction` → `validate_and_normalize_order_items`) el producto como
 * `id`, el tamaño en `size_id` y su precio.
 */

const tableResults = new Map();
const queryCalls = [];
const atomicCreate = vi.fn();

function queryBuilder(table) {
	const builder = {
		select: (...args) => { queryCalls.push([table, 'select', ...args]); return builder; },
		eq: (...args) => { queryCalls.push([table, 'eq', ...args]); return builder; },
		in: (...args) => { queryCalls.push([table, 'in', ...args]); return builder; },
		maybeSingle: () => Promise.resolve(tableResults.get(table) ?? { data: null, error: null }),
		then: (resolve, reject) => Promise.resolve(tableResults.get(table) ?? { data: [], error: null }).then(resolve, reject),
	};
	return builder;
}

vi.mock('@/integrations/supabase', () => ({
	supabase: { from: (table) => queryBuilder(table), rpc: vi.fn() },
	TABLES: new Proxy({}, { get: (_target, key) => String(key) }),
}));
vi.mock('@/shared/utils/supabaseStorage', () => ({
	uploadCompanyImage: vi.fn(),
	deleteCompanyImage: vi.fn(),
	IMAGE_STORAGE_CONTEXTS: { ORDER_RECEIPT: 'order-receipt' },
	createClientUuid: () => 'generated-uuid',
	isStorageObjectReference: () => false,
}));
vi.mock('@/modules/cash/services/atomicOrderTransactionService', () => ({
	atomicOrderTransactionService: { create: (...args) => atomicCreate(...args) },
}));
vi.mock('@/modules/cash/services/branchSettingsService', () => ({
	branchSettingsService: {
		getBranchOrderConfig: async () => ({ currency: 'CLP', country: 'CL', delivery_settings: {}, payment_methods: [] }),
	},
}));
vi.mock('@/modules/cash/services/clientService', () => ({ normalizeManualPhone: (phone) => phone }));
vi.mock('@/modules/cash/services/orderLifecycleV3Service', () => ({ orderLifecycleV3Service: {} }));
vi.mock('@/modules/cash/admin/utils/receiptPrinting', () => ({ printOrderTicket: vi.fn() }));

import { ordersService } from '@/modules/cash/admin/orders/services/orders';
import { buildCartLineFields, buildOrderItemsPayload } from '@/modules/cash/hooks/manual-order/cartLines';

const PIZZA = { id: 'prod-pizza', name: 'Pizza Napolitana', price: 6000, has_discount: true, discount_price: 5000 };

function orderData(items) {
	return {
		branch_id: 'branch-1',
		company_id: 'company-1',
		client_name: 'Ana',
		client_request_id: 'request-1',
		manual_order_mode: 'quick_sale',
		order_type: 'pickup',
		payment_type: 'pendiente',
		payment_timing: 'deferred',
		items,
	};
}

beforeEach(() => {
	queryCalls.length = 0;
	atomicCreate.mockReset();
	atomicCreate.mockResolvedValue({ order: { id: 77 } });
	tableResults.clear();
	tableResults.set('product_prices', { data: [{ product_id: 'prod-pizza', price: 6000, has_discount: true, discount_price: 5000 }], error: null });
	tableResults.set('product_branch', { data: [{ product_id: 'prod-pizza' }], error: null });
	tableResults.set('products', { data: [{ id: 'prod-pizza', name: 'Pizza Napolitana' }], error: null });
	tableResults.set('product_sizes', {
		data: [
			{ id: 'size-fam', product_id: 'prod-pizza', name: 'Familiar', price: 12000 },
			{ id: 'size-med', product_id: 'prod-pizza', name: 'Mediana', price: 9000 },
		],
		error: null,
	});
	tableResults.set('cash_shifts', { data: { id: 'shift-1' }, error: null });
});

describe('pedido manual clásico con tamaños', () => {
	it('manda una línea por tamaño con size_id, su precio y el nombre «Producto (Tamaño)»', async () => {
		const items = buildOrderItemsPayload([
			{ ...buildCartLineFields(PIZZA, { id: 'size-fam', name: 'Familiar', price: 12000 }), quantity: 2 },
			{ ...buildCartLineFields(PIZZA, { id: 'size-med', name: 'Mediana', price: 9000 }), quantity: 1 },
			{ ...buildCartLineFields(PIZZA), quantity: 1 },
		]);

		const result = await ordersService.createOrder(orderData(items));
		expect(result.order).toEqual({ id: 77 });

		const payload = atomicCreate.mock.calls[0][0];
		expect(payload.p_items.map((item) => [item.id, item.size_id ?? null, item.name, item.quantity, item.price, item.has_discount])).toEqual([
			['prod-pizza', 'size-fam', 'Pizza Napolitana (Familiar)', 2, 12000, false],
			['prod-pizza', 'size-med', 'Pizza Napolitana (Mediana)', 1, 9000, false],
			['prod-pizza', null, 'Pizza Napolitana', 1, 6000, true],
		]);
		// 2 × 12.000 + 9.000 + 5.000 (la línea sin tamaño conserva la oferta).
		expect(payload.p_total).toBe(38000);
		expect(payload.p_total_minor).toBe(38000);

		const sizeQuery = queryCalls.filter(([table]) => table === 'product_sizes');
		expect(sizeQuery).toContainEqual(['product_sizes', 'eq', 'branch_id', 'branch-1']);
		expect(sizeQuery).toContainEqual(['product_sizes', 'eq', 'is_active', true]);
		expect(sizeQuery).toContainEqual(['product_sizes', 'in', 'id', ['size-fam', 'size-med']]);
	});

	it('sin tamaños en el carrito no consulta product_sizes', async () => {
		await ordersService.createOrder(orderData(buildOrderItemsPayload([{ ...buildCartLineFields(PIZZA), quantity: 1 }])));
		expect(queryCalls.some(([table]) => table === 'product_sizes')).toBe(false);
		expect(atomicCreate.mock.calls[0][0].p_items[0]).not.toHaveProperty('size_id');
	});

	it('si el tamaño ya no existe en la sucursal, no crea el pedido y lo dice', async () => {
		tableResults.set('product_sizes', { data: [], error: null });
		const items = buildOrderItemsPayload([
			{ ...buildCartLineFields(PIZZA, { id: 'size-borrado', name: 'Gigante', price: 15000 }), quantity: 1 },
		]);
		await expect(ordersService.createOrder(orderData(items))).rejects.toThrow('El tamaño elegido ya no existe en esta sucursal');
		expect(atomicCreate).not.toHaveBeenCalled();
	});
});
