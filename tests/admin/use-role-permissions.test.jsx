import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Base falsa: lo que devuelve cada tabla y qué tablas se consultaron. */
const db = vi.hoisted(() => ({
	users: { data: null, error: null },
	roleDefinitions: { data: null, error: null },
	queried: [],
}));

vi.mock('@/integrations/supabase', () => {
	const query = (table) => {
		db.queried.push(table);
		const chain = {
			select: () => chain,
			eq: () => chain,
			maybeSingle: async () => (table === 'users' ? db.users : db.roleDefinitions),
		};
		return chain;
	};
	return {
		supabase: { from: query },
		TABLES: { users: 'users', role_definitions: 'role_definitions', company_roles: 'company_roles' },
		getCurrentUser: () => ({ id: 'auth-1', email: 'mesero@example.com' }),
		bootstrapSession: async () => null,
	};
});

import { useRolePermissions } from '@/modules/cash/admin/hooks/useRolePermissions';

const CASHIER_DEFINITION = { data: { nav_tabs: ['orders', 'caja', 'local_expenses'], actions: ['coupons.send_email'] }, error: null };

beforeEach(() => {
	db.users = { data: null, error: null };
	db.roleDefinitions = CASHIER_DEFINITION;
	db.queried = [];
});

afterEach(cleanup);

async function permissionsFor(role) {
	const { result } = renderHook(() => useRolePermissions(role));
	await waitFor(() => expect(result.current.ready).toBe(true));
	return result.current.permissions;
}

describe('useRolePermissions: rol propio del negocio', () => {
	it('un cajero con rol propio usa sus pestañas y acciones, no las del cajero', async () => {
		db.users = { data: { company_role: { nav_tabs: ['orders'], actions: ['orders.refund'] } }, error: null };
		expect(await permissionsFor('cashier')).toEqual({ navTabs: ['orders'], actions: ['orders.refund'] });
		expect(db.queried).toEqual(['users']);
	});

	it('un cajero sin rol propio sigue con lo que el super admin le dio al cajero', async () => {
		db.users = { data: { company_role: null }, error: null };
		expect(await permissionsFor('staff')).toEqual({ navTabs: ['orders', 'caja', 'local_expenses'], actions: ['coupons.send_email'] });
		expect(db.queried).toEqual(['users', 'role_definitions']);
	});

	it('si la base aún no conoce los roles propios, rige el rol general', async () => {
		db.users = { data: null, error: { message: 'Could not find a relationship between users and company_roles' } };
		expect(await permissionsFor('cashier')).toEqual({ navTabs: ['orders', 'caja', 'local_expenses'], actions: ['coupons.send_email'] });
	});

	it('admin no busca rol propio', async () => {
		db.roleDefinitions = { data: { nav_tabs: null, actions: [] }, error: null };
		expect(await permissionsFor('admin')).toEqual({ navTabs: null, actions: [] });
		expect(db.queried).toEqual(['role_definitions']);
	});
});
