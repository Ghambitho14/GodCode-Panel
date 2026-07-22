import React from 'react';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/cash/hooks/useBranchMoney', () => ({
	useBranchMoney: () => ({ formatMoney: (value) => `$${value}` }),
}));
vi.mock('@/modules/cash/hooks/useFoodFallbackImage', () => ({
	useFoodFallbackImage: (_category, _id, enabled) => ({ url: enabled ? '/fallback.webp' : null }),
}));
vi.mock('@/modules/cash/components/ProgressiveProductImage', () => ({
	default: ({ enabled }) => <span data-testid="progressive-image" data-enabled={String(enabled)} />,
}));

import ManualOrderCatalog from '@/modules/cash/components/manual-order/ManualOrderCatalog';
import ProductCard from '@/modules/cash/components/manual-order/ProductCard';

const product = {
	id: 'product-1',
	name: 'Producto visible',
	price: 100,
	is_active: true,
	image_url: 'company/product.webp',
};

let observerInstances;

beforeEach(() => {
	observerInstances = [];
	globalThis.IntersectionObserver = class IntersectionObserverMock {
		constructor(callback, options) {
			this.callback = callback;
			this.options = options;
			this.observe = vi.fn();
			this.disconnect = vi.fn();
			observerInstances.push(this);
		}
	};
});

afterEach(() => {
	cleanup();
	delete globalThis.IntersectionObserver;
});

describe('imágenes del catálogo de pedido manual', () => {
	it('las activa al entrar y el botón las oculta y vuelve a mostrar', async () => {
		const user = userEvent.setup();
		render(
			<ManualOrderCatalog
				products={[product]}
				categories={[]}
				addItem={vi.fn()}
				updateQuantity={vi.fn()}
				removeItem={vi.fn()}
				getQty={() => 0}
			/>,
		);

		const hideButton = screen.getByRole('button', { name: 'Ocultar imágenes de productos' });
		expect(hideButton).toHaveAttribute('aria-pressed', 'true');
		await user.click(hideButton);
		expect(screen.getByRole('button', { name: 'Mostrar imágenes de productos' })).toHaveAttribute('aria-pressed', 'false');
		await user.click(screen.getByRole('button', { name: 'Mostrar imágenes de productos' }));
		expect(screen.getByRole('button', { name: 'Ocultar imágenes de productos' })).toBeTruthy();
	});

	it('habilita cada imagen solo cuando su tarjeta entra en el área cercana visible', () => {
		const { rerender } = render(
			<ProductCard
				product={product}
				quantity={0}
				addItem={vi.fn()}
				updateQuantity={vi.fn()}
				removeItem={vi.fn()}
				showProductImages
			/>,
		);

		expect(screen.getByTestId('progressive-image')).toHaveAttribute('data-enabled', 'false');
		const imageObserver = observerInstances.find((observer) => observer.options?.rootMargin === '180px 0px');
		expect(imageObserver).toBeTruthy();

		act(() => imageObserver.callback([{ isIntersecting: true }]));
		expect(screen.getByTestId('progressive-image')).toHaveAttribute('data-enabled', 'true');

		rerender(
			<ProductCard
				product={product}
				quantity={0}
				addItem={vi.fn()}
				updateQuantity={vi.fn()}
				removeItem={vi.fn()}
				showProductImages={false}
			/>,
		);
		expect(screen.getByTestId('progressive-image')).toHaveAttribute('data-enabled', 'false');
	});
});
