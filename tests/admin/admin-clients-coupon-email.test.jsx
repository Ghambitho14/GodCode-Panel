import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AdminClients from '@/modules/cash/components/AdminClients';

const fetchMenuClientAccounts = vi.fn();
let role = 'ceo';

vi.mock('@/modules/cash/services/menuAccountsService', () => ({
	fetchMenuClientAccounts: (...args) => fetchMenuClientAccounts(...args),
}));

vi.mock('@/modules/cash/components/ClientFormModal', () => ({
	default: () => null,
}));

// El modal real habla con la Edge Function; aquí solo importa a quién se le abrió.
vi.mock('@/modules/cash/components/SendCouponEmailModal', () => ({
	default: ({ recipients }) => (
		<div data-testid="coupon-modal">{recipients.map((r) => r.name).join(', ')}</div>
	),
}));

vi.mock('@/modules/cash/hooks/useBranchMoney', () => ({
	useBranchMoney: () => ({ formatMoney: (value) => `$${value}`, locale: 'es-CL' }),
}));

vi.mock('@/modules/cash/admin/pages/AdminProvider', () => ({
	useAdmin: () => ({ companyProfile: { country_code: 'CL' }, selectedBranch: null, userRole: role }),
}));

vi.mock('@/integrations/supabase', () => ({
	supabase: { from: () => ({}) },
	TABLES: { clients: 'clients' },
}));

const ADA = { id: 'cli-1', name: 'Ada Registrada', phone: '+56 9 1111 1111', total_orders: 4, total_spent: 40000, last_order_at: '2026-09-10T12:00:00Z' };

const cuenta = (patch) => ({
	id: 'acc-1',
	clientId: null,
	fullName: null,
	isActive: true,
	lastLoginAt: '2026-09-17T11:27:55Z',
	createdAt: '2026-09-06T22:15:38Z',
	canReceiveEmail: true,
	emailOptOut: false,
	...patch,
});

const ACCOUNTS = [
	cuenta({ id: 'acc-1', clientId: 'cli-1' }),
	cuenta({ id: 'acc-2', fullName: 'Bea Nueva' }),
	cuenta({ id: 'acc-3', fullName: 'Carla De Baja', emailOptOut: true }),
];

let container;
let root;

beforeEach(() => {
	role = 'ceo';
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

async function render(accounts = ACCOUNTS) {
	fetchMenuClientAccounts.mockResolvedValue({ ok: true, accounts, error: null });
	root = createRoot(container);
	await act(async () => {
		root.render(
			<AdminClients
				clients={[ADA]}
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

const rowOf = (name) =>
	Array.from(container.querySelectorAll('.clients-table tbody tr')).find((tr) => tr.textContent.includes(name));
const buttonByText = (text) =>
	Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes(text));
const modalText = () => document.querySelector('[data-testid="coupon-modal"]')?.textContent ?? null;

describe('AdminClients: enviar cupón por correo', () => {
	it('cada cuenta tiene su casilla; la dada de baja no se puede marcar', async () => {
		await render();

		expect(rowOf('Ada Registrada').querySelector('.clients-row-select').disabled).toBe(false);
		expect(rowOf('Bea Nueva').querySelector('.clients-row-select').disabled).toBe(false);
		const deBaja = rowOf('Carla De Baja');
		expect(deBaja.querySelector('.clients-row-select').disabled).toBe(true);
		expect(deBaja.textContent).toContain('No recibe correos');
	});

	it('marca clientes y abre el envío solo con los elegidos', async () => {
		await render();
		expect(buttonByText('Enviar cupón').disabled).toBe(true);

		await act(async () => {
			rowOf('Bea Nueva').querySelector('.clients-row-select').click();
		});
		expect(buttonByText('Enviar cupón (1)').disabled).toBe(false);

		await act(async () => {
			buttonByText('Enviar cupón (1)').click();
		});
		expect(modalText()).toBe('Bea Nueva');
	});

	it('«Elegir las cuentas» marca solo las que pueden recibir', async () => {
		await render();

		await act(async () => {
			buttonByText('Elegir las 2 cuentas para un cupón').click();
		});
		await act(async () => {
			buttonByText('Enviar cupón (2)').click();
		});
		expect(modalText()).toBe('Ada Registrada, Bea Nueva');
	});

	it('el menú ⋮ de una cuenta sin ficha ofrece el cupón y no «Ver ficha»', async () => {
		await render();

		await act(async () => {
			rowOf('Bea Nueva').querySelector('[data-clients-kebab-id]').click();
		});
		const menu = document.querySelector('.clients-kebab-menu--portal');
		expect(menu.textContent).not.toContain('Ver ficha');
		await act(async () => {
			buttonByText('Enviar cupón por correo').click();
		});
		expect(modalText()).toBe('Bea Nueva');
	});

	it('un cajero no ve nada de esto', async () => {
		role = 'cashier';
		await render();

		expect(container.querySelector('.clients-row-select')).toBeNull();
		expect(buttonByText('Enviar cupón')).toBeUndefined();
		// Sin ficha y sin cupones no hay acciones: no se muestra el ⋮.
		expect(rowOf('Bea Nueva').querySelector('[data-clients-kebab-id]')).toBeNull();
	});
});
