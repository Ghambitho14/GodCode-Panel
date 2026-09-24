import React from 'react';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register', () => ({ registerSW: vi.fn() }));

import { canReloadUnnoticed, markAppUpdateReady } from '@/shared/pwa/app-update';
import { AppUpdateBanner } from '@/shared/pwa/AppUpdateBanner';

const fakeDocument = ({ visibilityState = 'hidden', dialog = false, activeElement = document.body } = {}) => ({
	visibilityState,
	activeElement,
	querySelector: () => (dialog ? document.createElement('div') : null),
});

describe('actualización de la PWA', () => {
	afterEach(() => cleanup());

	describe('recarga silenciosa', () => {
		it('nunca con el panel a la vista', () => {
			expect(canReloadUnnoticed(fakeDocument({ visibilityState: 'visible' }))).toBe(false);
		});

		it('en segundo plano y sin nada abierto, sí', () => {
			expect(canReloadUnnoticed(fakeDocument())).toBe(true);
		});

		it('no con un diálogo abierto (un cobro a medias, un pedido manual)', () => {
			expect(canReloadUnnoticed(fakeDocument({ dialog: true }))).toBe(false);
		});

		it('no con un campo en foco', () => {
			const input = document.createElement('input');
			expect(canReloadUnnoticed(fakeDocument({ activeElement: input }))).toBe(false);
		});
	});

	it('avisa de la versión nueva con el panel a la vista y se puede posponer', () => {
		render(<AppUpdateBanner />);
		expect(screen.queryByText('Hay una versión nueva del panel')).not.toBeInTheDocument();

		// jsdom está visible: debe avisar, no recargar.
		act(() => markAppUpdateReady());
		expect(screen.getByText('Hay una versión nueva del panel')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Actualizar' })).toBeInTheDocument();

		fireEvent.click(screen.getByRole('button', { name: 'Más tarde' }));
		expect(screen.queryByText('Hay una versión nueva del panel')).not.toBeInTheDocument();
	});
});
