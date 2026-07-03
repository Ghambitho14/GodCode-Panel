import { describe, expect, it } from 'vitest';
import {
	extractMenuSettingsFromIntegration,
	resolvePanelCapabilities,
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
