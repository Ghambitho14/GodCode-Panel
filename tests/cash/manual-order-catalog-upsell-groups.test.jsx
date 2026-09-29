import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/cash/components/manual-order/ProductCard', () => ({
	default: ({ product }) => <span data-testid="card">{product.name}</span>,
}));

import ManualOrderCatalog from '@/modules/cash/components/manual-order/ManualOrderCatalog';

const drink = (id, name, group) => ({ id, name, price: 1000, is_active: true, category_name: group });

// Mismo reparto que la sucursal Pudahuel de Oishi.
const beverages = [
	drink('b1', 'Coca-Cola', ''),
	drink('b2', 'Agua', ''),
	drink('b3', 'Sprite', ''),
	drink('b4', 'BEBIDA DE 250 ml', 'PEPSI, PAP, KEN, CRUSH'),
	drink('b5', 'lipton', 'Bebidas'),
	drink('b6', 'Café', 'Té y café'),
];

const renderCatalog = (extra = {}) => render(
	<ManualOrderCatalog
		products={[{ id: 'p1', name: 'Gohan', price: 5000, is_active: true, category_id: 'c1' }]}
		categories={[{ id: 'c1', name: 'GOHAN', order: 1, is_active: true }]}
		cartUpsellCatalogs={{
			beveragesEnabled: true,
			extrasEnabled: true,
			beverages,
			extras: [drink('e1', 'Salsa soya', 'Salsas'), drink('e2', 'Palitos', '')],
			...extra,
		}}
		addItem={vi.fn()}
		updateQuantity={vi.fn()}
		removeItem={vi.fn()}
		getQty={() => 0}
	/>,
);

afterEach(() => cleanup());

/**
 * El grupo de una bebida o un extra es texto libre del catalogo de la
 * sucursal, no una categoria del menu. Antes cada grupo salia como un chip
 * propio al lado de las categorias reales.
 */
describe('grupos de bebidas y extras en el pedido manual', () => {
	it('muestra un solo chip para bebidas y otro para extras', () => {
		renderCatalog();
		const nav = screen.getByRole('navigation', { name: 'Categorías' });
		const chips = within(nav).getAllByRole('button').map((b) => b.textContent);
		expect(chips).toEqual(['GOHAN', 'Bebidas', 'Extras']);
	});

	it('muestra los grupos como subtitulos dentro de la seccion', () => {
		const { container } = renderCatalog();
		const section = container.querySelector('[data-category-key="beverages:__section__"]');
		expect(section).toBeTruthy();

		const subheadings = [...section.querySelectorAll('h4')].map((h) => h.firstChild.textContent);
		expect(subheadings).toEqual(['PEPSI, PAP, KEN, CRUSH', 'Té y café', 'Otras']);

		// El grupo «Bebidas» se une a las que no tienen grupo.
		const otras = [...section.querySelectorAll('h4')].at(-1).parentElement;
		expect(within(otras).getAllByTestId('card').map((c) => c.textContent))
			.toEqual(['lipton', 'Coca-Cola', 'Agua', 'Sprite']);

		expect(within(section).getAllByTestId('card')).toHaveLength(beverages.length);
		// Los grupos no son secciones navegables.
		expect(section.querySelectorAll('[data-category-key]')).toHaveLength(0);
	});

	it('sin grupos con nombre no pone subtitulo', () => {
		const { container } = renderCatalog({ beverages: [drink('b1', 'Coca-Cola', ''), drink('b2', 'Fanta', 'bebidas')] });
		const section = container.querySelector('[data-category-key="beverages:__section__"]');
		expect(section.querySelectorAll('h4')).toHaveLength(0);
		expect(within(section).getAllByTestId('card')).toHaveLength(2);
	});
});
