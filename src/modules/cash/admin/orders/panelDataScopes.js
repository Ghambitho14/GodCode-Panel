/** Tabs que necesitan lista de clientes en memoria. */
const CLIENTS_TABS = new Set(['orders', 'clients', 'caja', 'analytics', 'local_expenses']);

/** Tabs que necesitan catálogo (productos/categorías mergeados). */
const CATALOG_TABS = new Set([
	'orders',
	'products',
	'categories',
	'inventory',
	'menu_beverages',
	'menu_extras',
	'menu_options',
	'caja',
	'analytics',
]);

/** Tabs que necesitan filas inventory_branch resumidas. */
const INVENTORY_SUMMARY_TABS = new Set(['inventory', 'menu_beverages', 'menu_extras', 'orders']);

const CASH_TABS = new Set(['caja', 'orders', 'analytics', 'local_expenses']);

/**
 * @param {string} activeTab
 * @param {{ isManualOrderOpen?: boolean }} [opts]
 */
export function resolvePanelDataScope(activeTab, opts = {}) {
	const tab = String(activeTab || 'orders');
	return {
		orders: true,
		clients: CLIENTS_TABS.has(tab),
		catalog: CATALOG_TABS.has(tab) || Boolean(opts.isManualOrderOpen),
		inventorySummary: INVENTORY_SUMMARY_TABS.has(tab),
		cash: CASH_TABS.has(tab),
	};
}

/** Scope mínimo al montar / cambiar sucursal (tab pedidos por defecto). */
export function initialBranchLoadScope(activeTab = 'orders') {
	return resolvePanelDataScope(activeTab);
}

/**
 * Datasets a refrescar al volver visible según tab activo.
 * @param {string} activeTab
 */
export function resolveStaleRefreshScope(activeTab) {
	const base = resolvePanelDataScope(activeTab);
	return {
		orders: base.orders,
		clients: base.clients,
		catalog: base.catalog,
		inventorySummary: base.inventorySummary,
	};
}
