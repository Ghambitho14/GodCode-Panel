import { describe, expect, it } from 'vitest';
import {
	MENU_ONLY_PANEL_TABS,
	applyPlanProductModeToPanelAccess,
	extractMenuSettingsFromIntegration,
	resolvePanelCapabilities,
	resolvePlanProductMode,
} from '@/lib/tenant/menu-settings';
import { normalizeStoredNavTabId } from '@/shared/constants/admin-panel-tabs';

describe('menu-settings', () => {
	it('extrae cartEnabled y orderChannel', () => {
		const settings = extractMenuSettingsFromIntegration({
			menu: { cartEnabled: false, orderChannel: 'whatsapp_only' },
		});
		expect(settings.cartEnabled).toBe(false);
		expect(settings.orderChannel).toBe('whatsapp_only');
	});

	it('oculta ventas cuando catálogo solo', () => {
		const caps = resolvePanelCapabilities({ cartEnabled: false, orderChannel: 'both' });
		expect(caps.hideSalesTabs).toBe(true);
		expect(caps.showOnlineOrdersQueue).toBe(false);
	});

	it('whatsapp_only oculta cola pero no ventas si carrito activo', () => {
		const caps = resolvePanelCapabilities({ cartEnabled: true, orderChannel: 'whatsapp_only' });
		expect(caps.hideSalesTabs).toBe(false);
		expect(caps.showOnlineOrdersQueue).toBe(false);
		expect(caps.showWhatsAppOnlyBanner).toBe(true);
	});
});

describe('plan solo menú / solo panel', () => {
	it('solo menú: fuerza WhatsApp y muestra su aviso en vez del de canal', () => {
		const caps = resolvePanelCapabilities(
			{ cartEnabled: true, orderChannel: 'both' },
			{ product_mode: 'menu_only' },
		);
		expect(caps.planProductMode).toBe('menu_only');
		expect(caps.menuSettings.orderChannel).toBe('whatsapp_only');
		expect(caps.showOnlineOrdersQueue).toBe(false);
		expect(caps.showMenuOnlyBanner).toBe(true);
		expect(caps.showWhatsAppOnlyBanner).toBe(false);
		expect(caps.hasPublicMenu).toBe(true);
	});

	it('solo panel: sin menú público y sin tocar el canal', () => {
		const caps = resolvePanelCapabilities(
			{ cartEnabled: true, orderChannel: 'both' },
			{ product_mode: 'panel_only' },
		);
		expect(caps.planProductMode).toBe('panel_only');
		expect(caps.hasPublicMenu).toBe(false);
		expect(caps.menuSettings.orderChannel).toBe('both');
	});

	it('plan sin product_mode sigue completo', () => {
		expect(resolvePlanProductMode({ online_ordering: true })).toBe('full');
		expect(resolvePlanProductMode(null)).toBe('full');
	});

	it('solo menú recorta las pestañas a catálogo y banners', () => {
		expect(applyPlanProductModeToPanelAccess('menu_only', null)).toEqual(MENU_ONLY_PANEL_TABS);
		expect(
			applyPlanProductModeToPanelAccess('menu_only', ['orders', 'caja', 'products', 'carousel'], (tab) =>
				tab === 'carousel' ? 'menu_carousel' : tab,
			),
		).toEqual(['products', 'carousel']);
		expect(applyPlanProductModeToPanelAccess('menu_only', ['orders', 'caja'])).toEqual(MENU_ONLY_PANEL_TABS);
		expect(applyPlanProductModeToPanelAccess('full', ['orders'])).toEqual(['orders']);
		expect(applyPlanProductModeToPanelAccess('panel_only', null)).toBeNull();
	});
});

/** Avisos que pinta `AdminMenuChannelBanner`, en el orden en que salen. */
function visibleBanners(caps) {
	return [
		caps.showMenuOnlyBanner && (caps.showMenuOnlyWhatsAppHint ? 'solo-menu+whatsapp' : 'solo-menu'),
		caps.showCatalogOnlyBanner && 'catalogo',
		caps.showWhatsAppOnlyBanner && 'whatsapp',
		caps.showPanelOnlyBanner && 'panel',
	].filter(Boolean);
}

describe('avisos del plan «solo menú digital» sin contradicciones', () => {
	it('con el carrito encendido: solo el aviso de WhatsApp, aunque el plan diga online_ordering: false', () => {
		for (const features of [{ product_mode: 'menu_only' }, { product_mode: 'menu_only', online_ordering: false }]) {
			const caps = resolvePanelCapabilities({ cartEnabled: true, orderChannel: 'panel_only' }, features);
			expect(caps.onlineOrderingEnabled).toBe(true);
			expect(caps.showCatalogOnlyBanner).toBe(false);
			expect(caps.showMenuOnlyWhatsAppHint).toBe(true);
			expect(caps.menuCheckoutUsesWhatsApp).toBe(true);
			expect(visibleBanners(caps)).toEqual(['solo-menu+whatsapp']);
		}
	});

	it('con el carrito apagado: catálogo, y el aviso del plan sin prometer pedidos por WhatsApp', () => {
		const caps = resolvePanelCapabilities({ cartEnabled: false, orderChannel: 'both' }, { product_mode: 'menu_only' });
		expect(caps.showCatalogOnlyBanner).toBe(true);
		expect(caps.showMenuOnlyWhatsAppHint).toBe(false);
		expect(caps.menuCheckoutUsesWhatsApp).toBe(false);
		expect(visibleBanners(caps)).toEqual(['solo-menu', 'catalogo']);
	});

	it('plan heredado con features como arreglo sin online_ordering: un solo aviso, el de catálogo', () => {
		for (const orderChannel of ['both', 'whatsapp_only', 'panel_only']) {
			const caps = resolvePanelCapabilities({ cartEnabled: true, orderChannel }, ['inventory', 'reports']);
			expect(caps.planProductMode).toBe('full');
			expect(caps.showMenuOnlyWhatsAppHint).toBe(false);
			expect(visibleBanners(caps)).toEqual(['catalogo']);
		}
		const withOrdering = resolvePanelCapabilities({ cartEnabled: true, orderChannel: 'whatsapp_only' }, ['online_ordering']);
		expect(visibleBanners(withOrdering)).toEqual(['whatsapp']);
	});
});

describe('contrato con GodCode: pestañas de «solo menú digital»', () => {
	// Copia de `MENU_ONLY_CEO_TABS` en GodCode, `lib/plans/plan-product-mode.ts`.
	// Si GodCode la cambia, este test falla hasta actualizar las dos listas.
	const GODCODE_MENU_ONLY_CEO_TABS = [
		'categories',
		'products',
		'beverages',
		'extras',
		'menu_modifiers',
		'menu_carousel',
	];

	it('normalizada con los ids del panel es igual a MENU_ONLY_PANEL_TABS', () => {
		expect(GODCODE_MENU_ONLY_CEO_TABS.map(normalizeStoredNavTabId)).toEqual(MENU_ONLY_PANEL_TABS);
	});

	it('un panelAccess guardado por GodCode se recorta sin perder pestañas', () => {
		expect(
			applyPlanProductModeToPanelAccess('menu_only', GODCODE_MENU_ONLY_CEO_TABS, normalizeStoredNavTabId)
				.map(normalizeStoredNavTabId),
		).toEqual(MENU_ONLY_PANEL_TABS);
	});
});
