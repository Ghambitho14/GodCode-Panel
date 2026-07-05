import { describe, expect, it } from 'vitest';
import { resolvePanelCapabilities } from '@/lib/tenant/menu-settings';
import {
	getTabAccessDenialMessage,
	resolveTabAccessDenialReason,
	resolveSidebarRestrictedHint,
} from '@/modules/cash/admin/utils/tabAccessMessages';

const ceoCtx = {
	userRole: 'ceo',
	normalizedPanelAccess: null,
};

describe('tabAccessMessages', () => {
	it('whatsapp_only oculta pedidos con mensaje de canal', () => {
		const menuCapabilities = resolvePanelCapabilities({
			cartEnabled: true,
			orderChannel: 'whatsapp_only',
		});

		const reason = resolveTabAccessDenialReason({
			...ceoCtx,
			tabId: 'orders',
			menuCapabilities,
		});

		expect(reason).toBe('menu_whatsapp_only');
		expect(getTabAccessDenialMessage(reason)).toContain('solo WhatsApp');
	});

	it('modo catálogo oculta caja', () => {
		const menuCapabilities = resolvePanelCapabilities({
			cartEnabled: false,
			orderChannel: 'both',
		});

		const reason = resolveTabAccessDenialReason({
			...ceoCtx,
			tabId: 'caja',
			menuCapabilities,
		});

		expect(reason).toBe('menu_catalog');
		expect(getTabAccessDenialMessage(reason)).toContain('catálogo');
	});

	it('panelAccess restringe pestañas del tema', () => {
		const menuCapabilities = resolvePanelCapabilities({
			cartEnabled: true,
			orderChannel: 'both',
		});

		const reason = resolveTabAccessDenialReason({
			...ceoCtx,
			tabId: 'coupons',
			normalizedPanelAccess: ['orders', 'caja', 'products'],
			menuCapabilities,
		});

		expect(reason).toBe('panel_access');
		expect(getTabAccessDenialMessage(reason)).toContain('habilitada');
	});

	it('cajero sin reportes es restricción de rol', () => {
		const menuCapabilities = resolvePanelCapabilities({
			cartEnabled: true,
			orderChannel: 'both',
		});

		const reason = resolveTabAccessDenialReason({
			userRole: 'cashier',
			normalizedPanelAccess: null,
			tabId: 'analytics',
			menuCapabilities,
		});

		expect(reason).toBe('role');
		expect(getTabAccessDenialMessage(reason)).toContain('rol diferente');
	});

	it('hint del sidebar distingue rol vs configuración', () => {
		const menuCapabilities = resolvePanelCapabilities({
			cartEnabled: false,
			orderChannel: 'both',
		});

		const configHint = resolveSidebarRestrictedHint(['caja', 'analytics'], {
			...ceoCtx,
			menuCapabilities,
		});
		expect(configHint).toContain('desactivadas');

		const roleHint = resolveSidebarRestrictedHint(['analytics'], {
			userRole: 'cashier',
			normalizedPanelAccess: null,
			menuCapabilities: resolvePanelCapabilities({
				cartEnabled: true,
				orderChannel: 'both',
			}),
		});
		expect(roleHint).toContain('rol diferente');
	});
});
