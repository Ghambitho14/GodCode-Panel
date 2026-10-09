import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/cash/hooks/useBranchMoney', () => ({
	useBranchMoney: () => ({ formatMoney: (value) => `$${value}` }),
}));
vi.mock('@/modules/cash/hooks/useFoodFallbackImage', () => ({
	useFoodFallbackImage: () => ({ url: null }),
}));
vi.mock('@/modules/cash/components/ProgressiveProductImage', () => ({
	default: () => <span data-testid="progressive-image" />,
}));

import ManualOrderCatalog from '@/modules/cash/components/manual-order/ManualOrderCatalog';

const PIZZA = {
	id: 'prod-pizza',
	name: 'Pizza Napolitana',
	price: 6000,
	has_discount: true,
	discount_price: 5000,
	is_active: true,
	category_id: 'cat-1',
	sizes: [
		{ id: 'size-fam', name: 'Familiar', price: 12000, sort_order: 2 },
		{ id: 'size-per', name: 'Personal', price: 6000, sort_order: 0 },
		{ id: 'size-med', name: 'Mediana', price: 9000, sort_order: 1 },
	],
};
const PAPAS = { id: 'prod-papas', name: 'Papas fritas', price: 2500, is_active: true, category_id: 'cat-1', sizes: [] };

function renderCatalog(props = {}) {
	const addItem = vi.fn();
	const utils = render(
		<ManualOrderCatalog
			products={[PIZZA, PAPAS]}
			categories={[{ id: 'cat-1', name: 'Pizzas', order: 1, is_active: true }]}
			addItem={addItem}
			updateQuantity={vi.fn()}
			removeItem={vi.fn()}
			getQty={() => 0}
			{...props}
		/>,
	);
	return { ...utils, addItem, user: userEvent.setup() };
}

const pizzaCard = () => screen.getByRole('button', { name: /^Pizza Napolitana/ });
const sizeOptions = (dialog) => within(within(dialog).getByRole('group', { name: 'Tamaños de Pizza Napolitana' })).getAllByRole('button');

afterEach(() => cleanup());

describe('tamaños en el pedido manual', () => {
	it('la tarjeta muestra «Desde» con el tamaño más barato y sin oferta', () => {
		renderCatalog();
		const card = pizzaCard();
		expect(within(card).getByText('Desde')).toBeInTheDocument();
		expect(within(card).getByText('$6000')).toBeInTheDocument();
		expect(within(card).queryByText('Oferta')).not.toBeInTheDocument();
		const plus = within(card).getByRole('button', { name: 'Elegir tamaño de Pizza Napolitana' });
		expect(plus).toHaveAttribute('aria-haspopup', 'dialog');
	});

	it('al tocar «+» pide el tamaño, agrega el elegido y devuelve el foco', async () => {
		const { addItem, user } = renderCatalog();
		const plus = within(pizzaCard()).getByRole('button', { name: 'Elegir tamaño de Pizza Napolitana' });
		await user.click(plus);

		const dialog = screen.getByRole('dialog', { name: 'Pizza Napolitana' });
		expect(dialog).toHaveAccessibleDescription('Elige el tamaño');
		const options = sizeOptions(dialog);
		expect(options.map((option) => option.textContent)).toEqual(['Personal$6000', 'Mediana$9000', 'Familiar$12000']);
		expect(options[0]).toHaveFocus();
		expect(addItem).not.toHaveBeenCalled();

		await user.click(options[1]);
		expect(addItem).toHaveBeenCalledTimes(1);
		expect(addItem).toHaveBeenCalledWith(PIZZA, { size: expect.objectContaining({ id: 'size-med', name: 'Mediana', price: 9000 }) });
		expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
		expect(plus).toHaveFocus();
	});

	it('se maneja con teclado y Escape no llega al modal del pedido', async () => {
		const onWindowKeyDown = vi.fn();
		window.addEventListener('keydown', onWindowKeyDown);
		try {
			const { addItem, user } = renderCatalog();
			pizzaCard().focus();
			await user.keyboard('{Enter}');

			const dialog = screen.getByRole('dialog', { name: 'Pizza Napolitana' });
			const options = sizeOptions(dialog);
			// El Enter que abre el selector no elige el primer tamaño.
			expect(addItem).not.toHaveBeenCalled();
			expect(options[0]).toHaveFocus();

			onWindowKeyDown.mockClear();
			await user.keyboard('{ArrowDown}');
			expect(options[1]).toHaveFocus();
			await user.keyboard('{End}');
			expect(options[2]).toHaveFocus();
			await user.keyboard('{ArrowDown}');
			expect(options[0]).toHaveFocus();
			await user.keyboard('{ArrowUp}');
			expect(options[2]).toHaveFocus();

			// Tab no sale del diálogo: del último tamaño vuelve a «Cerrar».
			await user.tab();
			expect(within(dialog).getByRole('button', { name: 'Cerrar' })).toHaveFocus();
			await user.tab({ shift: true });
			expect(options[2]).toHaveFocus();

			await user.keyboard('{Escape}');
			expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
			expect(addItem).not.toHaveBeenCalled();
			expect(onWindowKeyDown.mock.calls.map(([event]) => event.key)).not.toContain('Escape');
			expect(onWindowKeyDown.mock.calls.map(([event]) => event.key)).not.toContain('Tab');
			expect(pizzaCard()).toHaveFocus();
		} finally {
			window.removeEventListener('keydown', onWindowKeyDown);
		}
	});

	it('el Espacio que abre el selector tampoco elige tamaño; el siguiente sí', async () => {
		const { addItem, user } = renderCatalog();
		pizzaCard().focus();
		await user.keyboard(' ');
		const dialog = screen.getByRole('dialog', { name: 'Pizza Napolitana' });
		expect(addItem).not.toHaveBeenCalled();

		await user.keyboard(' ');
		expect(addItem).toHaveBeenCalledWith(PIZZA, { size: expect.objectContaining({ id: 'size-per' }) });
		expect(dialog).not.toBeInTheDocument();
	});

	it('tocar fuera o «Cerrar» cierra sin agregar', async () => {
		const { addItem, user } = renderCatalog();
		await user.click(pizzaCard());
		await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cerrar' }));
		expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

		await user.click(pizzaCard());
		await user.click(screen.getByRole('dialog').parentElement);
		expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
		expect(addItem).not.toHaveBeenCalled();
	});

	it('un producto sin tamaños se agrega directo', async () => {
		const { addItem, user } = renderCatalog();
		await user.click(screen.getByRole('button', { name: 'Agregar Papas fritas' }));
		expect(addItem).toHaveBeenCalledTimes(1);
		expect(addItem).toHaveBeenCalledWith(PAPAS);
		expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
	});

	it('Enter en el «+» lo resuelve el botón: la tarjeta no suma otra unidad', async () => {
		const { addItem, user } = renderCatalog();
		screen.getByRole('button', { name: 'Agregar Papas fritas' }).focus();
		await user.keyboard('{Enter}');
		expect(addItem).toHaveBeenCalledTimes(1);
	});

	it('si el pedido no admite tamaños, avisa en vez de abrir el selector', async () => {
		const onSizedProductBlocked = vi.fn();
		const { addItem, user } = renderCatalog({ onSizedProductBlocked });
		await user.click(within(pizzaCard()).getByRole('button', { name: 'Elegir tamaño de Pizza Napolitana' }));
		expect(onSizedProductBlocked).toHaveBeenCalledWith(PIZZA);
		expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
		expect(addItem).not.toHaveBeenCalled();

		await user.click(screen.getByRole('button', { name: 'Agregar Papas fritas' }));
		expect(addItem).toHaveBeenCalledWith(PAPAS);
	});
});
