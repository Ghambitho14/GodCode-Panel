import { describe, expect, it } from 'vitest';
import {
	MENU_ONLY_PANEL_TABS,
	applyPlanProductModeToPanelAccess,
	extractMenuSettingsFromIntegration,
	resolvePanelCapabilities,
	resolvePlanProductMode,
} from '@/lib/tenant/menu-settings';

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
