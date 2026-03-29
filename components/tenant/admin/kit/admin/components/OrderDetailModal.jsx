"use client";

import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Truck, Store, KeyRound, ChefHat, Banknote } from "lucide-react";
import {
	deliveryAddressLines,
	getPaymentLabel,
	isOrderDelivery,
} from "../../shared/utils/orderUtils";
import { printOrderTicket } from "../utils/receiptPrinting";

export default function OrderDetailModal({ order, onClose, branchName, branchAddress = null, logoUrl = null }) {
	useEffect(() => {
		const onKey = (e) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	if (!order || typeof document === "undefined") return null;

	const delivery = isOrderDelivery(order);
	const addrLines = deliveryAddressLines(order.delivery_address);
	const fee = Number(order.delivery_fee);
	const hasFee = Number.isFinite(fee) && fee > 0;
	const handoffCode =
		order.handoff_code != null && String(order.handoff_code).trim() !== ""
			? String(order.handoff_code).trim()
			: null;

	return createPortal(
		<div
			className="admin-layout order-detail-overlay"
			role="presentation"
			onClick={onClose}
		>
			<div
				className="order-detail-panel glass"
				role="dialog"
				aria-modal="true"
				aria-labelledby="order-detail-title"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="order-detail-head">
					<h2 id="order-detail-title" className="order-detail-title">
						Pedido #{order.order_number ?? order.id}
					</h2>
					<button
						type="button"
						className="order-detail-close"
						onClick={onClose}
						aria-label="Cerrar"
					>
						<X size={22} />
					</button>
				</div>

				<div className="order-detail-body">
					{handoffCode ? (
						<div className="order-detail-section order-detail-handoff-block">
							<span className="order-detail-label">Código para confirmar el pedido</span>
							<div className="order-detail-handoff-code" title="Código generado al crear el pedido">
								<KeyRound size={20} aria-hidden className="order-detail-handoff-icon" />
								<span className="order-detail-handoff-digits">{handoffCode}</span>
							</div>
							<p className="order-detail-muted order-detail-handoff-hint">
								El cliente puede usar este código al retirar o recibir el pedido.
							</p>
						</div>
					) : null}

					<div className="order-detail-section">
						<span className="order-detail-label">Tipo de entrega</span>
						<div
							className={`order-detail-fulfillment ${delivery ? "is-delivery" : "is-pickup"}`}
						>
							{delivery ? (
								<>
									<Truck size={18} aria-hidden />
									<span>Delivery</span>
								</>
							) : (
								<>
									<Store size={18} aria-hidden />
									<span>Retiro en local</span>
								</>
							)}
						</div>
					</div>

					{delivery && (addrLines.length > 0 || hasFee) ? (
						<div className="order-detail-section">
							<span className="order-detail-label">Envío</span>
							{hasFee ? (
								<p className="order-detail-value">
									Tarifa delivery: ${fee.toLocaleString("es-CL")}
								</p>
							) : null}
							{addrLines.length > 0 ? (
								<pre className="order-detail-address">{addrLines.join("\n")}</pre>
							) : null}
						</div>
					) : null}

					<div className="order-detail-section">
						<span className="order-detail-label">Cliente</span>
						<p className="order-detail-value">{order.client_name}</p>
						{order.client_phone ? (
							<p className="order-detail-muted">{order.client_phone}</p>
						) : null}
						{order.client_rut ? (
							<p className="order-detail-muted">{order.client_rut}</p>
						) : null}
					</div>

					{branchName ? (
						<div className="order-detail-section">
							<span className="order-detail-label">Sucursal</span>
							<p className="order-detail-value">{branchName}</p>
						</div>
					) : null}

					<div className="order-detail-section">
						<span className="order-detail-label">Pago</span>
						<p className="order-detail-value">{getPaymentLabel(order)}</p>
					</div>

					<div className="order-detail-section">
						<span className="order-detail-label">Productos</span>
						<ul className="order-detail-items">
							{(order.items || []).map((item, idx) => (
								<li key={idx}>
									<strong>{item.quantity}×</strong> {item.name}
									{item.description ? (
										<span className="order-detail-item-desc">
											{" "}
											— {item.description}
										</span>
									) : null}
								</li>
							))}
						</ul>
					</div>

					{order.note ? (
						<div className="order-detail-section">
							<span className="order-detail-label">Nota</span>
							<p className="order-detail-note">{order.note}</p>
						</div>
					) : null}

					<div className="order-detail-section order-detail-total-row">
						<span className="order-detail-label">Total</span>
						<span className="order-detail-total">
							${Number(order.total || 0).toLocaleString("es-CL")}
						</span>
					</div>

					<div className="order-detail-section">
						<span className="order-detail-label">Imprimir</span>
						<div className="order-detail-ticket-actions">
							<button
								type="button"
								className="btn order-detail-ticket-btn"
								onClick={() =>
									printOrderTicket(order, branchName || "NOMBRE DEL LOCAL", logoUrl, {
										variant: "kitchen",
										branchAddress,
									})
								}
							>
								<ChefHat size={18} aria-hidden />
								Ticket cocina
							</button>
							<button
								type="button"
								className="btn order-detail-ticket-btn order-detail-ticket-btn--primary"
								onClick={() =>
									printOrderTicket(order, branchName || "NOMBRE DEL LOCAL", logoUrl, {
										variant: "cashier",
										branchAddress,
									})
								}
							>
								<Banknote size={18} aria-hidden />
								Ticket caja
							</button>
						</div>
					</div>

					{order.created_at ? (
						<p className="order-detail-muted order-detail-date">
							{new Date(order.created_at).toLocaleString("es-CL")}
						</p>
					) : null}
				</div>

				<div className="order-detail-foot">
					<button type="button" className="btn btn-primary order-detail-done" onClick={onClose}>
						Cerrar
					</button>
				</div>
			</div>
		</div>,
		document.body,
	);
}
