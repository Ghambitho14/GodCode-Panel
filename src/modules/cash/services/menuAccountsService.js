import { supabase } from '@/integrations/supabase';

/**
 * Cuentas del menú digital para el listado de clientes del panel.
 *
 * `menu_client_accounts` es deny-all en RLS y sus columnas personales están
 * cifradas con una llave que vive fuera de la base, así que no se puede leer
 * con la anon key ni sacarle nada legible. La RPC
 * `menu_client_accounts_panel_list` (SECURITY DEFINER, con guardia de empresa
 * adentro) devuelve solo el esqueleto: con qué ficha de `clients` está
 * vinculada la cuenta y cuatro datos operativos. Nombre, teléfono y métricas
 * salen de esa ficha, que el panel ya lee en claro.
 */
const RPC_NAME = 'menu_client_accounts_panel_list';

/**
 * @param {unknown} row
 * @returns {{ id: string, clientId: string|null, preferredBranchId: string|null, documentCountry: string|null, isActive: boolean, lastLoginAt: string|null, createdAt: string|null }|null}
 */
function normalizeAccount(row) {
	if (!row || typeof row !== 'object') return null;
	const id = String(row.id ?? '').trim();
	if (!id) return null;
	const clientId = String(row.client_id ?? '').trim();
	const branchId = String(row.preferred_branch_id ?? '').trim();
	const country = String(row.document_country ?? '').trim();
	return {
		id,
		clientId: clientId || null,
		preferredBranchId: branchId || null,
		documentCountry: country || null,
		isActive: row.is_active !== false,
		lastLoginAt: row.last_login_at ?? null,
		createdAt: row.created_at ?? null,
	};
}

/**
 * @param {unknown} companyId
 * @returns {Promise<{ ok: boolean, accounts: ReturnType<typeof normalizeAccount>[], error: unknown }>}
 */
export async function fetchMenuClientAccounts(companyId) {
	const id = String(companyId ?? '').trim();
	if (!id) return { ok: true, accounts: [], error: null };

	const { data, error } = await supabase.rpc(RPC_NAME, { p_company_id: id });
	if (error) {
		// Una base sin la migración aplicada responde 404/42883. El listado de
		// clientes no debe caerse por eso: se avisa y se sigue con las fichas.
		console.warn('[clientes] no se pudieron leer las cuentas del menú:', error.message || error);
		return { ok: false, accounts: [], error };
	}

	const rows = Array.isArray(data) ? data : [];
	return { ok: true, accounts: rows.map(normalizeAccount).filter(Boolean), error: null };
}

/** Memoria corta para no repetir la RPC cada vez que se abre el paso de cliente. */
const ACCOUNTS_CACHE_TTL_MS = 60_000;
const accountsCache = new Map();

/**
 * Igual que `fetchMenuClientAccounts`, pero reutiliza la última respuesta por un
 * minuto. Las cuentas cambian cuando alguien se registra, no cada pedido.
 * @param {unknown} companyId
 * @param {{ force?: boolean }} [options]
 */
export async function fetchMenuClientAccountsCached(companyId, options = {}) {
	const id = String(companyId ?? '').trim();
	if (!id) return { ok: true, accounts: [], error: null };

	const hit = accountsCache.get(id);
	if (!options.force && hit && Date.now() - hit.at < ACCOUNTS_CACHE_TTL_MS) {
		return hit.result;
	}

	const result = await fetchMenuClientAccounts(id);
	if (result.ok) accountsCache.set(id, { at: Date.now(), result });
	return result;
}

/**
 * Ids de fichas de `clients` que respaldan una cuenta: son los únicos clientes
 * afiliados que el POS puede elegir, porque de esa ficha salen nombre y contacto.
 * @param {Array<{ clientId: string|null }>} accounts
 * @returns {Set<string>}
 */
export function accountClientIdSet(accounts) {
	const ids = new Set();
	(Array.isArray(accounts) ? accounts : []).forEach((account) => {
		const id = String(account?.clientId ?? '').trim();
		if (id) ids.add(id);
	});
	return ids;
}
