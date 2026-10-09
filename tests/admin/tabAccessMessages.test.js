import { describe, expect, it } from 'vitest';
import {
	MENU_ONLY_PANEL_TABS,
	applyPlanProductModeToPanelAccess,
	resolvePanelCapabilities,
} from '@/lib/tenant/menu-settings';
import { normalizeStoredNavTabId } from '@/shared/constants/admin-panel-tabs';
import {
	getNoAccessibleTabsMessage,
	getTabAccessDenialMessage,
	getTabAccessDenialMessageForTab,
	resolveAllowedPanelTabIds,
	resolveRoleAllowedTabIds,
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

describe('plan «solo menú digital»', () => {
	const menuOnly = (cartEnabled = true) => resolvePanelCapabilities(
		{ cartEnabled, orderChannel: 'both' },
		{ product_mode: 'menu_only', online_ordering: false },
	);
	// Lo que llega a AdminProvider: `panelAccess` recortado por el plan (admin-app.tsx).
	const panelAccess = (stored) => applyPlanProductModeToPanelAccess('menu_only', stored, normalizeStoredNavTabId)
		.map(normalizeStoredNavTabId);

	it('el cajero ve el catálogo en vez de quedarse sin pestañas', () => {
		for (const userRole of ['cashier', 'staff', 'Cashier ']) {
			expect(resolveAllowedPanelTabIds({
				userRole,
				normalizedPanelAccess: panelAccess(null),
				menuCapabilities: menuOnly(),
			})).toEqual(MENU_ONLY_PANEL_TABS);
		}
		expect(resolveRoleAllowedTabIds('cashier', 'menu_only')).toEqual(MENU_ONLY_PANEL_TABS);
		// Con el plan completo el cajero sigue con su caja.
		expect(resolveRoleAllowedTabIds('cashier', 'full')).toEqual(['orders', 'caja', 'local_expenses']);
	});

	it('dueño y cajero ven lo mismo, dentro del panelAccess del local', () => {
		const ctx = { normalizedPanelAccess: panelAccess(['orders', 'products', 'carousel']), menuCapabilities: menuOnly(false) };
		expect(resolveAllowedPanelTabIds({ ...ctx, userRole: 'owner' })).toEqual(['products', 'menu_carousel']);
		expect(resolveAllowedPanelTabIds({ ...ctx, userRole: 'cashier' })).toEqual(['products', 'menu_carousel']);
	});

	it('la caja se niega por el plan, con un aviso que lo dice', () => {
		const ctx = { userRole: 'cashier', normalizedPanelAccess: panelAccess(null), menuCapabilities: menuOnly() };
		expect(resolveTabAccessDenialReason({ ...ctx, tabId: 'products' })).toBeNull();
		expect(resolveTabAccessDenialReason({ ...ctx, tabId: 'caja' })).toBe('menu_only_plan');
		expect(getTabAccessDenialMessageForTab({ ...ctx, tabId: 'caja' }))
			.toBe('Tu plan es solo menú digital. Esta sección no está incluida.');
	});

	it('sin rol todavía se usa el acceso del local sin lo que oculta el canal', () => {
		expect(resolveAllowedPanelTabIds({
			userRole: null,
			normalizedPanelAccess: null,
			menuCapabilities: resolvePanelCapabilities({ cartEnabled: true, orderChannel: 'whatsapp_only' }),
		})).not.toContain('orders');
	});

	it('si aun así no queda ninguna pestaña, el panel lo explica', () => {
		expect(resolveAllowedPanelTabIds({
			userRole: 'cashier',
			normalizedPanelAccess: ['products'],
			menuCapabilities: resolvePanelCapabilities({ cartEnabled: true, orderChannel: 'both' }),
		})).toEqual([]);
		expect(getNoAccessibleTabsMessage('menu_only')).toEqual({
			title: 'Tu plan no incluye caja',
			text: 'Carga tu menú desde el panel CEO.',
		});
		expect(getNoAccessibleTabsMessage('full')).toEqual({
			title: 'No tienes secciones habilitadas',
			text: 'Pide a un administrador que habilite tu acceso a este panel.',
		});
	});
});
