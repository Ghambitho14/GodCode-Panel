import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * `orders.delivery_address.maps_url` lo escribe el storefront a través de una
 * ruta pública sin autenticación, y el panel lo pinta en un `href` rotulado
 * "Abrir en mapas". Un `javascript:` ahí ejecuta en la sesión del cajero, que
 * es privilegiada, y el clic es parte del flujo normal de trabajo.
 *
 * `toSafeHttpUrl` ya tiene su propia batería de tests; lo que se comprueba aquí
 * es que esté **bien cableado** en los componentes: que un valor malicioso no
 * llegue nunca al DOM.
 */

vi.mock('@/integrations/supabase', () => ({
	supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) },
	TABLES: { orders: 'orders' },
}));
vi.mock('@/modules/cash/hooks/useOrderMoney', () => ({
	useOrderMoney: () => ({
		formatMoney: (n) => `USD ${Number(n || 0).toFixed(2)}`,
		formatOrderAmount: (n) => String(n),
		exchangeRate: null,
	}),
}));
vi.mock('@/modules/cash/hooks/useBranchMoney', () => ({
	useBranchMoney: () => ({ currency: 'USD', locale: 'es-CL', fractionDigits: 2, formatMoney: (n) => String(n) }),
}));
vi.mock('@/shared/hooks/useLockBodyScroll', () => ({ useLockBodyScroll: () => {} }));
vi.mock('@/modules/cash/admin/utils/receiptPrinting', () => ({ printOrderTicket: () => {} }));
vi.mock('@/modules/cash/admin/pages/AdminProvider', () => ({
	useAdmin: () => ({ companyProfile: null, userRole: 'admin', upsertOrder: () => {} }),
}));
vi.mock('@/modules/cash/admin/services/manualOrderV2Service', () => ({
	manualOrderV2Service: { listPaymentLedger: async () => [] },
}));
vi.mock('@/modules/cash/admin/services/orderLifecycleV3Service', () => ({
	orderLifecycleV3Service: { listLines: async () => [] },
}));

import CashOrderDetailPanel from '@/modules/cash/components/caja/CashOrderDetailPanel';
import OrderDetailModal from '@/modules/cash/components/OrderDetailModal';

/** Pedido de delivery con la dirección envenenada. */
function orderWith(mapsUrl) {
	return {
		id: 'order-0001',
		channel: 'delivery',
		order_type: 'delivery',
		status: 'pending',
		total: 1000,
		items: [{ name: 'Item', quantity: 1, price: 1000 }],
		delivery_address: {
			address: 'Calle Falsa 123',
			formatted_address: 'Calle Falsa 123, Comuna',
			maps_url: mapsUrl,
		},
	};
}

const PAYLOADS = [
	'javascript:alert(document.cookie)',
	'JaVaScRiPt:alert(1)',
	'data:text/html,<script>alert(1)</script>',
	'//evil.com/phishing',
];

const SAFE_URL = 'https://www.google.com/maps/dir/?api=1&destination=-33.4,-70.6';

/** Devuelve los href de todos los enlaces renderizados. */
function renderedHrefs(container) {
	return [
		...container.querySelectorAll('a[href]'),
		...document.querySelectorAll('body > div a[href]'),
	].map((a) => a.getAttribute('href'));
}

describe('maps_url malicioso no llega a un href', () => {
	afterEach(() => cleanup());

	describe('CashOrderDetailPanel', () => {
		it.each(PAYLOADS)('descarta %s', (payload) => {
			const { container } = render(
				<CashOrderDetailPanel order={orderWith(payload)} onClose={() => {}} />,
			);

			const hrefs = renderedHrefs(container);
			expect(hrefs).not.toContain(payload);
			for (const href of hrefs) {
				expect(href?.toLowerCase().startsWith('javascript:')).toBe(false);
				expect(href?.toLowerCase().startsWith('data:')).toBe(false);
			}
		});

		it('conserva una URL de mapas legítima', () => {
			const { container } = render(
				<CashOrderDetailPanel order={orderWith(SAFE_URL)} onClose={() => {}} />,
			);

			expect(renderedHrefs(container)).toContain(SAFE_URL);
		});
	});

	describe('OrderDetailModal', () => {
		it.each(PAYLOADS)('descarta %s', (payload) => {
			const { container } = render(
				<OrderDetailModal order={orderWith(payload)} onClose={() => {}} />,
			);

			const hrefs = renderedHrefs(container);
			expect(hrefs).not.toContain(payload);
			for (const href of hrefs) {
				expect(href?.toLowerCase().startsWith('javascript:')).toBe(false);
				expect(href?.toLowerCase().startsWith('data:')).toBe(false);
			}
		});

		it('conserva una URL de mapas legítima', () => {
			const { container } = render(
				<OrderDetailModal order={orderWith(SAFE_URL)} onClose={() => {}} />,
			);

			expect(renderedHrefs(container)).toContain(SAFE_URL);
		});
	});
});
