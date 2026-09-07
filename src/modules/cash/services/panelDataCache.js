/**
 * Caché de pedidos, clientes e inventario del panel. El motor —RAM +
 * sessionStorage, dedup de peticiones en vuelo y TTL corto— vive en
 * `createSessionCache`, compartido con `panelCatalogCache`.
 *
 * Los pedidos se mantienen frescos vía Realtime; esta caché solo evita refetch
 * redundante (doble montaje inicial, cambio de pestaña dentro del TTL). Tras un
 * evento Realtime o una escritura se invalida la entrada correspondiente.
 */

import { monitor } from '@/shared/monitor';
import { createSessionCache } from './createSessionCache';

/** TTL por defecto, alineado con DATA_STALE_MS del AdminProvider. */
export const PANEL_DATA_MAX_AGE_MS = 60_000;

const cache = createSessionCache({
	prefix: 'gc:paneldata:',
	defaultMaxAgeMs: PANEL_DATA_MAX_AGE_MS,
	// Solo los clientes se persisten; pedidos e inventario viven en RAM.
	useSession: false,
	monitor,
});

function clientsKey(companyId) {
	return `clients:${String(companyId)}`;
}

function ordersKey(companyId, branchId) {
	return `orders:${String(companyId)}:${String(branchId)}`;
}

function inventoryKey(branchId) {
	return `inventory:${String(branchId)}`;
}

/**
 * @template T
 * @param {string | null | undefined} companyId
 * @param {() => Promise<T>} fetcher
 * @param {{ force?: boolean }} [options]
 */
export function getCompanyClients(companyId, fetcher, options) {
	if (!companyId) return fetcher();
	return cache.getCached(clientsKey(companyId), fetcher, { force: options?.force, useSession: true });
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
	return cache.getCached(ordersKey(companyId, branchId), fetcher, { force: options?.force });
}

/** @param {string | null | undefined} companyId */
export function invalidateCompanyClients(companyId) {
	if (!companyId) return;
	cache.invalidate(clientsKey(companyId), true);
}

/** @param {string | null | undefined} companyId @param {string | null | undefined} branchId */
export function invalidateBranchOrders(companyId, branchId) {
	if (!companyId || !branchId) return;
	cache.invalidate(ordersKey(companyId, branchId), false);
}

/**
 * @template T
 * @param {string | null | undefined} branchId
 * @param {() => Promise<T>} fetcher
 * @param {{ force?: boolean }} [options]
 */
export function getBranchInventory(branchId, fetcher, options) {
	if (!branchId || branchId === 'all') return fetcher();
	return cache.getCached(inventoryKey(branchId), fetcher, { force: options?.force });
}

/** @param {string | null | undefined} branchId */
export function invalidateBranchInventory(branchId) {
	if (!branchId || branchId === 'all') return;
	cache.invalidate(inventoryKey(branchId), false);
}

export function invalidateAllPanelData() {
	cache.clearAll();
}

/** Solo para tests. */
export function resetPanelDataCacheForTests() {
	cache.clearAll();
}
