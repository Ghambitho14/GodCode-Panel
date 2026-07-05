import { useEffect, useRef } from 'react';
import { bumpLoadGeneration } from './loadGeneration';
import { resolvePanelDataScope } from '../orders/panelDataScopes';

export { useAdminPanelLoad } from './useAdminPanelLoad';

/**
 * Efectos de carga por sucursal/tab: generation guard, reset de estado y delta scope.
 */
export function useAdminBranchLoadEffects({
	selectedBranchId,
	companyId,
	activeTab,
	isOpenMesaModal,
	loadGenerationRef,
	loadedPanelScopeRef,
	loadDataRef,
	loadPanelData,
	setSelectedClient,
	setSelectedClientOrders,
	setHistoryOrders,
}) {
	const loadPanelDataRef = useRef(loadPanelData);
	const selectedBranchIdRef = useRef(selectedBranchId);

	useEffect(() => {
		loadPanelDataRef.current = loadPanelData;
	}, [loadPanelData]);

	useEffect(() => {
		selectedBranchIdRef.current = selectedBranchId;
	}, [selectedBranchId]);

	useEffect(() => {
		if (!selectedBranchId) return;
		bumpLoadGeneration(loadGenerationRef);
		loadedPanelScopeRef.current = {
			orders: false,
			clients: false,
			catalog: false,
			inventorySummary: false,
		};
		setSelectedClient(null);
		setSelectedClientOrders((prev) => (prev.length === 0 ? prev : []));
		setHistoryOrders((prev) => (prev.length === 0 ? prev : []));
	}, [
		selectedBranchId,
		loadGenerationRef,
		loadedPanelScopeRef,
		setSelectedClient,
		setSelectedClientOrders,
		setHistoryOrders,
	]);

	// Carga inicial al cambiar sucursal/empresa (un solo fetch scoped).
	useEffect(() => {
		if (!selectedBranchId || !companyId) return;
		void loadDataRef.current(false, 'branch');
	}, [selectedBranchId, companyId, loadDataRef]);

	// Delta solo al cambiar tab o modal manual — no repetir con el efecto de sucursal.
	useEffect(() => {
		if (!selectedBranchIdRef.current || !companyId) return;
		const needed = resolvePanelDataScope(activeTab, { isManualOrderOpen: isOpenMesaModal });
		const loaded = loadedPanelScopeRef.current;
		const delta = {
			orders: needed.orders && !loaded.orders,
			clients: needed.clients && !loaded.clients,
			catalog: needed.catalog && !loaded.catalog,
			inventorySummary: needed.inventorySummary && !loaded.inventorySummary,
		};
		if (!delta.orders && !delta.clients && !delta.catalog && !delta.inventorySummary) return;
		void loadPanelDataRef.current(delta);
	}, [activeTab, isOpenMesaModal, companyId, loadedPanelScopeRef]);
}
