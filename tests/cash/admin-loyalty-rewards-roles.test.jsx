import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AdminLoyaltyRewards from '@/modules/cash/components/AdminLoyaltyRewards';

let role = 'ceo';
let roleActions = [];
let tableData = {};

vi.mock('@/modules/cash/admin/pages/AdminProvider', () => ({
	useAdmin: () => ({ userRole: role, rolePermissions: { navTabs: null, actions: roleActions } }),
}));

vi.mock('@/modules/cash/hooks/useBranchMoney', () => ({
	useBranchMoney: () => ({ formatMoney: (value) => `$${value}`, locale: 'es-CL' }),
}));

vi.mock('@/modules/cash/services/menuAccountsService', () => ({
	fetchMenuClientAccountsCached: async () => ({ ok: true, accounts: [{ id: 'acc-1', fullName: 'Ada Cliente' }] }),
}));

// Cada consulta encadena select/eq/order/limit y al final se espera: devuelve las filas de su tabla.
vi.mock('@/integrations/supabase', () => {
	const query = (table) => {
		const builder = {
			select: () => builder,
			eq: () => builder,
			order: () => builder,
			limit: () => builder,
			then: (resolve, reject) => Promise.resolve({ data: tableData[table] ?? [], error: null }).then(resolve, reject),
		};
		return builder;
	};
	return {
		supabase: { from: (table) => query(table) },
		TABLES: { loyalty_rewards: 'loyalty_rewards', loyalty_redemptions: 'loyalty_redemptions' },
	};
});

const REWARD = {
	id: 'rew-1',
	title: '10% en tu próximo pedido',
	description: null,
	points_cost: 100,
	kind: 'discount',
	product_id: null,
	discount_type: 'percent',
	discount_value: 10,
	min_order_subtotal: null,
	valid_days: 30,
	is_active: true,
	sort_order: 0,
	created_at: '2026-10-13T12:00:00Z',
};

const REDEMPTION = {
	id: 'red-1',
	reward_title: '10% en tu próximo pedido',
	points_cost: 100,
	status: 'active',
	created_at: '2026-10-15T12:00:00Z',
	account_id: 'acc-1',
	client_id: 'cli-1',
	coupon: { code: 'PTS-ABC234', valid_until: null, redemptions_count: 0, is_active: true },
};

let container;
let root;

beforeEach(() => {
	role = 'ceo';
	roleActions = [];
	tableData = { loyalty_rewards: [REWARD], loyalty_redemptions: [REDEMPTION] };
	container = document.createElement('div');
	container.className = 'admin-layout';
	document.body.appendChild(container);
	globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
	act(() => root?.unmount());
	container.remove();
});

async function render() {
	root = createRoot(container);
	await act(async () => {
		root.render(<AdminLoyaltyRewards showNotify={() => {}} companyId="company-1" products={[]} />);
	});
}

const buttonByText = (text) =>
	Array.from(container.querySelectorAll('button')).find((b) => b.textContent.includes(text));
const buttonByTitle = (title) => container.querySelector(`button[title="${title}"]`);

describe('AdminLoyaltyRewards: quién edita las recompensas', () => {
	it.each(['ceo', 'admin'])('%s crea, edita, desactiva y elimina', async (r) => {
		role = r;
		await render();

		expect(buttonByText('Nueva recompensa')).toBeDefined();
		expect(buttonByTitle('Editar')).not.toBeNull();
		expect(buttonByTitle('Desactivar')).not.toBeNull();
		expect(buttonByTitle('Eliminar')).not.toBeNull();
		expect(container.textContent).not.toContain('Tu rol puede ver las recompensas');
	});

	it('el cajero ve las recompensas y los canjes, sin acciones', async () => {
		role = 'cashier';
		await render();

		expect(container.textContent).toContain('10% en tu próximo pedido');
		expect(container.textContent).toContain('PTS-ABC234');
		expect(container.textContent).toContain('Tu rol puede ver las recompensas, pero no crearlas ni cambiarlas.');
		expect(buttonByText('Nueva recompensa')).toBeUndefined();
		expect(buttonByTitle('Editar')).toBeNull();
		expect(buttonByTitle('Desactivar')).toBeNull();
		expect(buttonByTitle('Eliminar')).toBeNull();
	});

	it('sin recompensas, el cajero no ve «Crear primera recompensa»', async () => {
		role = 'cashier';
		tableData.loyalty_rewards = [];
		await render();

		expect(container.textContent).toContain('Todavía no hay recompensas.');
		expect(buttonByText('Crear primera recompensa')).toBeUndefined();
	});

	it('un cajero al que el super admin le dio la acción sí las edita', async () => {
		role = 'cashier';
		roleActions = ['loyalty_rewards.manage'];
		await render();

		expect(buttonByText('Nueva recompensa')).toBeDefined();
		expect(buttonByTitle('Editar')).not.toBeNull();
		expect(buttonByTitle('Eliminar')).not.toBeNull();
		expect(container.textContent).not.toContain('Tu rol puede ver las recompensas');
	});
});
