import { describe, it, expect } from 'vitest';
import { mergeOrderInMemory } from '@/shared/utils/orderUtils';

const BASE_ORDER = {
	id: 'order-1',
	status: 'pending',
	total: 5000,
	client_name: 'Juan',
	items: [{ id: 'p1', name: 'Café', quantity: 2, price: 2500 }],
	coupon_code: 'DESC10',
	discount_coupon_id: 'cup-1',
};

describe('mergeOrderInMemory', () => {
	it('devuelve sanitize del row si no hay pedido previo', () => {
		const merged = mergeOrderInMemory(null, {
			id: 'order-2',
			status: 'active',
			total: 1000,
		});
		expect(merged?.id).toBe('order-2');
		expect(merged?.status).toBe('active');
		expect(merged?.items).toEqual([]);
	});

	it('conserva items hidratados cuando Realtime no trae items', () => {
		const merged = mergeOrderInMemory(BASE_ORDER, {
			id: 'order-1',
			status: 'active',
			total: 5000,
		});
		expect(merged?.status).toBe('active');
		expect(merged?.items).toEqual(BASE_ORDER.items);
	});

	it('reemplaza items cuando el payload los incluye', () => {
		const newItems = [{ id: 'p2', name: 'Té', quantity: 1, price: 3000 }];
		const merged = mergeOrderInMemory(BASE_ORDER, {
			id: 'order-1',
			status: 'active',
			total: 3000,
			items: newItems,
		});
		expect(merged?.items).toEqual(newItems);
	});

	it('preserva coupon_code si el payload no lo trae pero el cupón es el mismo', () => {
		const merged = mergeOrderInMemory(BASE_ORDER, {
			id: 'order-1',
			status: 'active',
			total: 5000,
			discount_coupon_id: 'cup-1',
		});
		expect(merged?.coupon_code).toBe('DESC10');
	});

	it('dedup conceptual: merge sobre existente actualiza escalares sin perder items', () => {
		const prev = { ...BASE_ORDER, status: 'pending' };
		const merged = mergeOrderInMemory(prev, {
			id: 'order-1',
			status: 'completed',
			total: 5500,
		});
		expect(merged?.status).toBe('completed');
		expect(merged?.total).toBe(5500);
		expect(merged?.items).toHaveLength(1);
	});
});
