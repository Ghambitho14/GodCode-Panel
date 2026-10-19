import { useEffect, useState } from 'react';

import { bootstrapSession, getCurrentUser, supabase, TABLES } from '@/integrations/supabase';
import { normalizePanelUserRole } from '@/shared/constants/admin-panel-tabs';

/**
 * Pestañas y acciones que el super admin le dio al rol (Configuración → Roles, columnas
 * `role_definitions.nav_tabs` y `actions`). `null` mientras carga, si la lectura falla o
 * si la base aún no tiene esas columnas: entonces rige lo del código, como antes
 * (`DEFAULT_ROLE_NAV_PERMISSIONS` y admin/ceo para las acciones).
 *
 * Un cajero con rol propio del negocio (/cuenta › Equipo, `users.company_role_id`) usa
 * las pestañas y acciones de ese rol en vez de las del cajero.
 *
 * `ready` pasa a true cuando la lectura terminó (bien o mal): hasta entonces no hay que
 * sacar al usuario de una pestaña que quizás sí tiene.
 *
 * @param {string | null | undefined} userRole
 * @returns {{ permissions: { navTabs: string[] | null, actions: string[] } | null, ready: boolean }}
 */
export function useRolePermissions(userRole) {
	const roleKey = normalizePanelUserRole(userRole);
	const [state, setState] = useState({ roleKey: null, permissions: null });

	useEffect(() => {
		if (!roleKey) return undefined;
		let alive = true;
		void (async () => {
			try {
				const permissions = (roleKey === 'cashier' ? await readCompanyRole() : null) ?? (await readRoleDefinition(roleKey));
				if (alive) setState({ roleKey, permissions });
			} catch {
				if (alive) setState({ roleKey, permissions: null });
			}
		})();
		return () => {
			alive = false;
		};
	}, [roleKey]);

	// Al cambiar de rol no se arrastran los permisos del anterior.
	const ready = Boolean(roleKey) && state.roleKey === roleKey;
	return { permissions: ready ? state.permissions : null, ready };
}

function toPermissions(row) {
	return {
		navTabs: Array.isArray(row.nav_tabs) ? row.nav_tabs : null,
		actions: Array.isArray(row.actions) ? row.actions : [],
	};
}

async function readRoleDefinition(roleKey) {
	const { data, error } = await supabase
		.from(TABLES.role_definitions)
		.select('nav_tabs, actions')
		.eq('name', roleKey)
		.maybeSingle();
	return !error && data ? toPermissions(data) : null;
}

/** El rol propio del usuario de la sesión; `null` si no tiene (o la base aún no lo conoce). */
async function readCompanyRole() {
	const authUserId = (getCurrentUser() ?? (await bootstrapSession()))?.id;
	if (!authUserId) return null;
	const { data, error } = await supabase
		.from(TABLES.users)
		.select('company_role:company_roles(nav_tabs, actions)')
		.eq('auth_user_id', authUserId)
		.maybeSingle();
	return !error && data?.company_role ? toPermissions(data.company_role) : null;
}
