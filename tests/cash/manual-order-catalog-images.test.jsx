import React from 'react';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
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
	// El botón de ocultar/mostrar imágenes se retiró de la UI: `showProductImages`
	// va fijo a `true` en ManualOrderCatalog y solo queda como puerta del lazy-load.
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
