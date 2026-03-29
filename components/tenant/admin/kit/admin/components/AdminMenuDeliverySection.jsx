"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Truck } from "lucide-react";
import {
	computeDeliveryFee,
	normalizeDeliverySettings,
} from "@/lib/delivery-settings";
import "../styles/AdminMenuCarousel.css";
import "../styles/AdminMenuOptions.css";

const emptyDraft = () => ({
	pricePerKm: "",
	baseFee: "",
	minFee: "",
	maxFee: "",
	maxDeliveryKm: "",
	freeDeliveryFromSubtotal: "",
	minOrderSubtotal: "",
	customerNotes: "",
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
		});
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

	const normalizedFromDraft = useMemo(() => {
		return normalizeDeliverySettings({
			enabled: deliveryEnabled,
			pricePerKm: draft.pricePerKm === "" ? 0 : Number(draft.pricePerKm),
			baseFee: draft.baseFee === "" ? 0 : Number(draft.baseFee),
			minFee: draft.minFee === "" ? null : Number(draft.minFee),
			maxFee: draft.maxFee === "" ? null : Number(draft.maxFee),
			maxDeliveryKm: draft.maxDeliveryKm === "" ? null : Number(draft.maxDeliveryKm),
			freeDeliveryFromSubtotal:
				draft.freeDeliveryFromSubtotal === "" ? null : Number(draft.freeDeliveryFromSubtotal),
			minOrderSubtotal: draft.minOrderSubtotal === "" ? null : Number(draft.minOrderSubtotal),
			customerNotes: draft.customerNotes,
		});
	}, [deliveryEnabled, draft]);

	const previewFee = useMemo(() => {
		const exKm = 3;
		const exSubtotal = 15000;
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
			};
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
				: "Ejemplo no aplicable: subtotal inferior al pedido mínimo."
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
						Configura si el menú permite envío y cuánto cobrar por kilómetro (más cargo fijo y límites
						opcionales). El cliente verá estas reglas al elegir delivery en el checkout.
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
								? "Los clientes podrán elegir envío a domicilio si completan distancia y dirección."
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
							<label htmlFor="adm-del-notes">Texto de ayuda (checkout)</label>
							<textarea
								id="adm-del-notes"
								className="form-input"
								rows={2}
								placeholder="Ej.: Entregas en 45–60 min en horario de caja abierta."
								value={draft.customerNotes}
								onChange={(ev) =>
									setDraft((d) => ({ ...d, customerNotes: ev.target.value }))
								}
							/>
						</div>
					</div>
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
