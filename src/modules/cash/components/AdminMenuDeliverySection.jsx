import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Truck } from "lucide-react";
import {
	buildDefaultDeliveryPaymentKeys,
	computeDeliveryFee,
	effectiveDeliveryPricingMode,
	normalizeDeliverySettings,
} from "@/lib/delivery-settings";
import { branchSettingsService } from "@/modules/cash/services/branchSettingsService";
import { invalidateBranchSettings } from "@/modules/cash/services/branchSettingsCache";
import { subscribeBranchUpdate } from "@/modules/cash/services/branchRealtimeHub";
import { createMoneyFormatter } from "@/shared/utils/money";
import { isVenezuelaCountry, resolveEffectiveCountry } from "@/lib/geo/tenant-locale";
import { fetchBcvRate } from "@/lib/money/bcv-rate";
import { useAdmin } from "@/modules/cash/admin/pages/AdminProvider";
import AdminDeliveryZonesPanel from "@/modules/cash/admin/menu/delivery/AdminDeliveryZonesPanel";
import {
	buildDeliveryPreviewText,
	buildNamedPlacesPayload,
	buildZonesPayload,
	DELIVERY_PAYMENT_CHIP_TITLE,
	DELIVERY_PAYMENT_LABELS,
	DELIVERY_TOOLTIPS,
	emptyDraft,
	emptyNamedPlaceRow,
	emptyZoneRow,
} from "@/modules/cash/admin/menu/delivery/deliveryZoneHelpers";
import "../styles/AdminMenuCarousel.css";
import "../styles/AdminMenuOptions.css";
import AdminHelpTip from "./AdminHelpTip";

/**
 * Lee y escribe `branches.delivery_settings` (JSONB) para la sucursal seleccionada.
 */
export default function AdminMenuDeliverySection({ showNotify, selectedBranch, onSaved }) {
	const { companyProfile } = useAdmin();
	const branchId =
		selectedBranch?.id && selectedBranch.id !== "all" ? selectedBranch.id : null;

	const [deliveryEnabled, setDeliveryEnabled] = useState(true);
	const [draft, setDraft] = useState(emptyDraft);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [savingFields, setSavingFields] = useState(false);
	const [zoneRows, setZoneRows] = useState(() => [emptyZoneRow()]);
	const [namedPlaceRows, setNamedPlaceRows] = useState(() => [emptyNamedPlaceRow()]);
	const [pricingStrategy, setPricingStrategy] = useState("distance");
	const [namedAreaResolution, setNamedAreaResolution] = useState("manual_select");
	const [showExternalDeliveryFee, setShowExternalDeliveryFee] = useState(true);
	/** Viene del SaaS (`companies.integration_settings.allowTenantExternalDelivery`). */
	const [allowTenantExternalDelivery, setAllowTenantExternalDelivery] = useState(true);
	/** `true` = permitido para delivery (clave = id de método) */
	const [deliveryPaymentChecked, setDeliveryPaymentChecked] = useState({});
	const deliveryPaymentCheckedRef = useRef({});
	const [bcvRate, setBcvRate] = useState(null);
	const [savingExchangeRate, setSavingExchangeRate] = useState(false);

	const effectiveCountry = useMemo(
		() => resolveEffectiveCountry(selectedBranch, companyProfile),
		[selectedBranch, companyProfile],
	);
	const isVenezuela = isVenezuelaCountry(effectiveCountry);

	useEffect(() => {
		if (!isVenezuela) return;
		let cancelled = false;
		void fetchBcvRate().then((rate) => {
			if (!cancelled) setBcvRate(rate);
		});
		return () => {
			cancelled = true;
		};
	}, [isVenezuela, branchId]);

	const applyServerPayload = useCallback((data) => {
		const n = normalizeDeliverySettings(data);
		setDeliveryEnabled(n.enabled !== false);
		setDraft({
			pricePerKm: String(n.pricePerKm ?? ""),
			baseFee: String(n.baseFee ?? ""),
			minFee: n.minFee != null ? String(n.minFee) : "",
			maxFee: n.maxFee != null ? String(n.maxFee) : "",
			maxDeliveryKm: n.maxDeliveryKm != null ? String(n.maxDeliveryKm) : "",
			freeDeliveryFromSubtotal:
				n.freeDeliveryFromSubtotal != null ? String(n.freeDeliveryFromSubtotal) : "",
			minOrderSubtotal: n.minOrderSubtotal != null ? String(n.minOrderSubtotal) : "",
			customerNotes: n.customerNotes ?? "",
			trustedDriverWhatsApp:
				typeof data.trustedDriverWhatsApp === "string"
					? data.trustedDriverWhatsApp
					: "",
			originLat:
				data.originLat != null && data.originLat !== ""
					? String(data.originLat)
					: "",
			originLng:
				data.originLng != null && data.originLng !== ""
					? String(data.originLng)
					: "",
			uberDirectStoreId:
				typeof data.uberDirectStoreId === "string" ? data.uberDirectStoreId : "",
			externalDeliveryDisplayText:
				typeof data.externalDeliveryDisplayText === "string"
					? data.externalDeliveryDisplayText
					: "",
			exchangeRate: n.exchangeRate != null ? String(n.exchangeRate) : "",
		});
		setShowExternalDeliveryFee(data.showExternalDeliveryFeeAmount !== false);
		const z = Array.isArray(n.zones) && n.zones.length > 0
			? n.zones.map((row) => ({
					id: row.id,
					radiusKm: String(row.radiusKm),
					feeFlat: String(row.feeFlat),
				}))
			: [emptyZoneRow()];
		setZoneRows(z);
		const allowExt = data.allowTenantExternalDelivery !== false;
		setAllowTenantExternalDelivery(allowExt);
		const rawStrat =
			n.deliveryPricingStrategy === "named_areas"
				? "named_areas"
				: n.deliveryPricingStrategy === "external"
					? "external"
					: "distance";
		const strat = rawStrat === "external" && !allowExt ? "distance" : rawStrat;
		setPricingStrategy(strat);
		if (rawStrat === "external" && !allowExt) {
			showNotify(
				"Esta sucursal tenía envío externo, pero tu administrador lo desactivó en el panel SaaS. Elige una modalidad y guarda para alinear el menú.",
				"warning",
			);
		}
		setNamedAreaResolution(
			n.namedAreaResolution === "address_matched" ? "address_matched" : "manual_select",
		);
		const na =
			Array.isArray(n.namedAreas) && n.namedAreas.length > 0
				? n.namedAreas.map((row) => ({
						id: row.id,
						name: String(row.name ?? ""),
						feeFlat: String(row.feeFlat),
						aliasesStr: Array.isArray(row.aliases) ? row.aliases.join(", ") : "",
					}))
				: [emptyNamedPlaceRow()];
		setNamedPlaceRows(na);

		const allPayKeys = buildDefaultDeliveryPaymentKeys(selectedBranch?.payment_methods);
		const allowedRaw = data.allowedPaymentMethodsForDelivery;
		if (Array.isArray(allowedRaw) && allowedRaw.length > 0) {
			const allowedSet = new Set(
				allowedRaw.map((x) => String(x).trim().toLowerCase()),
			);
			const next = Object.fromEntries(allPayKeys.map((k) => [k, allowedSet.has(k)]));
			deliveryPaymentCheckedRef.current = next;
			setDeliveryPaymentChecked(next);
		} else {
			const next = Object.fromEntries(allPayKeys.map((k) => [k, true]));
			deliveryPaymentCheckedRef.current = next;
			setDeliveryPaymentChecked(next);
		}
	}, [selectedBranch?.payment_methods, showNotify]);

	const load = useCallback(async () => {
		if (!branchId) {
			setLoading(false);
			return;
		}
		setLoading(true);
		try {
			const data = await branchSettingsService.getDeliverySettings(branchId);
			if (!data) throw new Error("Sucursal no encontrada");
			applyServerPayload(data);
		} catch (e) {
			showNotify(e instanceof Error ? e.message : "Error al cargar delivery", "error");
			setDeliveryEnabled(true);
			setDraft(emptyDraft());
		} finally {
			setLoading(false);
		}
	}, [branchId, showNotify, applyServerPayload]);

	useEffect(() => {
		void load();
	}, [load]);

	// Realtime: si otro usuario cambia `branches.delivery_settings` de esta sucursal,
	// refrescamos el panel de Opciones de menú sin recargar la página.
	useEffect(() => {
		if (!branchId) return;
		return subscribeBranchUpdate(branchId, () => {
			invalidateBranchSettings(branchId);
			void load();
		});
	}, [branchId, load]);

	const zonesPayload = useMemo(() => buildZonesPayload(zoneRows), [zoneRows]);

	const namedPlacesPayload = useMemo(
		() => buildNamedPlacesPayload(namedPlaceRows),
		[namedPlaceRows],
	);

	const normalizedFromDraft = useMemo(() => {
		return normalizeDeliverySettings({
			enabled: deliveryEnabled,
			deliveryPricingStrategy: pricingStrategy,
			externalDeliveryProvider: pricingStrategy === "external" ? "uber_direct" : null,
			uberDirectStoreId: draft.uberDirectStoreId,
			showExternalDeliveryFeeAmount: showExternalDeliveryFee,
			externalDeliveryDisplayText: draft.externalDeliveryDisplayText,
			namedAreaResolution,
			pricePerKm: draft.pricePerKm === "" ? 0 : Number(draft.pricePerKm),
			baseFee: draft.baseFee === "" ? 0 : Number(draft.baseFee),
			minFee: draft.minFee === "" ? null : Number(draft.minFee),
			maxFee: draft.maxFee === "" ? null : Number(draft.maxFee),
			maxDeliveryKm: draft.maxDeliveryKm === "" ? null : Number(draft.maxDeliveryKm),
			freeDeliveryFromSubtotal:
				draft.freeDeliveryFromSubtotal === "" ? null : Number(draft.freeDeliveryFromSubtotal),
			minOrderSubtotal: draft.minOrderSubtotal === "" ? null : Number(draft.minOrderSubtotal),
			customerNotes: draft.customerNotes,
			zones: zonesPayload,
			namedAreas: namedPlacesPayload,
		});
	}, [
		deliveryEnabled,
		pricingStrategy,
		namedAreaResolution,
		draft,
		zonesPayload,
		namedPlacesPayload,
		showExternalDeliveryFee,
	]);

	const deliveryPaymentKeys = useMemo(
		() => buildDefaultDeliveryPaymentKeys(selectedBranch?.payment_methods),
		[selectedBranch?.payment_methods, selectedBranch?.id],
	);

	const previewFee = useMemo(() => {
		const exKm = 3;
		const exSubtotal = 15000;
		if (normalizedFromDraft.deliveryPricingStrategy === "external") {
			return computeDeliveryFee(normalizedFromDraft, 0, exSubtotal);
		}
		const areas = normalizedFromDraft.namedAreas;
		if (effectiveDeliveryPricingMode(normalizedFromDraft) === "named" && areas.length > 0) {
			return computeDeliveryFee(normalizedFromDraft, 0, exSubtotal, {
				namedAreaId: areas[0].id,
			});
		}
		return computeDeliveryFee(normalizedFromDraft, exKm, exSubtotal);
	}, [normalizedFromDraft]);

	const branchMoney = useMemo(
		() => createMoneyFormatter(selectedBranch, companyProfile),
		[selectedBranch, companyProfile],
	);

	const saveExchangeRate = async () => {
		if (!branchId) return;
		setSavingExchangeRate(true);
		try {
			const raw = draft.exchangeRate.trim();
			const payload = {
				exchangeRate: raw === "" ? null : Number(raw),
			};
			const data = await branchSettingsService.saveDeliverySettings(branchId, payload);
			applyServerPayload(data);
			showNotify("Tasa de cambio guardada.");
			if (typeof onSaved === "function") onSaved();
		} catch (e) {
			showNotify(e instanceof Error ? e.message : "Error al guardar tasa", "error");
		} finally {
			setSavingExchangeRate(false);
		}
	};

	const toggle = async (next) => {
		if (!branchId) return;
		setSaving(true);
		try {
			const data = await branchSettingsService.saveDeliverySettings(branchId, { enabled: next });
			setDeliveryEnabled(data.enabled !== false);
			showNotify(next ? "Delivery activado para esta sucursal." : "Delivery desactivado para esta sucursal.");
			if (typeof onSaved === "function") {
				onSaved();
			}
		} catch (e) {
			showNotify(e instanceof Error ? e.message : "Error al guardar", "error");
			void load();
		} finally {
			setSaving(false);
		}
	};

	const saveTariffs = async () => {
		if (!branchId) return;
		if (!deliveryEnabled) {
			showNotify("Activa delivery para guardar tarifas y opciones.", "error");
			return;
		}
		setSavingFields(true);
		try {
			const payload = {
				branchId,
				deliveryPricingStrategy: pricingStrategy,
				namedAreaResolution,
				pricePerKm:
					draft.pricePerKm === "" ? 0 : Math.max(0, Number(draft.pricePerKm) || 0),
				baseFee: draft.baseFee === "" ? 0 : Math.max(0, Number(draft.baseFee) || 0),
				minFee: draft.minFee === "" ? null : Number(draft.minFee),
				maxFee: draft.maxFee === "" ? null : Number(draft.maxFee),
				maxDeliveryKm: draft.maxDeliveryKm === "" ? null : Number(draft.maxDeliveryKm),
				freeDeliveryFromSubtotal:
					draft.freeDeliveryFromSubtotal === ""
						? null
						: Number(draft.freeDeliveryFromSubtotal),
				minOrderSubtotal: draft.minOrderSubtotal === "" ? null : Number(draft.minOrderSubtotal),
				customerNotes: draft.customerNotes.trim(),
				trustedDriverWhatsApp: draft.trustedDriverWhatsApp.trim(),
				zones: zonesPayload,
				namedAreas: namedPlacesPayload,
			};
			const olat = draft.originLat.trim();
			const olng = draft.originLng.trim();
			payload.originLat = olat === "" ? null : Number(olat);
			payload.originLng = olng === "" ? null : Number(olng);
			if (olat !== "" && !Number.isFinite(payload.originLat)) {
				delete payload.originLat;
			}
			if (olng !== "" && !Number.isFinite(payload.originLng)) {
				delete payload.originLng;
			}
			const payKeys = buildDefaultDeliveryPaymentKeys(selectedBranch?.payment_methods);
			// Usar ref para evitar estado "stale" si el usuario toca chip y guarda muy rápido.
			const checked = deliveryPaymentCheckedRef.current || {};
			const selectedPay = payKeys.filter((k) => checked[k] !== false);
			if (selectedPay.length === 0) {
				showNotify(
					"Selecciona al menos un método de pago permitido para delivery.",
					"error",
				);
				return;
			}
			if (selectedPay.length === payKeys.length) {
				payload.allowedPaymentMethodsForDelivery = null;
			} else {
				payload.allowedPaymentMethodsForDelivery = selectedPay;
			}
			payload.externalDeliveryProvider =
				pricingStrategy === "external" ? "uber_direct" : null;
			payload.uberDirectStoreId =
				pricingStrategy === "external" && draft.uberDirectStoreId.trim()
					? draft.uberDirectStoreId.trim().slice(0, 128)
					: null;
			payload.showExternalDeliveryFeeAmount =
				pricingStrategy === "external" ? showExternalDeliveryFee : true;
			if (pricingStrategy === "external") {
				payload.externalDeliveryDisplayText =
					draft.externalDeliveryDisplayText.trim().slice(0, 500) || null;
			} else {
				payload.externalDeliveryDisplayText = null;
			}
			if (isVenezuela) {
				const rawRate = draft.exchangeRate.trim();
				payload.exchangeRate = rawRate === "" ? null : Number(rawRate);
			}
			const data = await branchSettingsService.saveDeliverySettings(branchId, payload);
			applyServerPayload(data);
			showNotify("Tarifas y opciones de delivery guardadas.");
			if (typeof onSaved === "function") {
				onSaved();
			}
		} catch (e) {
			showNotify(e instanceof Error ? e.message : "Error al guardar", "error");
			void load();
		} finally {
			setSavingFields(false);
		}
	};

	if (!branchId) {
		return (
			<section className="glass animate-fade admin-menu-options-card admin-menu-options-delivery">
				<p className="admin-menu-options-card-desc" style={{ margin: 0 }}>
					Selecciona una <strong style={{ color: "white" }}>sucursal</strong> en el encabezado para
					configurar <strong>delivery</strong> y tarifas por kilómetro en esa fila de{" "}
					<strong>branches.delivery_settings</strong>.
				</p>
			</section>
		);
	}

	const branchLabel = selectedBranch?.name ? ` · ${selectedBranch.name}` : "";
	const lockOptions = !deliveryEnabled || loading || savingFields || saving;

	const previewText = buildDeliveryPreviewText({
		normalizedFromDraft,
		previewFee,
		branchMoney,
	});

	return (
		<section
			className="glass animate-fade admin-menu-options-card admin-menu-options-delivery"
			aria-labelledby="admin-menu-delivery-heading"
		>
			<div className="admin-menu-options-card-head admin-menu-options-card-head--delivery">
				<div className="admin-menu-options-card-head__main">
					<div className="admin-menu-options-card-icon" aria-hidden>
						<Truck size={20} />
					</div>
					<div>
						<h3 id="admin-menu-delivery-heading" className="admin-menu-options-card-title">
							Delivery{branchLabel}
						</h3>
						<p className="admin-menu-options-card-desc">
							Activa el envío y elige <strong>una forma de cobrar</strong>: por distancia, por zonas con
							nombre (comunas/barrios) o <strong>consultar / Uber Direct</strong>. En modo externo puedes
							activar cotización en vivo con Uber (Store ID por sucursal + credenciales OAuth configuradas
							por GodCode a nivel empresa). La tarifa por zona es el envío completo de esa zona (no se suma
							el cargo fijo ni el precio por km de la modalidad por distancia).
						</p>
					</div>
				</div>
				<div className="admin-menu-options-delivery-head-toggle">
					<div className="admin-menu-options-delivery-head-toggle__text">
						<span className="admin-menu-options-delivery-head-toggle__label">
							Delivery permitido
							<AdminHelpTip text={DELIVERY_TOOLTIPS.headerSwitch} />
						</span>
						<span className="admin-menu-options-delivery-hint">
							{loading
								? "Cargando…"
								: deliveryEnabled
									? "Envío a domicilio activo para esta sucursal."
									: "Solo retiro o consumo en local; las opciones de abajo están desactivadas."}
						</span>
					</div>
					<button
						type="button"
						className={`menu-carousel-switch ${deliveryEnabled ? "is-on" : ""}`}
						role="switch"
						aria-checked={deliveryEnabled}
						disabled={loading || saving}
						aria-label={deliveryEnabled ? "Desactivar delivery" : "Activar delivery"}
						onClick={() => void toggle(!deliveryEnabled)}
					>
						<span className="menu-carousel-switch-knob" />
					</button>
				</div>
			</div>

			{isVenezuela ? (
				<div className="admin-delivery-ve-exchange" style={{ marginBottom: 16 }}>
					<p className="admin-menu-options-section-label" style={{ marginBottom: 8 }}>
						Tasa de cambio (Bs. por USD)
					</p>
					<p className="admin-menu-options-card-desc" style={{ marginBottom: 10 }}>
						Respaldo manual si el BCV no responde en el carrito del menú.
						{bcvRate != null ? (
							<>
								{" "}
								Referencia BCV actual: <strong>{bcvRate.toLocaleString("es-VE")}</strong> Bs./USD.
							</>
						) : null}
					</p>
					<div className="admin-delivery-inline-row">
						<label className="admin-menu-options-field">
							<span className="admin-menu-options-field-label">Tasa manual</span>
							<input
								type="number"
								min="0"
								step="0.001"
								className="admin-menu-options-input"
								value={draft.exchangeRate}
								onChange={(e) => setDraft((prev) => ({ ...prev, exchangeRate: e.target.value }))}
								placeholder="Ej. 639.703"
								disabled={loading || savingExchangeRate}
							/>
						</label>
						<button
							type="button"
							className="btn-primary"
							disabled={loading || savingExchangeRate || !branchId}
							onClick={() => void saveExchangeRate()}
						>
							{savingExchangeRate ? "Guardando…" : "Guardar tasa"}
						</button>
					</div>
				</div>
			) : null}

			{!loading ? (
				<div
					className={
						lockOptions
							? "admin-delivery-options-stack admin-delivery-options-stack--locked"
							: "admin-delivery-options-stack"
					}
					aria-disabled={lockOptions}
				>
					<AdminDeliveryZonesPanel
						lockOptions={lockOptions}
						pricingStrategy={pricingStrategy}
						setPricingStrategy={setPricingStrategy}
						allowTenantExternalDelivery={allowTenantExternalDelivery}
						draft={draft}
						setDraft={setDraft}
						zoneRows={zoneRows}
						setZoneRows={setZoneRows}
						namedPlaceRows={namedPlaceRows}
						setNamedPlaceRows={setNamedPlaceRows}
						namedAreaResolution={namedAreaResolution}
						setNamedAreaResolution={setNamedAreaResolution}
						showExternalDeliveryFee={showExternalDeliveryFee}
						setShowExternalDeliveryFee={setShowExternalDeliveryFee}
						selectedBranch={selectedBranch}
					/>

					<details className="admin-delivery-fold">
						<summary className="admin-delivery-fold__summary">
							<div className="admin-delivery-fold__summary-text">
								<span className="admin-delivery-fold__eyebrow">Pagos</span>
								<span className="admin-delivery-fold__title">Métodos de pago (delivery)</span>
							</div>
						</summary>
						<div className="admin-delivery-fold__body">
							<p className="admin-delivery-fold__lead admin-delivery-inline-tip">
								Qué medios puede usar el cliente cuando el pedido es envío a domicilio (subconjunto de lo
								activo en <strong>Métodos de pago</strong> más efectivo y tarjeta al recibir). Si activas
								todos, no hay restricción extra.{" "}
								<AdminHelpTip text={DELIVERY_TOOLTIPS.paymentSection} />
							</p>
							<div className="admin-delivery-payment-grid">
								{deliveryPaymentKeys.map((key) => {
									const on = deliveryPaymentChecked[key] !== false;
									return (
										<button
											key={key}
											type="button"
											role="checkbox"
											aria-checked={on}
											disabled={lockOptions}
											className={`admin-delivery-pay-chip admin-tooltip-btn-hover ${on ? "is-on" : ""}`}
											onClick={() => {
												setDeliveryPaymentChecked((prev) => {
													const currOn = prev[key] !== false;
													const next = { ...prev, [key]: !currOn };
													deliveryPaymentCheckedRef.current = next;
													return next;
												});
											}}
										>
											{DELIVERY_PAYMENT_LABELS[key] ?? key}
											<span className="admin-tooltip-btn-hover__panel" aria-hidden="true">
												{DELIVERY_PAYMENT_CHIP_TITLE[key] ??
													`Permitir ${DELIVERY_PAYMENT_LABELS[key] ?? key} en pedidos delivery.`}
											</span>
										</button>
									);
								})}
							</div>
						</div>
					</details>

					<details className="admin-delivery-fold">
						<summary className="admin-delivery-fold__summary">
							<div className="admin-delivery-fold__summary-text">
								<span className="admin-delivery-fold__eyebrow">Equipo</span>
								<span className="admin-delivery-fold__title">Repartidor y WhatsApp</span>
							</div>
						</summary>
						<div className="admin-delivery-fold__body">
							<p className="admin-delivery-fold__lead admin-delivery-inline-tip">
								En el tablero, el botón de WhatsApp abre el mensaje del envío y eliges al destinatario en la
								app. <AdminHelpTip text={DELIVERY_TOOLTIPS.driverWhatsApp} />
							</p>
							<div className="form-group" style={{ maxWidth: "22rem" }}>
								<label htmlFor="adm-del-driver-wa">
									WhatsApp repartidor (opcional)
									<AdminHelpTip text={DELIVERY_TOOLTIPS.driverWhatsApp} />
								</label>
								<input
									id="adm-del-driver-wa"
									type="tel"
									className="form-input"
									placeholder="Ej: 56 9 1234 5678"
									autoComplete="off"
									disabled={lockOptions}
									value={draft.trustedDriverWhatsApp}
									onChange={(ev) =>
										setDraft((d) => ({ ...d, trustedDriverWhatsApp: ev.target.value }))
									}
								/>
								<p className="admin-menu-options-card-desc" style={{ marginTop: 6, marginBottom: 0 }}>
									Se guarda al pulsar <strong>Guardar tarifas y opciones</strong>. Déjalo vacío para quitar.
								</p>
							</div>
						</div>
					</details>

					<details
						className="admin-delivery-fold admin-delivery-fold--advanced"
						style={{ marginTop: 18 }}
					>
						<summary className="admin-delivery-fold__summary">
							<div className="admin-delivery-fold__summary-text">
								<span className="admin-delivery-fold__eyebrow">Avanzado</span>
								<span className="admin-delivery-fold__title">Límites, umbrales y texto de ayuda</span>
							</div>
						</summary>
						<div className="admin-delivery-fold__body">
							<div className="admin-branch-delivery-grid" style={{ marginTop: 0 }}>
							<div className="form-group">
								<label htmlFor="adm-del-minfee">
									Mínimo envío (opcional)
									<AdminHelpTip text={DELIVERY_TOOLTIPS.minFee} />
								</label>
								<input
									id="adm-del-minfee"
									type="number"
									min={0}
									step="any"
									className="form-input"
									placeholder="Sin piso"
									disabled={lockOptions}
									value={draft.minFee}
									onChange={(ev) =>
										setDraft((d) => ({ ...d, minFee: ev.target.value }))
									}
								/>
							</div>
							<div className="form-group">
								<label htmlFor="adm-del-maxfee">
									Máximo envío (opcional)
									<AdminHelpTip text={DELIVERY_TOOLTIPS.maxFee} />
								</label>
								<input
									id="adm-del-maxfee"
									type="number"
									min={0}
									step="any"
									className="form-input"
									placeholder="Sin tope"
									disabled={lockOptions}
									value={draft.maxFee}
									onChange={(ev) =>
										setDraft((d) => ({ ...d, maxFee: ev.target.value }))
									}
								/>
							</div>
							<div className="form-group">
								<label htmlFor="adm-del-maxkm">
									Distancia máx. (km)
									<AdminHelpTip text={DELIVERY_TOOLTIPS.maxDeliveryKm} />
								</label>
								<input
									id="adm-del-maxkm"
									type="number"
									min={0}
									step="any"
									className="form-input"
									placeholder="Sin límite"
									disabled={lockOptions}
									value={draft.maxDeliveryKm}
									onChange={(ev) =>
										setDraft((d) => ({ ...d, maxDeliveryKm: ev.target.value }))
									}
								/>
							</div>
							<div className="form-group">
								<label htmlFor="adm-del-free">
									Envío gratis desde (subtotal)
									<AdminHelpTip text={DELIVERY_TOOLTIPS.freeDeliveryFromSubtotal} />
								</label>
								<input
									id="adm-del-free"
									type="number"
									min={0}
									step="any"
									className="form-input"
									placeholder="Nunca"
									disabled={lockOptions}
									value={draft.freeDeliveryFromSubtotal}
									onChange={(ev) =>
										setDraft((d) => ({
											...d,
											freeDeliveryFromSubtotal: ev.target.value,
										}))
									}
								/>
							</div>
							<div className="form-group">
								<label htmlFor="adm-del-minorder">
									Pedido mínimo (subtotal)
									<AdminHelpTip text={DELIVERY_TOOLTIPS.minOrderSubtotal} />
								</label>
								<input
									id="adm-del-minorder"
									type="number"
									min={0}
									step="any"
									className="form-input"
									placeholder="Sin mínimo"
									disabled={lockOptions}
									value={draft.minOrderSubtotal}
									onChange={(ev) =>
										setDraft((d) => ({
											...d,
											minOrderSubtotal: ev.target.value,
										}))
									}
								/>
							</div>
							<div className="form-group full-span">
								<label htmlFor="adm-del-notes">
									Mensaje para el cliente en el checkout
									<AdminHelpTip text={DELIVERY_TOOLTIPS.customerNotes} />
								</label>
								<textarea
									id="adm-del-notes"
									className="form-input"
									rows={2}
									placeholder="Ej.: Entregas en 45–60 min con caja abierta."
									disabled={lockOptions}
									value={draft.customerNotes}
									onChange={(ev) =>
										setDraft((d) => ({ ...d, customerNotes: ev.target.value }))
									}
								/>
							</div>
							{pricingStrategy === "named_areas" ? (
								<>
									<div className="form-group">
										<label htmlFor="adm-del-olat2">
											Ubicación del local · latitud (opcional)
											<AdminHelpTip text={DELIVERY_TOOLTIPS.originLatNamed} />
										</label>
										<input
											id="adm-del-olat2"
											type="text"
											inputMode="decimal"
											className="form-input"
											placeholder="Solo para sugerencias al escribir zonas"
											disabled={lockOptions}
											value={draft.originLat}
											onChange={(ev) =>
												setDraft((d) => ({ ...d, originLat: ev.target.value }))
											}
										/>
									</div>
									<div className="form-group">
										<label htmlFor="adm-del-olng2">
											Ubicación del local · longitud (opcional)
											<AdminHelpTip text={DELIVERY_TOOLTIPS.originLngNamed} />
										</label>
										<input
											id="adm-del-olng2"
											type="text"
											inputMode="decimal"
											className="form-input"
											disabled={lockOptions}
											value={draft.originLng}
											onChange={(ev) =>
												setDraft((d) => ({ ...d, originLng: ev.target.value }))
											}
										/>
									</div>
								</>
							) : null}
							</div>
						</div>
					</details>
					<p
						className="admin-menu-options-card-desc admin-delivery-inline-tip"
						style={{ marginTop: 10, marginBottom: 12 }}
					>
						<strong>Vista previa:</strong> {previewText}{" "}
						<AdminHelpTip text={DELIVERY_TOOLTIPS.preview} />
					</p>
					<button
						type="button"
						className="btn btn-primary admin-tooltip-btn-hover"
						disabled={lockOptions}
						onClick={() => void saveTariffs()}
					>
						{savingFields ? "Guardando…" : "Guardar tarifas y opciones"}
						<span className="admin-tooltip-btn-hover__panel" aria-hidden="true">
							{DELIVERY_TOOLTIPS.saveButton}
						</span>
					</button>
				</div>
			) : null}
		</section>
	);
}
