/**
 * Caché de pedidos y clientes del panel — mismo contrato que `panelCatalogCache`:
 * RAM (+ sessionStorage para clientes) con dedup de peticiones en vuelo y TTL corto.
 *
 * Los pedidos se mantienen frescos vía Realtime; esta caché solo evita refetch
 * redundante (doble montaje inicial, cambio de pestaña dentro del TTL). Tras un
 * evento Realtime o una escritura se invalida la entrada correspondiente.
 */

import { monitor } from '@/shared/monitor';

/** TTL por defecto, alineado con DATA_STALE_MS del AdminProvider. */
export const PANEL_DATA_MAX_AGE_MS = 60_000;

const STORAGE_PREFIX = 'gc:paneldata:';

/** @type {Map<string, { data: unknown, fetchedAt: number }>} */
const entries = new Map();

/** @type {Map<string, Promise<unknown>>} */
const inFlight = new Map();

function clientsKey(companyId) {
	return `clients:${String(companyId)}`;
}

function ordersKey(companyId, branchId) {
	return `orders:${String(companyId)}:${String(branchId)}`;
}

function inventoryKey(branchId) {
	return `inventory:${String(branchId)}`;
}

function storageKey(key) {
	return STORAGE_PREFIX + key;
}

function readSession(key) {
	try {
		const raw = sessionStorage.getItem(storageKey(key));
		return raw ? JSON.parse(raw) : null;
	} catch {
		return null;
	}
}

/** @param {string} key @param {{ data: unknown, fetchedAt: number }} entry */
function writeSession(key, entry) {
	try {
		sessionStorage.setItem(storageKey(key), JSON.stringify(entry));
	} catch {
		// QuotaExceededError: no persistir, RAM sigue OK
	}
}

function removeSession(key) {
	try {
		sessionStorage.removeItem(storageKey(key));
	} catch {
		// ignore
	}
}

function isFresh(entry, maxAgeMs) {
	if (!entry) return false;
	return Date.now() - entry.fetchedAt < maxAgeMs;
}

/**
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} fetcher
 * @param {{ maxAgeMs?: number, force?: boolean, useSession?: boolean }} [options]
 * @returns {Promise<T>}
 */
async function getCached(key, fetcher, options = {}) {
	const maxAgeMs = options.maxAgeMs ?? PANEL_DATA_MAX_AGE_MS;
	const force = Boolean(options.force);
	const useSession = Boolean(options.useSession);

	if (!force) {
		const hit = entries.get(key);
		if (isFresh(hit, maxAgeMs)) {
			return /** @type {T} */ (hit.data);
		}

		if (useSession) {
			const sessionHit = readSession(key);
			if (isFresh(sessionHit, maxAgeMs)) {
				entries.set(key, sessionHit);
				return /** @type {T} */ (sessionHit.data);
			}
		}
	}

	const pending = inFlight.get(key);
	if (pending) {
		return /** @type {Promise<T>} */ (pending);
	}

	const promise = (async () => {
		const startedAt = Date.now();
		try {
			const data = await fetcher();
			const entry = { data, fetchedAt: Date.now() };
			entries.set(key, entry);
			if (useSession) writeSession(key, entry);
			if (import.meta.env.DEV) {
				monitor.info('cache', 'fetch_ok', { key, ms: Date.now() - startedAt });
			}
			return data;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			monitor.error('cache', 'fetch_error', { key, message });
			throw err;
		} finally {
			inFlight.delete(key);
		}
	})();

	inFlight.set(key, promise);
	return promise;
}

function invalidate(key, useSession) {
	entries.delete(key);
	inFlight.delete(key);
	if (useSession) removeSession(key);
}

/**
 * @template T
 * @param {string | null | undefined} companyId
 * @param {() => Promise<T>} fetcher
 * @param {{ force?: boolean }} [options]
 */
export function getCompanyClients(companyId, fetcher, options) {
	if (!companyId) return fetcher();
	return getCached(clientsKey(companyId), fetcher, { force: options?.force, useSession: true });
}

/**
 * @template T
 * @param {string | null | undefined} companyId
 * @param {string | null | undefined} branchId
 * @param {() => Promise<T>} fetcher
 * @param {{ force?: boolean }} [options]
 */
export function getBranchOrders(companyId, branchId, fetcher, options) {
	if (!companyId || !branchId) return fetcher();
	return getCached(ordersKey(companyId, branchId), fetcher, { force: options?.force });
}

/** @param {string | null | undefined} companyId */
export function invalidateCompanyClients(companyId) {
	if (!companyId) return;
	invalidate(clientsKey(companyId), true);
}

/** @param {string | null | undefined} companyId @param {string | null | undefined} branchId */
export function invalidateBranchOrders(companyId, branchId) {
	if (!companyId || !branchId) return;
	invalidate(ordersKey(companyId, branchId), false);
}

/**
 * @template T
 * @param {string | null | undefined} branchId
 * @param {() => Promise<T>} fetcher
 * @param {{ force?: boolean }} [options]
 */
export function getBranchInventory(branchId, fetcher, options) {
	if (!branchId || branchId === 'all') return fetcher();
	return getCached(inventoryKey(branchId), fetcher, { force: options?.force });
}

/** @param {string | null | undefined} branchId */
export function invalidateBranchInventory(branchId) {
	if (!branchId || branchId === 'all') return;
	invalidate(inventoryKey(branchId), false);
}

export function invalidateAllPanelData() {
	entries.clear();
	inFlight.clear();
	try {
		const keysToRemove = [];
		for (let i = 0; i < sessionStorage.length; i += 1) {
			const k = sessionStorage.key(i);
			if (k && k.startsWith(STORAGE_PREFIX)) keysToRemove.push(k);
		}
		keysToRemove.forEach((k) => sessionStorage.removeItem(k));
	} catch {
		// ignore
	}
}

/** Solo para tests. */
export function resetPanelDataCacheForTests() {
	invalidateAllPanelData();
}
