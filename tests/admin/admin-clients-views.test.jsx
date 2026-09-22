import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AdminClients from '@/modules/cash/components/AdminClients';

const fetchMenuClientAccounts = vi.fn();

vi.mock('@/modules/cash/services/menuAccountsService', () => ({
	fetchMenuClientAccounts: (...args) => fetchMenuClientAccounts(...args),
}));

vi.mock('@/modules/cash/components/ClientFormModal', () => ({
	default: () => null,
}));

vi.mock('@/modules/cash/hooks/useBranchMoney', () => ({
	useBranchMoney: () => ({ formatMoney: (value) => `$${value}`, locale: 'es-CL' }),
}));

vi.mock('@/modules/cash/admin/pages/AdminProvider', () => ({
	useAdmin: () => ({ companyProfile: { country_code: 'CL' }, selectedBranch: null }),
}));

vi.mock('@/integrations/supabase', () => ({
	supabase: { from: () => ({ delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) }) },
	TABLES: { clients: 'clients' },
}));

const CON_CUENTA = { id: 'cli-1', name: 'Ada Registrada', phone: '+56 9 1111 1111', total_orders: 4, total_spent: 40000, last_order_at: '2026-09-10T12:00:00Z' };
const SIN_CUENTA = { id: 'cli-2', name: 'Pedro Rápido', phone: '+56 9 2222 2222', total_orders: 1, total_spent: 10000, last_order_at: '2026-09-11T12:00:00Z' };

const CUENTA = {
	id: 'acc-1',
	clientId: 'cli-1',
	preferredBranchId: null,
	documentCountry: 'CL',
	isActive: true,
	lastLoginAt: '2026-09-17T11:27:55Z',
	createdAt: '2026-09-06T22:15:38Z',
};

let container;
let root;

beforeEach(() => {
	container = document.createElement('div');
	container.className = 'admin-layout';
	document.body.appendChild(container);
	globalThis.IS_REACT_ACT_ENVIRONMENT = true;
	fetchMenuClientAccounts.mockReset();
});

afterEach(() => {
	act(() => root?.unmount());
	container.remove();
});

const names = () => Array.from(container.querySelectorAll('.clients-table tbody h4')).map((h) => h.textContent);
const tabByLabel = (label) =>
	Array.from(container.querySelectorAll('.clients-view-tab')).find((b) => b.textContent.includes(label));

async function render(accounts) {
	fetchMenuClientAccounts.mockResolvedValue({ ok: true, accounts, error: null });
	root = createRoot(container);
	await act(async () => {
		root.render(
			<AdminClients
				clients={[CON_CUENTA, SIN_CUENTA]}
				orders={[]}
				onSelectClient={() => {}}
				onClientCreated={() => {}}
				onClientDeleted={() => {}}
				showNotify={() => {}}
				companyId="company-1"
			/>,
		);
	});
}

/**
 * La pestaña de clientes se parte en dos: quien tiene cuenta en el menú digital
 * y quien solo dejó una ficha al comprar ("comprador rápido"). El corte lo da
 * `menu_client_accounts.client_id`, que llega por RPC.
 */
describe('AdminClients: cuentas y compradores rápidos', () => {
	it('abre en Cuentas y ahí solo salen las fichas con cuenta', async () => {
		await render([CUENTA]);

		expect(tabByLabel('Cuentas').getAttribute('aria-selected')).toBe('true');
		expect(names()).toEqual(['Ada Registrada']);
	});

	it('manda a compradores rápidos las fichas sin cuenta', async () => {
		await render([CUENTA]);

		await act(async () => {
			tabByLabel('Compradores rápidos').click();
		});

		expect(names()).toEqual(['Pedro Rápido']);
	});

	it('muestra la cuenta aunque todavía no tenga ficha de cliente', async () => {
		await render([{ ...CUENTA, clientId: null }]);

		expect(names()).toEqual(['Cuenta sin pedidos']);
		// Sin cuenta que las reclame, las dos fichas son compradores rápidos.
		await act(async () => {
			tabByLabel('Compradores rápidos').click();
		});
		expect(names()).toEqual(['Pedro Rápido', 'Ada Registrada']);
	});

	it('no ofrece eliminar la ficha que respalda una cuenta', async () => {
		await render([CUENTA]);

		await act(async () => {
			container.querySelector('[data-clients-kebab-id]').click();
		});

		const menu = document.querySelector('.clients-kebab-menu--portal');
		expect(menu).not.toBeNull();
		expect(menu.textContent).toContain('No se puede eliminar');
		expect(menu.textContent).not.toContain('Eliminar cliente');
	});
});
