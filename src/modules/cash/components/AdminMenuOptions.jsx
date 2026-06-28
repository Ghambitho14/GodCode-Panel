import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Images, Truck, LayoutGrid, Save } from "lucide-react";
import AdminMenuDeliverySection from "./AdminMenuDeliverySection";
import AdminMenuCarousel from "./AdminMenuCarousel";
import OrdersViewSwitch from "./OrdersViewSwitch";
import LocalOrderChannelsSwitch from "./LocalOrderChannelsSwitch";
import { useAdmin } from "@/modules/cash/admin/pages/AdminProvider";
import "../styles/AdminMenuOptions.css";

const SUB_TAB_IDS = /** @type {const} */ (["delivery", "carousel", "orders_view"]);

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
	return Boolean(a?.mesa) === Boolean(b?.mesa)
		&& Boolean(a?.retiro) === Boolean(b?.retiro)
		&& Boolean(a?.delivery) === Boolean(b?.delivery);
}

/**
 * Pestaña "Opciones de menú": sub-pestañas Envío, Carrusel y Vista de pedidos.
 * Bebidas y Extras del carrito viven en entradas propias del sidebar (menu_beverages / menu_extras).
 */
export default function AdminMenuOptions({ showNotify, selectedBranch, companyId, onDeliverySaved }) {
	const {
		ordersViewMode,
		localOrderChannels,
		saveOrdersPanelSettings,
		ordersViewModeSaving,
	} = useAdmin();
	const branchKey = selectedBranch?.id ?? "__none__";
	const branchReady = Boolean(selectedBranch?.id && selectedBranch.id !== "all");
	const [draftOrdersViewMode, setDraftOrdersViewMode] = useState(ordersViewMode);
	const [draftLocalOrderChannels, setDraftLocalOrderChannels] = useState(localOrderChannels);
	const ordersPanelDirty =
		draftOrdersViewMode !== ordersViewMode
		|| !channelsEqual(draftLocalOrderChannels, localOrderChannels);
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
			} catch {}
		},
		[storageKey],
	);

	useEffect(() => {
		setDraftOrdersViewMode(ordersViewMode);
		setDraftLocalOrderChannels(localOrderChannels);
	}, [ordersViewMode, localOrderChannels, branchKey]);

	const handleSaveOrdersPanel = useCallback(async () => {
		await saveOrdersPanelSettings({
			ordersViewMode: draftOrdersViewMode,
			localOrderChannels: draftLocalOrderChannels,
		});
	}, [draftOrdersViewMode, draftLocalOrderChannels, saveOrdersPanelSettings]);

	return (
		<div className="admin-menu-options" data-tab="menu-options">
			<div
				className="admin-menu-options-subtabs"
				role="tablist"
				aria-label="Secciones de opciones de menú"
			>
				<button
					type="button"
					role="tab"
					id="menu-options-subtab-delivery"
					aria-selected={activeSubTab === "delivery"}
					aria-controls="menu-options-panel-delivery"
					className={`admin-menu-options-subtab ${activeSubTab === "delivery" ? "is-active" : ""}`}
					onClick={() => persistSubTab("delivery")}
				>
					<Truck size={18} strokeWidth={1.65} aria-hidden />
					<span>Envío y delivery</span>
				</button>
				<button
					type="button"
					role="tab"
					id="menu-options-subtab-carousel"
					aria-selected={activeSubTab === "carousel"}
					aria-controls="menu-options-panel-carousel"
					className={`admin-menu-options-subtab ${activeSubTab === "carousel" ? "is-active" : ""}`}
					onClick={() => persistSubTab("carousel")}
				>
					<Images size={18} strokeWidth={1.65} aria-hidden />
					<span>Carrusel</span>
				</button>
				<button
					type="button"
					role="tab"
					id="menu-options-subtab-orders-view"
					aria-selected={activeSubTab === "orders_view"}
					aria-controls="menu-options-panel-orders-view"
					className={`admin-menu-options-subtab ${activeSubTab === "orders_view" ? "is-active" : ""}`}
					onClick={() => persistSubTab("orders_view")}
				>
					<LayoutGrid size={18} strokeWidth={1.65} aria-hidden />
					<span>Vista de pedidos</span>
				</button>
			</div>

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
				<div className="admin-menu-options-carousel-wrap">
					<p className="admin-menu-options-section-label">Carrusel por sucursal</p>
					<AdminMenuCarousel
						showNotify={showNotify}
						selectedBranch={selectedBranch}
						companyId={companyId}
					/>
				</div>
			</div>

			<div
				role="tabpanel"
				id="menu-options-panel-orders-view"
				aria-labelledby="menu-options-subtab-orders-view"
				hidden={activeSubTab !== "orders_view"}
				className="admin-menu-options-subpanel"
			>
				<div className="admin-menu-options-card admin-menu-options-orders-view">
					<p className="admin-menu-options-section-label">Vista de pedidos por sucursal</p>
					{branchReady ? (
						<>
							<p className="admin-menu-options-lead">
								Define cómo se muestra la pestaña <strong>Pedidos</strong> para{" "}
								<strong style={{ color: "white" }}>{selectedBranch.name}</strong>.
							</p>
							<OrdersViewSwitch
								value={draftOrdersViewMode}
								onChange={setDraftOrdersViewMode}
								className="admin-menu-options-orders-view__switch"
							/>
							<p className="admin-menu-options-orders-view__hint">
								<strong>Mesas</strong>: grilla de mesas y motos. <strong>Pedido</strong>: tablero clásico por columnas.
							</p>
							<p className="admin-menu-options-section-label admin-menu-options-orders-view__channels-label">
								Tipos de pedido local (Nuevo pedido)
							</p>
							<LocalOrderChannelsSwitch
								value={draftLocalOrderChannels}
								onChange={setDraftLocalOrderChannels}
								className="admin-menu-options-orders-view__channels"
							/>
							<p className="admin-menu-options-orders-view__hint">
								Activa o desactiva Mesa, Retiro y Delivery al abrir un pedido desde caja. Debe quedar al menos uno habilitado.
								{ordersPanelDirty ? ' Pulsa Guardar para aplicar en esta sucursal.' : null}
							</p>
							<div className="admin-menu-options-orders-view__actions">
								<button
									type="button"
									className="btn btn-primary admin-menu-options-orders-view__save"
									onClick={() => void handleSaveOrdersPanel()}
									disabled={!ordersPanelDirty || ordersViewModeSaving}
								>
									{ordersViewModeSaving ? (
										'Guardando…'
									) : (
										<>
											<Save size={16} strokeWidth={1.75} aria-hidden />
											<span>Guardar vista</span>
										</>
									)}
								</button>
							</div>
						</>
					) : (
						<p className="admin-menu-options-lead">
							Selecciona una <strong style={{ color: "white" }}>sucursal</strong> en el encabezado para configurar la vista de pedidos de ese local.
						</p>
					)}
				</div>
			</div>
		</div>
	);
}
