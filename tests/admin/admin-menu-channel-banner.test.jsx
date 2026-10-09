import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import AdminMenuChannelBanner from '@/modules/cash/components/AdminMenuChannelBanner';
import { resolvePanelCapabilities } from '@/lib/tenant/menu-settings';

afterEach(() => cleanup());

const lines = () => screen.getByRole('status').querySelectorAll('p');

describe('AdminMenuChannelBanner', () => {
	it('solo menú con carrito: un aviso, el de WhatsApp', () => {
		render(<AdminMenuChannelBanner menuCapabilities={resolvePanelCapabilities(
			{ cartEnabled: true, orderChannel: 'both' },
			{ product_mode: 'menu_only', online_ordering: false },
		)} />);
		expect([...lines()].map((p) => p.textContent)).toEqual([
			'Tu plan es solo menú digital: aquí cargas productos y banners. Los pedidos te llegan por WhatsApp.',
		]);
	});

	it('solo menú sin carrito: el aviso del plan no promete pedidos y sale el de catálogo', () => {
		render(<AdminMenuChannelBanner menuCapabilities={resolvePanelCapabilities(
			{ cartEnabled: false, orderChannel: 'both' },
			{ product_mode: 'menu_only' },
		)} />);
		const texts = [...lines()].map((p) => p.textContent);
		expect(texts).toEqual([
			'Tu plan es solo menú digital: aquí cargas productos y banners.',
			'Menú en modo catálogo. Los clientes no pueden pedir desde la web.',
		]);
		expect(texts.join(' ')).not.toMatch(/WhatsApp/);
	});

	it('canal solo WhatsApp con el plan completo, sin palabras en inglés', () => {
		render(<AdminMenuChannelBanner menuCapabilities={resolvePanelCapabilities({ cartEnabled: true, orderChannel: 'whatsapp_only' })} />);
		expect(screen.getByRole('status')).toHaveTextContent('La cola de pedidos online no recibirá pedidos nuevos.');
		expect(screen.getByRole('status')).not.toHaveTextContent(/checkout/i);
	});
});
