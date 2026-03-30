"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Truck, Plus, Trash2 } from "lucide-react";
import {
	computeDeliveryFee,
	effectiveDeliveryPricingMode,
	normalizeDeliverySettings,
} from "@/lib/delivery-settings";
import "../styles/AdminMenuCarousel.css";
import "../styles/AdminMenuOptions.css";
import DeliveryPlaceSuggestInput from "./DeliveryPlaceSuggestInput";

const emptyDraft = () => ({
	pricePerKm: "",
	baseFee: "",
	minFee: "",
	maxFee: "",
	maxDeliveryKm: "",
	freeDeliveryFromSubtotal: "",
	minOrderSubtotal: "",
	customerNotes: "",
	originLat: "",
	originLng: "",
});

const emptyZoneRow = () => ({
	id: `z${Date.now()}`,
	radiusKm: "",
	feeFlat: "",
});

const emptyNamedPlaceRow = () => ({
	id: `p${Date.now()}`,
	name: "",
	feeFlat: "",
	aliasesStr: "",
});

/**
 * Lee y escribe `branches.delivery_settings` (JSONB) para la sucursal seleccionada.
 */
export default function AdminMenuDeliverySection({ showNotify, selectedBranch, onSaved }) {
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
	const [showAdvanced, setShowAdvanced] = useState(false);

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
			originLat:
				data.originLat != null && data.originLat !== ""
					? String(data.originLat)
					: "",
			originLng:
				data.originLng != null && data.originLng !== ""
					? String(data.originLng)
					: "",
		});
		const z = Array.isArray(n.zones) && n.zones.length > 0
			? n.zones.map((row) => ({
					id: row.id,
					radiusKm: String(row.radiusKm),
					feeFlat: String(row.feeFlat),
				}))
			: [emptyZoneRow()];
		setZoneRows(z);
		setPricingStrategy(
			n.deliveryPricingStrategy === "named_areas" ? "named_areas" : "distance",
		);
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
	}, []);

	const load = useCallback(async () => {
		if (!branchId) {
			setLoading(false);
			return;
		}
		setLoading(true);
		try {
			const res = await fetch(
				`/api/tenant-branch-delivery-enabled?branchId=${encodeURIComponent(branchId)}`,
				{ cache: "no-store", credentials: "include" },
			);
			const data = await res.json();
			if (!res.ok) {
				throw new Error(data.error || "Error al cargar");
			}
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

	const zonesPayload = useMemo(() => {
		const out = [];
		for (const row of zoneRows) {
			const r = Number(String(row.radiusKm).replace(",", "."));
			const f = Number(String(row.feeFlat).replace(",", "."));
			if (!Number.isFinite(r) || r <= 0) continue;
			if (!Number.isFinite(f) || f < 0) continue;
			out.push({
				id: typeof row.id === "string" && row.id.trim() ? row.id.trim() : `z${out.length}`,
				radiusKm: r,
				feeFlat: f,
			});
		}
		return out;
	}, [zoneRows]);

	const namedPlacesPayload = useMemo(() => {
		const out = [];
		for (const row of namedPlaceRows) {
			const nm = String(row.name ?? "").trim();
			const f = Number(String(row.feeFlat).replace(",", "."));
			if (!nm) continue;
			if (!Number.isFinite(f) || f < 0) continue;
			const aliasesStr = String(row.aliasesStr ?? "")
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean)
				.slice(0, 8);
			const o = {
				id:
					typeof row.id === "string" && row.id.trim()
						? row.id.trim()
						: `p${out.length}`,
				name: nm.slice(0, 120),
				feeFlat: f,
			};
			if (aliasesStr.length > 0) o.aliases = aliasesStr;
			out.push(o);
		}
		return out;
	}, [namedPlaceRows]);

	const normalizedFromDraft = useMemo(() => {
		return normalizeDeliverySettings({
			enabled: deliveryEnabled,
			deliveryPricingStrategy: pricingStrategy,
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
	]);

	const previewFee = useMemo(() => {
		const exKm = 3;
		const exSubtotal = 15000;
		const areas = normalizedFromDraft.namedAreas;
		if (effectiveDeliveryPricingMode(normalizedFromDraft) === "named" && areas.length > 0) {
			return computeDeliveryFee(normalizedFromDraft, 0, exSubtotal, {
				namedAreaId: areas[0].id,
			});
		}
		return computeDeliveryFee(normalizedFromDraft, exKm, exSubtotal);
	}, [normalizedFromDraft]);

	const toggle = async (next) => {
		if (!branchId) return;
		setSaving(true);
		try {
			const res = await fetch("/api/tenant-branch-delivery-enabled", {
				method: "PATCH",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ branchId, enabled: next }),
			});
			const data = await res.json();
			if (!res.ok) {
				throw new Error(data.error || "No se pudo guardar");
			}
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
			const res = await fetch("/api/tenant-branch-delivery-enabled", {
				method: "PATCH",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});
			const data = await res.json();
			if (!res.ok) {
				throw new Error(data.error || "No se pudo guardar tarifas");
			}
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
	const previewText =
		previewFee.fee < 0
			? previewFee.fee === -1
				? "Ejemplo no aplicable: distancia fuera del máximo configurado."
				: previewFee.fee === -2
					? "Ejemplo no aplicable: subtotal inferior al pedido mínimo."
					: "Ejemplo no aplicable."
			: effectiveDeliveryPricingMode(normalizedFromDraft) === "named" &&
				  normalizedFromDraft.namedAreas?.length > 0
				? previewFee.waivedFreeShipping
					? "Ejemplo (primera zona, subtotal $15.000): envío gratuito por umbral."
					: `Ejemplo (primera zona, subtotal $15.000): envío ≈ $${Math.round(previewFee.fee).toLocaleString("es-CL")}.`
				: previewFee.waivedFreeShipping
					? "Ejemplo (3 km, subtotal $15.000): envío gratuito por umbral."
					: `Ejemplo (3 km, subtotal $15.000): envío ≈ $${Math.round(previewFee.fee).toLocaleString("es-CL")}.`;

	return (
		<section
			className="glass animate-fade admin-menu-options-card admin-menu-options-delivery"
			aria-labelledby="admin-menu-delivery-heading"
		>
			<div className="admin-menu-options-card-head">
				<div className="admin-menu-options-card-icon" aria-hidden>
					<Truck size={20} />
				</div>
				<div>
					<h3 id="admin-menu-delivery-heading" className="admin-menu-options-card-title">
						Delivery{branchLabel}
					</h3>
					<p className="admin-menu-options-card-desc">
						Activa el envío y elige <strong>una forma de cobrar</strong>: por distancia desde el local o
						por zonas con nombre (comunas/barrios). La tarifa de cada zona es el envío completo (no se suma
						el cargo fijo ni el precio por km de la otra modalidad).
					</p>
				</div>
			</div>
			<div className="admin-menu-options-delivery-row">
				<div>
					<div className="admin-menu-options-delivery-label">
						{deliveryEnabled ? "Delivery permitido" : "Delivery desactivado"}
					</div>
					<div className="admin-menu-options-delivery-hint">
						{loading
							? "Cargando…"
							: deliveryEnabled
								? "Los clientes podrán elegir envío completando zona o distancia y dirección, según configures abajo."
								: "Solo retiro / consumo en local para esta sucursal."}
					</div>
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

			{!loading ? (
				<>
					<div className="admin-delivery-strategy-block" style={{ marginTop: 16 }}>
						<p className="admin-menu-options-section-label" style={{ marginBottom: 8 }}>
							¿Cómo cobras el envío?
						</p>
						<div className="admin-delivery-strategy-pills">
							<button
								type="button"
								className={`btn btn-secondary ${pricingStrategy === "distance" ? "is-active" : ""}`}
								onClick={() => setPricingStrategy("distance")}
							>
								Por distancia (km)
							</button>
							<button
								type="button"
								className={`btn btn-secondary ${pricingStrategy === "named_areas" ? "is-active" : ""}`}
								onClick={() => setPricingStrategy("named_areas")}
							>
								Por zonas con nombre
							</button>
						</div>
					</div>

					{pricingStrategy === "distance" ? (
						<>
							<div className="admin-branch-delivery-grid" style={{ marginTop: 18 }}>
								<div className="form-group">
									<label htmlFor="adm-del-price-km">Precio por km</label>
									<input
										id="adm-del-price-km"
										type="number"
										min={0}
										step="any"
										className="form-input"
										value={draft.pricePerKm}
										onChange={(ev) =>
											setDraft((d) => ({ ...d, pricePerKm: ev.target.value }))
										}
									/>
								</div>
								<div className="form-group">
									<label htmlFor="adm-del-base">Cargo fijo base</label>
									<input
										id="adm-del-base"
										type="number"
										min={0}
										step="any"
										className="form-input"
										value={draft.baseFee}
										onChange={(ev) =>
											setDraft((d) => ({ ...d, baseFee: ev.target.value }))
										}
									/>
								</div>
								<div className="form-group">
									<label htmlFor="adm-del-olat">Ubicación del local · latitud</label>
									<input
										id="adm-del-olat"
										type="text"
										inputMode="decimal"
										className="form-input"
										placeholder="Ej: -33.4489"
										value={draft.originLat}
										onChange={(ev) =>
											setDraft((d) => ({ ...d, originLat: ev.target.value }))
										}
									/>
								</div>
								<div className="form-group">
									<label htmlFor="adm-del-olng">Ubicación del local · longitud</label>
									<input
										id="adm-del-olng"
										type="text"
										inputMode="decimal"
										className="form-input"
										placeholder="Ej: -70.6693"
										value={draft.originLng}
										onChange={(ev) =>
											setDraft((d) => ({ ...d, originLng: ev.target.value }))
										}
									/>
								</div>
							</div>
							<div className="admin-branch-delivery-zones" style={{ marginTop: 8 }}>
								<p className="admin-menu-options-card-desc" style={{ marginBottom: 10 }}>
									<strong>Anillos por distancia (opcional):</strong> si el pedido cae dentro del radio
									en km desde el local, aplicas la tarifa fija de esa fila; si no, se usa precio por km
									+ cargo fijo.
								</p>
								{zoneRows.map((row, idx) => (
									<div
										key={row.id}
										style={{
											display: "flex",
											flexWrap: "wrap",
											gap: 10,
											alignItems: "flex-end",
											marginBottom: 10,
										}}
									>
										<div className="form-group" style={{ flex: "1 1 120px" }}>
											<label htmlFor={`adm-del-zr-${row.id}`}>Radio máx. (km)</label>
											<input
												id={`adm-del-zr-${row.id}`}
												type="number"
												min={0}
												step="any"
												className="form-input"
												value={row.radiusKm}
												onChange={(ev) => {
													const v = ev.target.value;
													setZoneRows((rows) =>
														rows.map((r, i) => (i === idx ? { ...r, radiusKm: v } : r)),
													);
												}}
											/>
										</div>
										<div className="form-group" style={{ flex: "1 1 120px" }}>
											<label htmlFor={`adm-del-zf-${row.id}`}>Tarifa fija ($)</label>
											<input
												id={`adm-del-zf-${row.id}`}
												type="number"
												min={0}
												step="any"
												className="form-input"
												value={row.feeFlat}
												onChange={(ev) => {
													const v = ev.target.value;
													setZoneRows((rows) =>
														rows.map((r, i) => (i === idx ? { ...r, feeFlat: v } : r)),
													);
												}}
											/>
										</div>
										<button
											type="button"
											className="btn btn-secondary"
											style={{ marginBottom: 2 }}
											aria-label="Eliminar anillo"
											onClick={() =>
												setZoneRows((rows) =>
													rows.length <= 1 ? rows : rows.filter((_, i) => i !== idx),
												)
											}
										>
											<Trash2 size={16} />
										</button>
									</div>
								))}
								<button
									type="button"
									className="btn btn-secondary"
									style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
									onClick={() =>
										setZoneRows((rows) => [
											...rows,
											{ id: `z${Date.now()}`, radiusKm: "", feeFlat: "" },
										])
									}
								>
									<Plus size={16} /> Añadir anillo
								</button>
							</div>
						</>
					) : (
						<>
							<div className="admin-delivery-strategy-block" style={{ marginTop: 14 }}>
								<p className="admin-menu-options-section-label" style={{ marginBottom: 8 }}>
									Zonas en el checkout
								</p>
								<div className="admin-delivery-strategy-pills">
									<button
										type="button"
										className={`btn btn-secondary ${namedAreaResolution === "manual_select" ? "is-active" : ""}`}
										onClick={() => setNamedAreaResolution("manual_select")}
									>
										Lista para elegir
									</button>
									<button
										type="button"
										className={`btn btn-secondary ${namedAreaResolution === "address_matched" ? "is-active" : ""}`}
										onClick={() => setNamedAreaResolution("address_matched")}
									>
										Según la dirección (automático)
									</button>
								</div>
								<p className="admin-menu-options-card-desc" style={{ marginTop: 10, marginBottom: 0 }}>
									{namedAreaResolution === "manual_select"
										? "El cliente elige comuna/zona en un menú. Puedes usar sugerencias al escribir el nombre (mapa gratuito)."
										: "El cliente escribe la dirección; el sistema intenta detectar la zona y el precio (datos de mapa abiertos)."}
								</p>
							</div>
							<div className="admin-branch-delivery-zones" style={{ marginTop: 14 }}>
								<p className="admin-menu-options-card-desc" style={{ marginBottom: 10 }}>
									<strong>Zonas y tarifas</strong> (hasta 40). Cada fila es el envío completo para esa
									zona. Sugerencias de nombres vía{" "}
									<a
										href="https://www.openstreetmap.org/copyright"
										target="_blank"
										rel="noreferrer"
										style={{ color: "inherit", textDecoration: "underline" }}
									>
										OpenStreetMap
									</a>
									.
								</p>
								{namedPlaceRows.map((row, idx) => (
									<div
										key={row.id}
										style={{
											display: "flex",
											flexWrap: "wrap",
											gap: 10,
											alignItems: "flex-end",
											marginBottom: 10,
										}}
									>
										<div className="form-group" style={{ flex: "2 1 160px" }}>
											<label htmlFor={`adm-del-place-${row.id}`}>Nombre de la zona</label>
											<DeliveryPlaceSuggestInput
												id={`adm-del-place-${row.id}`}
												placeholder="Comuna, barrio o sector"
												value={row.name}
												region={
													String(selectedBranch?.country ?? "CL").toUpperCase() === "VE"
														? "ve"
														: "cl"
												}
												biasLat={
													draft.originLat.trim() !== "" &&
													Number.isFinite(Number(draft.originLat))
														? Number(draft.originLat)
														: undefined
												}
												biasLng={
													draft.originLng.trim() !== "" &&
													Number.isFinite(Number(draft.originLng))
														? Number(draft.originLng)
														: undefined
												}
												disabled={savingFields || saving}
												onChange={(v) => {
													setNamedPlaceRows((rows) =>
														rows.map((r, i) => (i === idx ? { ...r, name: v } : r)),
													);
												}}
											/>
										</div>
										<div className="form-group" style={{ flex: "1 1 120px" }}>
											<label htmlFor={`adm-del-place-fee-${row.id}`}>Tarifa ($)</label>
											<input
												id={`adm-del-place-fee-${row.id}`}
												type="number"
												min={0}
												step="any"
												className="form-input"
												value={row.feeFlat}
												onChange={(ev) => {
													const v = ev.target.value;
													setNamedPlaceRows((rows) =>
														rows.map((r, i) => (i === idx ? { ...r, feeFlat: v } : r)),
													);
												}}
											/>
										</div>
										<div className="form-group" style={{ flex: "1 1 140px" }}>
											<label htmlFor={`adm-del-place-al-${row.id}`}>Alias (opc.)</label>
											<input
												id={`adm-del-place-al-${row.id}`}
												type="text"
												className="form-input"
												placeholder="Separados por coma"
												value={row.aliasesStr ?? ""}
												onChange={(ev) => {
													const v = ev.target.value;
													setNamedPlaceRows((rows) =>
														rows.map((r, i) => (i === idx ? { ...r, aliasesStr: v } : r)),
													);
												}}
											/>
										</div>
										<button
											type="button"
											className="btn btn-secondary"
											style={{ marginBottom: 2 }}
											aria-label="Eliminar lugar"
											onClick={() =>
												setNamedPlaceRows((rows) =>
													rows.length <= 1 ? rows : rows.filter((_, i) => i !== idx),
												)
											}
										>
											<Trash2 size={16} />
										</button>
									</div>
								))}
								<button
									type="button"
									className="btn btn-secondary"
									style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
									onClick={() =>
										setNamedPlaceRows((rows) => [
											...rows,
											{ id: `p${Date.now()}`, name: "", feeFlat: "", aliasesStr: "" },
										])
									}
								>
									<Plus size={16} /> Añadir zona
								</button>
							</div>
						</>
					)}

					<details
						className="admin-delivery-advanced"
						style={{ marginTop: 18 }}
						open={showAdvanced}
						onToggle={(e) => setShowAdvanced(e.target.open)}
					>
						<summary className="admin-menu-options-section-label" style={{ cursor: "pointer" }}>
							Opciones avanzadas (límites, umbrales, texto de ayuda)
						</summary>
						<div className="admin-branch-delivery-grid" style={{ marginTop: 12 }}>
							<div className="form-group">
								<label htmlFor="adm-del-minfee">Mínimo envío (opcional)</label>
								<input
									id="adm-del-minfee"
									type="number"
									min={0}
									step="any"
									className="form-input"
									placeholder="Sin piso"
									value={draft.minFee}
									onChange={(ev) =>
										setDraft((d) => ({ ...d, minFee: ev.target.value }))
									}
								/>
							</div>
							<div className="form-group">
								<label htmlFor="adm-del-maxfee">Máximo envío (opcional)</label>
								<input
									id="adm-del-maxfee"
									type="number"
									min={0}
									step="any"
									className="form-input"
									placeholder="Sin tope"
									value={draft.maxFee}
									onChange={(ev) =>
										setDraft((d) => ({ ...d, maxFee: ev.target.value }))
									}
								/>
							</div>
							<div className="form-group">
								<label htmlFor="adm-del-maxkm">Distancia máx. (km)</label>
								<input
									id="adm-del-maxkm"
									type="number"
									min={0}
									step="any"
									className="form-input"
									placeholder="Sin límite"
									value={draft.maxDeliveryKm}
									onChange={(ev) =>
										setDraft((d) => ({ ...d, maxDeliveryKm: ev.target.value }))
									}
								/>
							</div>
							<div className="form-group">
								<label htmlFor="adm-del-free">Envío gratis desde (subtotal)</label>
								<input
									id="adm-del-free"
									type="number"
									min={0}
									step="any"
									className="form-input"
									placeholder="Nunca"
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
								<label htmlFor="adm-del-minorder">Pedido mínimo (subtotal)</label>
								<input
									id="adm-del-minorder"
									type="number"
									min={0}
									step="any"
									className="form-input"
									placeholder="Sin mínimo"
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
								<label htmlFor="adm-del-notes">Mensaje para el cliente en el checkout</label>
								<textarea
									id="adm-del-notes"
									className="form-input"
									rows={2}
									placeholder="Ej.: Entregas en 45–60 min con caja abierta."
									value={draft.customerNotes}
									onChange={(ev) =>
										setDraft((d) => ({ ...d, customerNotes: ev.target.value }))
									}
								/>
							</div>
							{pricingStrategy === "named_areas" ? (
								<>
									<div className="form-group">
										<label htmlFor="adm-del-olat2">Ubicación del local · latitud (opcional)</label>
										<input
											id="adm-del-olat2"
											type="text"
											inputMode="decimal"
											className="form-input"
											placeholder="Solo para sugerencias al escribir zonas"
											value={draft.originLat}
											onChange={(ev) =>
												setDraft((d) => ({ ...d, originLat: ev.target.value }))
											}
										/>
									</div>
									<div className="form-group">
										<label htmlFor="adm-del-olng2">Ubicación del local · longitud (opcional)</label>
										<input
											id="adm-del-olng2"
											type="text"
											inputMode="decimal"
											className="form-input"
											value={draft.originLng}
											onChange={(ev) =>
												setDraft((d) => ({ ...d, originLng: ev.target.value }))
											}
										/>
									</div>
								</>
							) : null}
						</div>
					</details>
					<p
						className="admin-menu-options-card-desc"
						style={{ marginTop: 10, marginBottom: 12 }}
					>
						<strong>Vista previa:</strong> {previewText}
					</p>
					<button
						type="button"
						className="btn btn-primary"
						disabled={savingFields || saving}
						onClick={() => void saveTariffs()}
					>
						{savingFields ? "Guardando…" : "Guardar tarifas y opciones"}
					</button>
				</>
			) : null}
		</section>
	);
}
