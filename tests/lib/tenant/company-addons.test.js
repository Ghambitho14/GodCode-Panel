import { describe, expect, it } from 'vitest';
import { activeCompanyAddons, addonDynamicModules, mergeAddonPanelAccess } from '@/lib/tenant/company-addons';
import { addonIdFromTab, addonTabId, buildAddonRegistry } from '@/addons/registry';
import { normalizeStoredNavTabId } from '@/shared/constants/admin-panel-tabs';

const NOW = new Date('2026-10-12T12:00:00.000Z');
const addon = (name, unlocks_tabs = []) => ({ id: `a-${name}`, name, description: null, unlocks_tabs });

describe('company-addons', () => {
	it('solo cuenta los extras activos y sin vencer', () => {
		const rows = [
			{ id: '1', status: 'active', expires_at: null, addon: addon('Cuadre', ['caja']) },
			{ id: '2', status: 'active', expires_at: '2026-10-11T00:00:00.000Z', addon: addon('Vencido', ['analytics']) },
			{ id: '3', status: 'cancelled', expires_at: null, addon: addon('Quitado', ['clients']) },
			{ id: '4', status: 'active', expires_at: '2026-11-01T00:00:00.000Z', addon: [addon('Dominio')] },
			{ id: '5', status: 'active', expires_at: null, addon: null },
		];
		expect(activeCompanyAddons(rows, NOW).map((row) => row.name)).toEqual(['Cuadre', 'Dominio']);
		expect(activeCompanyAddons(null, NOW)).toEqual([]);
	});

	it('suma las pestañas desbloqueadas sin repetir (con los alias del panel)', () => {
		const addons = activeCompanyAddons(
			[{ id: '1', status: 'active', expires_at: null, addon: addon('Extra', ['caja', 'beverages', 'analytics']) }],
			NOW,
		);
		expect(mergeAddonPanelAccess(['orders', 'menu_beverages'], addons, normalizeStoredNavTabId)).toEqual([
			'orders',
			'menu_beverages',
			'caja',
			'analytics',
		]);
	});

	it('«todas» sigue siendo todas y sin extras no cambia nada', () => {
		const addons = activeCompanyAddons([{ id: '1', status: 'active', expires_at: null, addon: addon('X', ['caja']) }], NOW);
		expect(mergeAddonPanelAccess(null, addons)).toBeNull();
		expect(mergeAddonPanelAccess(undefined, addons)).toBeUndefined();
		const base = ['orders'];
		expect(mergeAddonPanelAccess(base, [])).toBe(base);
	});
});

describe('extras a medida en el menú', () => {
	const module = (id, extra = {}) => ({ id, label: id, Component: () => null, ...extra });
	const resolve = (id) => (id === 'cuadre-caja' ? module('cuadre-caja', { navGroup: 'sales', allowedRoles: ['admin', 'ceo'] }) : null);

	it('una pestaña por extra vigente cuyo módulo trae el panel', () => {
		const addons = activeCompanyAddons(
			[
				{ id: '1', status: 'active', expires_at: null, addon: { ...addon('Cuadre de caja'), panel_module: 'cuadre-caja' } },
				{ id: '2', status: 'active', expires_at: null, addon: { ...addon('Otro'), panel_module: 'no-existe' } },
				{ id: '3', status: 'active', expires_at: null, addon: addon('Dominio propio') },
				{ id: '4', status: 'active', expires_at: '2026-10-01T00:00:00.000Z', addon: { ...addon('Vencido'), panel_module: 'cuadre-caja' } },
			],
			NOW,
		);
		const modules = addonDynamicModules(addons, resolve);
		expect(modules).toEqual([
			{
				id: 'addon-1',
				tabId: 'module:addon-cuadre-caja',
				label: 'Cuadre de caja',
				description: '',
				navGroup: 'sales',
				navOrder: 90,
				allowedRoles: ['admin', 'ceo'],
				isActive: true,
			},
		]);
	});
});

describe('registro de src/addons', () => {
	const ok = (id) => ({ default: { id, label: id, Component: () => null } });

	it('registra cada carpeta con su manifiesto e ignora plantillas y errores', () => {
		const registry = buildAddonRegistry({
			'./cuadre-caja/index.tsx': ok('cuadre-caja'),
			'./_plantilla/index.tsx': ok('_plantilla'),
			'./mal-nombre/index.tsx': ok('otro-id'),
			'./sin-pantalla/index.tsx': { default: { id: 'sin-pantalla', label: 'x' } },
		});
		expect([...registry.keys()]).toEqual(['cuadre-caja']);
	});

	it('las pestañas de extras usan su propio prefijo', () => {
		expect(addonTabId('cuadre-caja')).toBe('module:addon-cuadre-caja');
		expect(addonIdFromTab('module:addon-cuadre-caja')).toBe('cuadre-caja');
		expect(addonIdFromTab('module:tickets')).toBeNull();
	});
});
