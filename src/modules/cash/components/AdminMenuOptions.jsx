import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Images, Truck, LayoutGrid, Save, Armchair } from "lucide-react";
import AdminMenuDeliverySection from "./AdminMenuDeliverySection";
import AdminMenuCarousel from "./AdminMenuCarousel";
import AdminBranchTablesSection from "./AdminBranchTablesSection";
import OrdersViewSwitch from "./OrdersViewSwitch";
import LocalOrderChannelsSwitch from "./LocalOrderChannelsSwitch";
import { useAdmin } from "@/modules/cash/admin/pages/AdminProvider";
import "../styles/AdminMenuOptions.css";
import { Button } from "@/components/ui/button";

const SUB_TAB_IDS = /** @type {const} */ (["delivery", "carousel", "orders_view", "tables"]);

const SUB_TABS = [
	{ id: "delivery", label: "Envío", Icon: Truck, panel: "menu-options-panel-delivery" },
	{ id: "carousel", label: "Carrusel", Icon: Images, panel: "menu-options-panel-carousel" },
	{ id: "orders_view", label: "Vista de pedidos", Icon: LayoutGrid, panel: "menu-options-panel-orders-view" },
	{ id: "tables", label: "Mesas", Icon: Armchair, panel: "menu-options-panel-tables" },
];

function normalizeStoredSubTab(raw) {
	if (raw === "cart" || raw === "tax") return "delivery";
	if (raw && SUB_TAB_IDS.includes(/** @type {typeof SUB_TAB_IDS[number]} */ (raw))) {
		return /** @type {typeof SUB_TAB_IDS[number]} */ (raw);
	}
	return "delivery";
}

function getStoredSubTab(storageKey) {
	try {
		const normalized = normalizeStoredSubTab(localStorage.getItem(storageKey));
		if (normalized === "delivery") {
			localStorage.setItem(storageKey, "delivery");
		}
		return normalized;
	} catch {
		return "delivery";
	}
}

function channelsEqual(a, b) {
	return (
		Boolean(a?.mesa) === Boolean(b?.mesa) &&
		Boolean(a?.retiro) === Boolean(b?.retiro) &&
		Boolean(a?.delivery) === Boolean(b?.delivery)
	);
}

/**
 * Pestaña "Opciones de sucursal": Envío, Carrusel, Vista de pedidos y Mesas.
 * Bebidas/Extras viven en sidebar (menu_beverages / menu_extras).
 */
export default function AdminMenuOptions({ showNotify, selectedBranch, companyId, onDeliverySaved }) {
	const {
		ordersViewMode,
		localOrderChannels,
		saveOrdersPanelSettings,
		ordersViewModeSaving,
		setPendingSeatReservation,
		setManualOrderMode,
		setIsOpenMesaModal,
		refreshCatalog,
	} = useAdmin();

	const handleSeatReservation = useCallback(async (payload) => {
		if (!payload?.id) return;
		if (!payload.table_id) {
			showNotify?.('Asigná una mesa a la reserva antes de sentar.', 'warning');
			return;
		}
		setPendingSeatReservation(payload);
		try {
			await refreshCatalog?.();
			setManualOrderMode('session');
			setIsOpenMesaModal(true);
		} catch (e) {
			setPendingSeatReservation(null);
			showNotify?.(e instanceof Error ? e.message : 'No se pudo abrir Abrir mesa', 'error');
		}
	}, [refreshCatalog, setIsOpenMesaModal, setManualOrderMode, setPendingSeatReservation, showNotify]);

	const branchKey = selectedBranch?.id ?? "__none__";
	const branchReady = Boolean(selectedBranch?.id && selectedBranch.id !== "all");
	const [draftOrdersViewMode, setDraftOrdersViewMode] = useState(ordersViewMode);
	const [draftLocalOrderChannels, setDraftLocalOrderChannels] = useState(localOrderChannels);
	const ordersPanelDirty =
		draftOrdersViewMode !== ordersViewMode ||
		!channelsEqual(draftLocalOrderChannels, localOrderChannels);
	const storageKey = useMemo(
		() =>
			companyId
				? `tenant-admin:${companyId}:menuOptionsSubTab:${branchKey}`
				: `tenant-admin:local:menuOptionsSubTab:${branchKey}`,
		[companyId, branchKey],
	);

	const [activeSubTabByKey, setActiveSubTabByKey] = useState(() => ({}));
	const activeSubTab = activeSubTabByKey[storageKey] ?? getStoredSubTab(storageKey);

	const persistSubTab = useCallback(
		(id) => {
			setActiveSubTabByKey((prev) => ({ ...prev, [storageKey]: id }));
			try {
				localStorage.setItem(storageKey, id);
			} catch {
				/* ignore */
			}
		},
		[storageKey],
	);

	useEffect(() => {
		setDraftOrdersViewMode(ordersViewMode);
		setDraftLocalOrderChannels(localOrderChannels);
	}, [ordersViewMode, localOrderChannels, branchKey]);

	const discardOrdersPanel = useCallback(() => {
		setDraftOrdersViewMode(ordersViewMode);
		setDraftLocalOrderChannels(localOrderChannels);
	}, [ordersViewMode, localOrderChannels]);

	const handleSaveOrdersPanel = useCallback(async () => {
		await saveOrdersPanelSettings({
			ordersViewMode: draftOrdersViewMode,
			localOrderChannels: draftLocalOrderChannels,
		});
	}, [draftOrdersViewMode, draftLocalOrderChannels, saveOrdersPanelSettings]);

	const branchName = String(selectedBranch?.name ?? "").trim() || "esta sucursal";

	return (
		<div className="admin-branch-options admin-menu-options" data-tab="menu-options">
			<nav
				className="admin-branch-options__subtabs admin-menu-options-subtabs"
				role="tablist"
				aria-label="Secciones de opciones de sucursal"
			>
				{SUB_TABS.map(({ id, label, Icon, panel }) => (
					<button
						key={id}
						type="button"
						role="tab"
						id={`menu-options-subtab-${id}`}
						aria-selected={activeSubTab === id}
						aria-controls={panel}
						className={`admin-branch-options__subtab admin-menu-options-subtab${
							activeSubTab === id ? " is-active" : ""
						}`}
						onClick={() => persistSubTab(id)}
					>
						<Icon size={16} strokeWidth={1.75} aria-hidden />
						<span>{label}</span>
					</button>
				))}
			</nav>

			<div
				role="tabpanel"
				id="menu-options-panel-delivery"
				aria-labelledby="menu-options-subtab-delivery"
				hidden={activeSubTab !== "delivery"}
				className="admin-menu-options-subpanel"
			>
				{activeSubTab === "delivery" ? (
					<AdminMenuDeliverySection
						showNotify={showNotify}
						selectedBranch={selectedBranch}
						onSaved={onDeliverySaved}
					/>
				) : null}
			</div>

			<div
				role="tabpanel"
				id="menu-options-panel-carousel"
				aria-labelledby="menu-options-subtab-carousel"
				hidden={activeSubTab !== "carousel"}
				className="admin-menu-options-subpanel"
			>
				{activeSubTab === "carousel" ? (
					<AdminMenuCarousel
						showNotify={showNotify}
						selectedBranch={selectedBranch}
						companyId={companyId}
					/>
				) : null}
			</div>

			<div
				role="tabpanel"
				id="menu-options-panel-orders-view"
				aria-labelledby="menu-options-subtab-orders_view"
				hidden={activeSubTab !== "orders_view"}
				className="admin-menu-options-subpanel"
			>
				<div className="admin-branch-options__card admin-menu-options-card admin-menu-options-orders-view">
					{branchReady ? (
						<>
							<div className="admin-branch-options__block">
								<h3 className="admin-branch-options__block-title">Vista del panel</h3>
								<p className="admin-branch-options__block-hint">
									Cómo se muestra Pedidos en <strong>{branchName}</strong>.
								</p>
								<OrdersViewSwitch
									value={draftOrdersViewMode}
									onChange={setDraftOrdersViewMode}
									className="admin-menu-options-orders-view__switch"
								/>
								<p className="admin-branch-options__block-hint admin-branch-options__block-hint--muted">
									Mesas: grilla de mesas. Pedido: tablero por columnas.
								</p>
							</div>

							<div className="admin-branch-options__block">
								<h3 className="admin-branch-options__block-title">Canales en Nuevo pedido</h3>
								<p className="admin-branch-options__block-hint">
									Qué tipos aparecen al abrir un pedido desde caja. Al menos uno activo.
								</p>
								<LocalOrderChannelsSwitch
									value={draftLocalOrderChannels}
									onChange={setDraftLocalOrderChannels}
									className="admin-menu-options-orders-view__channels"
								/>
							</div>

							{ordersPanelDirty ? (
								<div className="admin-branch-options__dirty-bar">
									<span className="admin-branch-options__dirty-label">Cambios sin guardar</span>
									<div className="admin-branch-options__dirty-actions">
										<Button
											variant="ghost"
											type="button"
											size="sm"
											disabled={ordersViewModeSaving}
											onClick={discardOrdersPanel}
										>
											Descartar
										</Button>
										<Button
											variant="default"
											type="button"
											size="sm"
											disabled={ordersViewModeSaving}
											onClick={() => void handleSaveOrdersPanel()}
										>
											{ordersViewModeSaving ? (
												"Guardando…"
											) : (
												<>
													<Save size={14} strokeWidth={1.75} aria-hidden />
													Guardar
												</>
											)}
										</Button>
									</div>
								</div>
							) : null}
						</>
					) : (
						<div className="admin-branch-options__empty">
							<p>Elige una sucursal en el encabezado para configurar la vista de pedidos.</p>
						</div>
					)}
				</div>
			</div>

			<div
				role="tabpanel"
				id="menu-options-panel-tables"
				aria-labelledby="menu-options-subtab-tables"
				hidden={activeSubTab !== "tables"}
				className="admin-menu-options-subpanel"
			>
				{activeSubTab === "tables" ? (
					<div className="admin-branch-options__card admin-menu-options-card">
						<AdminBranchTablesSection
							selectedBranch={selectedBranch}
							companyId={companyId}
							showNotify={showNotify}
							onSeatReservation={handleSeatReservation}
						/>
					</div>
				) : null}
			</div>
		</div>
	);
}
