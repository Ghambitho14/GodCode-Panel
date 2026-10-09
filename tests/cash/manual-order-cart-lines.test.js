import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import {
	SIZES_NOT_SUPPORTED_MESSAGE,
	buildCartLineFields,
	buildCartLineId,
	buildOrderItemLineIds,
	buildOrderItemsPayload,
	cartHasSizedLines,
	countProductInCart,
	getLineProductId,
	hasSizeOrVariantLines,
	minProductSizePrice,
	productHasSizes,
	productSizes,
} from '@/modules/cash/hooks/manual-order/cartLines';
import { useManualOrderCart } from '@/modules/cash/hooks/manual-order/useManualOrderCart';

const PIZZA = {
	id: 'prod-pizza',
	name: 'Pizza Napolitana',
	price: 6000,
	has_discount: true,
	discount_price: 5500,
	image_url: 'company/pizza.webp',
	category_id: 'cat-1',
	sizes: [
		{ id: 'size-fam', name: 'Familiar', price: 12000, sort_order: 2 },
		{ id: 'size-per', name: ' Personal ', price: 6000, sort_order: 0 },
		{ id: 'size-med', name: 'Mediana', price: 9000, sort_order: 1 },
		{ id: 'size-rota', name: '', price: 3000, sort_order: 3 },
		{ id: 'size-gratis', name: 'Gratis', price: 0, sort_order: 4 },
	],
};
const FAMILIAR = { id: 'size-fam', name: 'Familiar', price: 12000 };
const MEDIANA = { id: 'size-med', name: 'Mediana', price: 9000 };

describe('tamaños del producto en la caja', () => {
	it('usa solo los tamaños con nombre y precio, en el orden del menú', () => {
		expect(productSizes(PIZZA).map((size) => [size.id, size.name, size.price])).toEqual([
			['size-per', 'Personal', 6000],
			['size-med', 'Mediana', 9000],
			['size-fam', 'Familiar', 12000],
		]);
		expect(productHasSizes(PIZZA)).toBe(true);
		expect(minProductSizePrice(PIZZA)).toBe(6000);
	});

	it('un producto sin tamaños válidos se vende como siempre', () => {
		expect(productHasSizes({ id: 'p', sizes: [] })).toBe(false);
		expect(productHasSizes({ id: 'p', sizes: [{ id: 's', name: 'Única', price: 0 }] })).toBe(false);
		expect(productHasSizes({ id: 'p' })).toBe(false);
		expect(minProductSizePrice({ id: 'p' })).toBeNull();
	});
});

describe('línea del carrito', () => {
	it('con tamaño: id propio, nombre «Producto (Tamaño)», precio del tamaño y sin oferta', () => {
		expect(buildCartLineFields(PIZZA, FAMILIAR)).toEqual({
			id: buildCartLineId('prod-pizza', 'size-fam'),
			product_id: 'prod-pizza',
			size_id: 'size-fam',
			size_name: 'Familiar',
			name: 'Pizza Napolitana (Familiar)',
			price: 12000,
			has_discount: false,
			discount_price: null,
		});
	});

	it('sin tamaño conserva precio y oferta del producto', () => {
		expect(buildCartLineFields(PIZZA)).toEqual({
			id: 'prod-pizza',
			product_id: 'prod-pizza',
			name: 'Pizza Napolitana',
			price: 6000,
			has_discount: true,
			discount_price: 5500,
		});
	});

	it('el id de línea siempre devuelve el producto', () => {
		const sizedId = buildCartLineId('prod-pizza', 'size-fam');
		expect(sizedId).not.toBe('prod-pizza');
		expect(getLineProductId({ id: sizedId })).toBe('prod-pizza');
		expect(getLineProductId({ id: buildCartLineId('prod-pizza', 'size-fam', ['v2', 'v1']) })).toBe('prod-pizza');
		expect(getLineProductId({ id: 'otro', product_id: 'prod-pizza' })).toBe('prod-pizza');
		expect(getLineProductId({ id: 'bebida-1' })).toBe('bebida-1');
		expect(buildCartLineId('p', null, ['b', 'a'])).toBe(buildCartLineId('p', null, ['a', 'b']));
	});

	it('el badge de la tarjeta suma todos los tamaños del producto', () => {
		const items = [
			{ ...buildCartLineFields(PIZZA, FAMILIAR), quantity: 2 },
			{ ...buildCartLineFields(PIZZA, MEDIANA), quantity: 1 },
			{ id: 'otro', product_id: 'otro', quantity: 5 },
		];
		expect(countProductInCart(items, 'prod-pizza')).toBe(3);
		expect(countProductInCart(items, 'otro')).toBe(5);
		expect(countProductInCart(items, 'nada')).toBe(0);
		expect(countProductInCart(items, null)).toBe(0);
	});
});

describe('líneas de un pedido guardado (edición)', () => {
	it('separa tamaños y variantes del mismo producto y no deja dos ids iguales', () => {
		const ids = buildOrderItemLineIds([
			{ id: 'prod-pizza', size_id: 'size-fam', quantity: 1 },
			{ id: 'prod-pizza', size_id: 'size-med', quantity: 1 },
			{ id: 'prod-pizza', size_id: 'size-fam', variant_ids: ['var-pollo'], quantity: 1 },
			{ id: 'prod-pizza', quantity: 1 },
			{ id: 'prod-pizza', quantity: 1, note: 'sin cebolla' },
		]);
		expect(new Set(ids).size).toBe(5);
		expect(ids[0]).toBe(buildCartLineId('prod-pizza', 'size-fam'));
		expect(ids[3]).toBe('prod-pizza');
		expect(ids.map((id) => getLineProductId({ id }))).toEqual(Array(5).fill('prod-pizza'));
	});

	it('un tamaño agregado desde la caja cae en la línea guardada de ese tamaño', () => {
		const [savedId] = buildOrderItemLineIds([{ id: 'prod-pizza', size_id: 'size-fam' }]);
		expect(buildCartLineFields(PIZZA, FAMILIAR).id).toBe(savedId);
	});

	it('detecta las líneas que la cotización V2 no sabe precificar', () => {
		expect(cartHasSizedLines([{ id: 'a' }, { id: 'b', size_id: 's' }])).toBe(true);
		expect(cartHasSizedLines([{ id: 'a' }])).toBe(false);
		expect(hasSizeOrVariantLines([{ id: 'a', variant_ids: ['v'] }])).toBe(true);
		expect(hasSizeOrVariantLines([{ id: 'a', variant_ids: [] }])).toBe(false);
	});
});

describe('p_items de la RPC', () => {
	it('manda el producto como id y el tamaño en size_id, con su precio', () => {
		const items = [
			{ ...buildCartLineFields(PIZZA, FAMILIAR), quantity: 2, note: ' <b>bien cocida</b> ' },
			{ ...buildCartLineFields(PIZZA), quantity: 1, note: '' },
		];
		expect(buildOrderItemsPayload(items)).toEqual([
			{
				id: 'prod-pizza',
				name: 'Pizza Napolitana (Familiar)',
				quantity: 2,
				price: 12000,
				has_discount: false,
				discount_price: null,
				description: null,
				note: 'bien cocida',
				manual_order_source: null,
				is_extra: false,
				size_id: 'size-fam',
			},
			{
				id: 'prod-pizza',
				name: 'Pizza Napolitana',
				quantity: 1,
				price: 6000,
				has_discount: true,
				discount_price: 5500,
				description: null,
				note: null,
				manual_order_source: null,
				is_extra: false,
			},
		]);
	});

	it('los cambios viajan con su recargo, también con tamaño', () => {
		const [line] = buildOrderItemsPayload([{
			...buildCartLineFields(PIZZA, MEDIANA),
			quantity: 1,
			extras: [{ name: 'Agregar queso', price: 800, quantity: 2 }],
		}]);
		expect(line).toMatchObject({ id: 'prod-pizza', size_id: 'size-med', price: 9000, extras_total: 1600 });
	});

	it('el aviso de tamaños no disponibles es el acordado', () => {
		expect(SIZES_NOT_SUPPORTED_MESSAGE).toBe('Este producto tiene tamaños: cóbralo desde el menú online por ahora.');
	});
});

describe('useManualOrderCart con tamaños', () => {
	it('cada tamaño es una línea y el total usa el precio del tamaño', () => {
		const { result } = renderHook(() => useManualOrderCart([], { currency: 'CLP', fractionDigits: 0 }));
		act(() => result.current.addItem(PIZZA, { size: FAMILIAR }));
		act(() => result.current.addItem(PIZZA, { size: FAMILIAR }));
		act(() => result.current.addItem(PIZZA, { size: MEDIANA }));

		expect(result.current.items.map((item) => [item.name, item.quantity, item.size_id])).toEqual([
			['Pizza Napolitana (Familiar)', 2, 'size-fam'],
			['Pizza Napolitana (Mediana)', 1, 'size-med'],
		]);
		expect(result.current.total).toBe(33000);
		expect(result.current.items[0]).toMatchObject({ image_url: 'company/pizza.webp', category_id: 'cat-1' });

		const familiarId = result.current.items[0].id;
		act(() => result.current.updateQuantity(familiarId, -1));
		act(() => result.current.removeItem(result.current.items[1].id));
		expect(result.current.items.map((item) => [item.name, item.quantity])).toEqual([['Pizza Napolitana (Familiar)', 1]]);
		expect(result.current.total).toBe(12000);
	});

	it('el tope de 20 unidades es por línea y avisa con el nombre del tamaño', () => {
		const onLimitReached = vi.fn();
		const { result } = renderHook(() => useManualOrderCart([], { currency: 'CLP', fractionDigits: 0, onLimitReached }));
		for (let i = 0; i < 21; i += 1) act(() => result.current.addItem(PIZZA, { size: MEDIANA }));
		expect(result.current.items[0].quantity).toBe(20);
		expect(onLimitReached).toHaveBeenCalledWith(expect.objectContaining({ name: 'Pizza Napolitana (Mediana)' }));
	});
});
