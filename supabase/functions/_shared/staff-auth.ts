/**
 * Quién llama a una Edge Function del panel y de qué empresa es.
 *
 * Antes cada función lo resolvía a su manera: `tenant-tickets`, `geocode` y
 * `tenant-broadcasts` buscaban en `users` por email, se quedaban con la primera
 * fila de cualquier empresa y no miraban `is_active`, así que un usuario
 * desactivado seguía entrando. Ahora todas pasan por aquí:
 *
 *  1. El JWT se valida contra Auth (`getUser`).
 *  2. La fila se busca por `auth_user_id`, igual que `current_user_company_id()`
 *     en las políticas RLS.
 *  3. Con `allowEmailFallback`, si no hay fila por `auth_user_id` se prueba por
 *     email (usuarios viejos sin vincular, como hace `useAdminAuth` en el panel),
 *     y únicamente si hay una sola fila activa: con varias empresas no se adivina.
 *     Cada uso queda en el log como `staff.email_fallback` para poder quitarlo.
 *     `client-pii` y `coupon-emails` no lo usan: para datos personales basta con
 *     que alguien registre en Auth el correo de un cajero sin cuenta.
 *  4. `is_active = false` corta siempre.
 */

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";

export type StaffContext = {
	admin: SupabaseClient;
	userClient: SupabaseClient;
	companyId: string;
	authUserId: string;
	email: string;
	role: string;
};

export type StaffContextError = { error: string; status: number };

type UserRow = { company_id: string | null; role: string | null; is_active: boolean | null };

type ResolveOptions = {
	/** Roles que entran sin más. */
	roles: ReadonlySet<string>;
	/** Mensaje del 403 que ve el panel. */
	forbiddenMessage: string;
	/** Buscar por email si la fila no está vinculada por `auth_user_id`. */
	allowEmailFallback?: boolean;
	/** Para roles fuera de `roles` (permisos configurables por empresa). */
	extraRoleCheck?: (role: string, userClient: SupabaseClient, admin: SupabaseClient) => Promise<boolean>;
};

function getEnv(name: string): string {
	const value = Deno.env.get(name);
	if (!value) throw new Error(`Falta variable de entorno: ${name}`);
	return value;
}

function normalizeRole(role: unknown): string {
	return String(role ?? "").trim().toLowerCase();
}

export function staffLog(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown>): void {
	const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields });
	if (level === "error") console.error(line);
	else if (level === "warn") console.warn(line);
	else console.log(line);
}

export async function resolveStaff(
	authHeader: string | null,
	options: ResolveOptions,
): Promise<StaffContext | StaffContextError> {
	if (!authHeader) return { error: "No autenticado", status: 401 };

	const userClient = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_ANON_KEY"), {
		global: { headers: { Authorization: authHeader } },
		auth: { persistSession: false, autoRefreshToken: false },
	});
	const { data, error } = await userClient.auth.getUser();
	if (error || !data.user?.id) return { error: "No autenticado", status: 401 };

	const authUserId = data.user.id;
	const email = String(data.user.email ?? "").trim().toLowerCase();
	const admin = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
		auth: { persistSession: false, autoRefreshToken: false },
	});

	const { data: byAuth, error: byAuthError } = await admin
		.from("users")
		.select("company_id, role, is_active")
		.eq("auth_user_id", authUserId)
		.limit(1)
		.maybeSingle();
	if (byAuthError) {
		staffLog("error", "staff.lookup_error", { auth_user_id: authUserId, error: byAuthError.message });
		return { error: "Error interno", status: 500 };
	}

	let row = byAuth as UserRow | null;
	if (!row && email && options.allowEmailFallback) {
		const { data: byEmail, error: byEmailError } = await admin
			.from("users")
			.select("company_id, role, is_active")
			.eq("email", email);
		if (byEmailError) {
			staffLog("error", "staff.lookup_error", { auth_user_id: authUserId, error: byEmailError.message });
			return { error: "Error interno", status: 500 };
		}
		const candidates = ((byEmail ?? []) as UserRow[]).filter(
			(candidate) => candidate.company_id && candidate.is_active !== false,
		);
		if (candidates.length > 1) {
			staffLog("warn", "staff.email_ambiguous", { auth_user_id: authUserId, matches: candidates.length });
			return { error: options.forbiddenMessage, status: 403 };
		}
		row = candidates[0] ?? null;
		if (row) staffLog("warn", "staff.email_fallback", { auth_user_id: authUserId, company_id: row.company_id });
	}

	const role = normalizeRole(row?.role);
	if (!row?.company_id || row.is_active === false) {
		return { error: options.forbiddenMessage, status: 403 };
	}
	const allowed =
		options.roles.has(role) ||
		(options.extraRoleCheck ? await options.extraRoleCheck(role, userClient, admin) : false);
	if (!allowed) return { error: options.forbiddenMessage, status: 403 };

	return { admin, userClient, companyId: String(row.company_id), authUserId, email, role };
}
