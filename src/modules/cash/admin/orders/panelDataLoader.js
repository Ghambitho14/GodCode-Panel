import { initialBranchLoadScope, resolvePanelDataScope, resolveStaleRefreshScope } from './panelDataScopes';

export { initialBranchLoadScope, resolvePanelDataScope, resolveStaleRefreshScope };

/**
 * Ejecuta cargas de panel según scope (menos DB en arranque).
 * @param {{
 *   scope: ReturnType<typeof resolvePanelDataScope>;
 *   isAllBranches: boolean;
 *   fetchCompanyCatalog: () => Promise<unknown>;
 *   fetchBranchOverlay: (branchId: string) => Promise<unknown>;
 *   applyCatalogToState: (companyRaw: unknown, branchRaw: unknown, isAllBranches: boolean) => void;
 *   fetchOrders: () => Promise<void>;
 *   fetchClients: () => Promise<void>;
 *   refreshInventoryBranch: () => Promise<void>;
 * }} args
 */
export async function runPanelDataLoad({
	scope,
	isAllBranches,
	fetchCompanyCatalog,
	fetchBranchOverlay,
	applyCatalogToState,
	fetchOrders,
	fetchClients,
	refreshInventoryBranch,
	branchId,
}) {
	const tasks = [];

	if (scope.catalog) {
		const [companyRaw, branchRaw] = await Promise.all([
			fetchCompanyCatalog(),
			fetchBranchOverlay(branchId),
		]);
		applyCatalogToState(companyRaw, branchRaw, isAllBranches);
	}

	if (scope.orders) tasks.push(fetchOrders());
	if (scope.clients) tasks.push(fetchClients());
	if (scope.inventorySummary && !isAllBranches) {
		tasks.push(refreshInventoryBranch());
	}

	if (tasks.length > 0) {
		await Promise.all(tasks);
	}
}

/**
 * @param {object} args
 * @param {ReturnType<typeof resolveStaleRefreshScope>} args.scope
 * @param {boolean} args.force
 * @param {string} args.companyId
 * @param {string} args.branchId
 * @param {boolean} args.isAllBranches
 * @param {() => Promise<void>} args.fetchOrders
 * @param {() => Promise<void>} args.fetchClients
 * @param {() => Promise<void>} args.refreshCatalogInner
 * @param {() => Promise<void>} args.refreshInventoryBranch
 * @param {(companyId: string) => void} args.invalidateCompanyCatalog
 * @param {(branchId: string) => void} args.invalidateBranchOverlay
 */
export async function runStalePanelRefresh({
	scope,
	force,
	companyId,
	branchId,
	isAllBranches,
	fetchOrders,
	fetchClients,
	refreshCatalogInner,
	refreshInventoryBranch,
	invalidateCompanyCatalog,
	invalidateBranchOverlay,
}) {
	const tasks = [];
	if (scope.orders) tasks.push(fetchOrders({ force }));
	if (scope.clients) tasks.push(fetchClients({ force }));
	if (scope.catalog) {
		if (force) {
			invalidateCompanyCatalog(companyId);
			if (!isAllBranches) invalidateBranchOverlay(branchId);
		}
		tasks.push(refreshCatalogInner({ force }));
	}
	if (scope.inventorySummary && !isAllBranches) {
		tasks.push(refreshInventoryBranch({ force }));
	}
	await Promise.all(tasks);
}
