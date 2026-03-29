"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Truck } from "lucide-react";
import "../styles/AdminMenuCarousel.css";
import "../styles/AdminMenuOptions.css";

/**
 * Escribe `branches.delivery_settings.enabled` (JSONB) para la sucursal seleccionada.
 */
export default function AdminMenuDeliverySection({ showNotify, selectedBranch, onSaved }) {
	const branchId =
		selectedBranch?.id && selectedBranch.id !== "all" ? selectedBranch.id : null;

	const [deliveryEnabled, setDeliveryEnabled] = useState(true);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);

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
			setDeliveryEnabled(data.enabled !== false);
		} catch (e) {
			showNotify(e instanceof Error ? e.message : "Error al cargar delivery", "error");
			setDeliveryEnabled(true);
		} finally {
			setLoading(false);
		}
	}, [branchId, showNotify]);

	useEffect(() => {
		void load();
	}, [load]);

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

	if (!branchId) {
		return (
			<section className="glass animate-fade admin-menu-options-card admin-menu-options-delivery">
				<p className="admin-menu-options-card-desc" style={{ margin: 0 }}>
					Selecciona una <strong style={{ color: "white" }}>sucursal</strong> en el encabezado: el
					interruptor guarda <strong>delivery_settings.enabled</strong> en esa fila de{' '}
					<strong>branches</strong>.
				</p>
			</section>
		);
	}

	const branchLabel = selectedBranch?.name ? ` · ${selectedBranch.name}` : "";

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
						El interruptor actualiza en Supabase, en esta sucursal, el campo{' '}
						<strong>delivery_settings.enabled</strong> (JSON en la tabla <strong>branches</strong>).
						El menú público debe leer <strong>delivery_settings</strong> para mostrar u ocultar envío.
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
								? "El menú puede ofrecer envío según tu app."
								: "Sin envío a domicilio en el menú para esta sucursal."}
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
		</section>
	);
}
