import { describe, expect, it } from 'vitest';

import { mergeCatalogForBranch } from '@/modules/cash/admin/catalog/mergeCatalogForBranch';

const companyRaw = {
	categories: [{ id: 'cat-1', name: 'Pizzas', company_id: 'co', order: 1, is_active: true }],
	products: [
		{ id: 'prod-pizza', name: 'Pizza Napolitana', category_id: 'cat-1', is_active: true },
		{ id: 'prod-papas', name: 'Papas fritas', category_id: 'cat-1', is_active: true },
	],
};

const branchRaw = {
	categoryBranchRows: [],
	branchPrices: [
		{ id: 'pp-1', product_id: 'prod-pizza', price: 6000, has_discount: false, discount_price: null },
		{ id: 'pp-2', product_id: 'prod-papas', price: 2500, has_discount: false, discount_price: null },
	],
	branchStatuses: [
		{ id: 'pb-1', product_id: 'prod-pizza', is_active: true, is_special: false, category_id: 'cat-1' },
		{ id: 'pb-2', product_id: 'prod-papas', is_active: true, is_special: false, category_id: 'cat-1' },
	],
	branchSizes: [
		{ id: 'size-fam', product_id: 'prod-pizza', name: 'Familiar', price: 12000, sort_order: 2 },
		{ id: 'size-per', product_id: 'prod-pizza', name: 'Personal', price: 6000, sort_order: 0 },
		{ id: 'size-med', product_id: 'prod-pizza', name: 'Mediana', price: 9000, sort_order: 1 },
		{ id: 'size-x', product_id: 'prod-sin-fila', name: 'Huérfano', price: 1000, sort_order: 0 },
	],
};

describe('mergeCatalogForBranch con tamaños', () => {
	it('cuelga los tamaños de la sucursal de cada producto, en el orden del menú', () => {
		const { mergedProducts } = mergeCatalogForBranch({ companyRaw, branchRaw, isAllBranches: false });
		const pizza = mergedProducts.find((product) => product.id === 'prod-pizza');
		const papas = mergedProducts.find((product) => product.id === 'prod-papas');
		expect(pizza.sizes.map((size) => [size.id, size.name, size.price])).toEqual([
			['size-per', 'Personal', 6000],
			['size-med', 'Mediana', 9000],
			['size-fam', 'Familiar', 12000],
		]);
		expect(pizza.price).toBe(6000);
		expect(papas.sizes).toEqual([]);
	});

	it('sin la tabla de tamaños (sucursal sin datos) los productos quedan sin tamaños', () => {
		const { mergedProducts } = mergeCatalogForBranch({
			companyRaw,
			branchRaw: { ...branchRaw, branchSizes: undefined },
			isAllBranches: false,
		});
		expect(mergedProducts.every((product) => Array.isArray(product.sizes) && product.sizes.length === 0)).toBe(true);
	});

	it('en «todas las sucursales» no mezcla tamaños de ninguna', () => {
		const { mergedProducts } = mergeCatalogForBranch({ companyRaw, branchRaw, isAllBranches: true });
		expect(mergedProducts[0]).not.toHaveProperty('sizes');
	});
});
