import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Edit2, Loader2, Trash2, X } from 'lucide-react';
import {
	getOrderItemLineTotal,
	getOrderPaymentDisplayLabel,
	getOrderPaymentPreferenceHint,
	getOrderFulfillmentDisplayLabel,
	isOrderDelivery,
	isOrderPaymentDeferred,
	isOrderPaymentSettled,
	resolveOrderCouponCode,
	resolveItemKitchenNote,
} from '@/shared/utils/orderUtils';
import { orderLifecycleV3Service } from '@/modules/cash/services/orderLifecycleV3Service';
import PickupBagIcon from './PickupBagIcon';
import { Button } from "@/components/ui/button";

function formatOrderRef(orderId) {
	const raw = String(orderId ?? '').replace(/-/g, '');
	if (!raw) return '—';
	return raw.slice(-6).toUpperCase();
}

function isLineFullyServed(line) {
	if (!line) return false;
	if (String(line.status || '').toLowerCase() === 'served') return true;
	const ordered = Number(line.quantity_ordered) || 0;
	const voided = Number(line.quantity_voided) || 0;
	const served = Number(line.quantity_served) || 0;
	const preparing = Number(line.quantity_preparing) || 0;
	const prepared = Number(line.quantity_prepared) || 0;
	const effective = Math.max(0, ordered - voided);
	return effective > 0 && served >= effective && preparing === 0 && prepared === 0;
}

/**
 * Avanza la línea pending → preparing → ready → served hasta quedar entregada.
 * @param {string} orderId
 * @param {Record<string, unknown>} line
 */
async function markLineFullyServed(orderId, line) {
	let current = line;
	for (let step = 0; step < 12; step += 1) {
		if (isLineFullyServed(current)) return current;

		const ordered = Number(current.quantity_ordered) || 0;
		const voided = Number(current.quantity_voided) || 0;
		const served = Number(current.quantity_served) || 0;
		const preparing = Number(current.quantity_preparing) || 0;
		const prepared = Number(current.quantity_prepared) || 0;
		const pending = Math.max(0, ordered - preparing - prepared - served - voided);

		/** @type {'preparing' | 'ready' | 'served' | null} */
		let targetStatus = null;
		let quantity = 0;
		if (pending > 0) {
			targetStatus = 'preparing';
			quantity = pending;
		} else if (preparing > 0) {
			targetStatus = 'ready';
			quantity = preparing;
		} else if (prepared > 0) {
			targetStatus = 'served';
			quantity = prepared;
		} else {
			break;
		}

		const result = await orderLifecycleV3Service.transitionLine({
			orderId: String(orderId),
			lineId: current.id,
			targetStatus,
			quantity,
			expectedVersion: current.version,
		});
		if (!result?.line) break;
		current = result.line;
	}
	return current;
}

/**
 * Layout compartido tipo recibo POS para TableSessionModal y CloseTableModal.
 */
export default function TableSessionReceipt({
	order,
	formatMoney,
	formatOrderTotal,
	kind,
	mode = 'session',
	titleId,
	statusLabel,
	onEdit,
	onCancel,
	onClose,
	showNotify,
	onDeliveryProgressChange,
	children,
	footer,
}) {
	const items = order?.items || [];
	const itemCount = items.reduce((acc, i) => acc + (Number(i.quantity) || 1), 0);
	const tableNumber = order?.shift_sequence ?? order?.id;
	const kindLabel = getOrderFulfillmentDisplayLabel(order);
	const paymentDeferred = isOrderPaymentDeferred(order);
	const showPaidBadge = isOrderPaymentSettled(order);
	const isDelivery = isOrderDelivery(order);
	const deliveryFee = isDelivery ? Number(order.delivery_fee) || 0 : 0;
	const taxTotal = Number(order.tax_total) || 0;
	const discountTotal = Number(order.discount_total) || 0;
	const total = Number(order.total) || 0;
	const canMarkDelivered = mode === 'session' && Boolean(order?.id);

	const [orderLines, setOrderLines] = useState([]);
	const [linesLoading, setLinesLoading] = useState(false);
	const [transitioningLineId, setTransitioningLineId] = useState(null);

	useEffect(() => {
		if (!canMarkDelivered) {
			setOrderLines([]);
			return undefined;
		}
		let cancelled = false;
		setLinesLoading(true);
		orderLifecycleV3Service.listLines(order.id)
			.then((rows) => {
				if (!cancelled) setOrderLines(rows);
			})
			.catch(() => {
				if (!cancelled) setOrderLines([]);
			})
			.finally(() => {
				if (!cancelled) setLinesLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [canMarkDelivered, order?.id, order?.updated_at]);

	const orderLineById = useMemo(() => {
		const map = new Map();
		for (const line of orderLines) {
			map.set(String(line.id), line);
		}
		return map;
	}, [orderLines]);

	const handleMarkDelivered = useCallback(async (line) => {
		if (!order?.id || !line?.id || transitioningLineId) return;
		if (isLineFullyServed(line)) return;
		setTransitioningLineId(line.id);
		try {
			const next = await markLineFullyServed(order.id, line);
			setOrderLines((current) =>
				current.map((row) => (row.id === next.id ? next : row)),
			);
			onDeliveryProgressChange?.();
			showNotify?.('Producto marcado como entregado.', 'success');
		} catch (error) {
			showNotify?.(error?.message || 'No se pudo marcar como entregado.', 'error');
			try {
				setOrderLines(await orderLifecycleV3Service.listLines(order.id));
			} catch {
				// keep last visible state
			}
		} finally {
			setTransitioningLineId(null);
		}
	}, [order?.id, transitioningLineId, showNotify, onDeliveryProgressChange]);

	const linesSubtotal = useMemo(
		() => Math.round(items.reduce((sum, item) => sum + getOrderItemLineTotal(item), 0)),
		[items],
	);
	const subtotal = Number(order.subtotal) > 0 ? Number(order.subtotal) : linesSubtotal;
	const orderRef = formatOrderRef(order?.id);
	const paymentLabel = getOrderPaymentDisplayLabel(order);
	const paymentPreferenceHint = getOrderPaymentPreferenceHint(order);
	const couponCode = resolveOrderCouponCode(order);

	return (
		<>
			<header className="table-session-receipt__head">
				<div className="table-session-receipt__head-text">
					<h2 id={titleId} className="table-session-receipt__title-row">
						<span className="table-session-receipt__title">
							{kindLabel} #{tableNumber}
						</span>
						{showPaidBadge ? (
							<span className="table-session-receipt__paid-badge" title="Pedido ya pagado">
								<PickupBagIcon size={16} aria-hidden />
								Pagado
							</span>
						) : null}
					</h2>
					<p className="table-session-receipt__order-id">
						Pedido <strong className="table-session-receipt__order-code">#{orderRef}</strong>
					</p>
					<div className="table-session-receipt__meta">
						<span className="table-session-receipt__meta-item">{order?.display_name || order?.client_name || 'Cliente'}</span>
						{itemCount > 0 ? (
							<>
								<span className="table-session-receipt__meta-sep" aria-hidden>·</span>
								<span className="table-session-receipt__meta-item">
									{itemCount} {itemCount === 1 ? 'ítem' : 'ítems'}
								</span>
							</>
						) : null}
						<span className="table-session-receipt__meta-sep" aria-hidden>·</span>
						<span
							className={`table-session-receipt__meta-payment${
								paymentDeferred ? ' table-session-receipt__meta-payment--pending' : ''
							}`}
						>
							{paymentLabel}
							{paymentDeferred && paymentPreferenceHint ? ` (${paymentPreferenceHint})` : ''}
						</span>
						{couponCode ? (
							<>
								<span className="table-session-receipt__meta-sep" aria-hidden>·</span>
								<span className="table-session-receipt__meta-code">{couponCode}</span>
							</>
						) : null}
						{statusLabel ? (
							<>
								<span className="table-session-receipt__meta-sep" aria-hidden>·</span>
								<span className="table-session-receipt__meta-item">{statusLabel}</span>
							</>
						) : null}
					</div>
				</div>
				<div className="table-session-receipt__head-actions">
					{mode === 'session' && onEdit ? (
						<Button variant="default"
							type="button"
							className="table-session-receipt__icon-btn"
							onClick={onEdit}
							aria-label="Editar pedido"
						>
							<Edit2 size={18} strokeWidth={1.75} />
						</Button>
					) : null}
					{mode === 'session' && onCancel ? (
						<Button variant="destructive"
							type="button"
							className="table-session-receipt__icon-btn table-session-receipt__icon-btn--danger"
							onClick={onCancel}
							aria-label="Cancelar pedido"
						>
							<Trash2 size={18} strokeWidth={1.75} />
						</Button>
					) : null}
					{onClose ? (
						<Button variant="default"
							type="button"
							className="table-session-receipt__icon-btn"
							onClick={onClose}
							aria-label="Cerrar"
						>
							<X size={18} strokeWidth={1.75} />
						</Button>
					) : null}
				</div>
			</header>

			<div className="table-session-receipt__scroll">
				{items.length > 0 ? (
					<section className="table-session-receipt__section">
						<h3 className="table-session-receipt__section-title">Ítems pedidos</h3>
						{canMarkDelivered ? (
							<p className="table-session-receipt__hint">
								Toca un ítem para marcarlo como entregado
								{linesLoading ? ' · cargando…' : ''}
							</p>
						) : null}
						<ul className="table-session-receipt__items">
							{items.map((item, idx) => {
								const itemNote = resolveItemKitchenNote(item, order.note);
								const lineId = String(item.line_id ?? item.lineId ?? '');
								const lifecycleLine = lineId ? orderLineById.get(lineId) : null;
								const served = isLineFullyServed(lifecycleLine);
								const interactive = canMarkDelivered && Boolean(lifecycleLine) && !served;
								const busy = transitioningLineId === lifecycleLine?.id;

								const main = (
									<>
										<div className="table-session-receipt__item-main">
											<span className="table-session-receipt__item-name">
												{item.quantity}x {item.name}
											</span>
											{itemNote ? (
												<span className="table-session-receipt__item-note">{itemNote}</span>
											) : null}
											{served ? (
												<span className="table-session-receipt__item-served-label">Entregado</span>
											) : null}
										</div>
										<span className="table-session-receipt__item-price">
											{busy ? (
												<Loader2 size={14} className="animate-spin" aria-hidden />
											) : served ? (
												<Check size={14} className="table-session-receipt__item-check" aria-hidden />
											) : null}
											{formatMoney(getOrderItemLineTotal(item))}
										</span>
									</>
								);

								if (interactive) {
									return (
										<li key={`${lineId || item.id || idx}-${idx}`}>
											<button
												type="button"
												className={`table-session-receipt__item table-session-receipt__item--interactive${busy ? ' is-busy' : ''}`}
												onClick={() => { void handleMarkDelivered(lifecycleLine); }}
												disabled={busy}
												aria-label={`Marcar entregado: ${item.quantity}x ${item.name}`}
											>
												{main}
											</button>
										</li>
									);
								}

								return (
									<li
										key={`${lineId || item.id || idx}-${idx}`}
										className={`table-session-receipt__item${served ? ' table-session-receipt__item--served' : ''}`}
									>
										{main}
									</li>
								);
							})}
						</ul>
					</section>
				) : null}

				<section className="table-session-receipt__section table-session-receipt__totals">
					<div className="table-session-receipt__total-row">
						<span>Subtotal</span>
						<span>{formatMoney(subtotal)}</span>
					</div>
					{taxTotal > 0 ? (
						<div className="table-session-receipt__total-row">
							<span>Impuesto</span>
							<span>{formatMoney(taxTotal)}</span>
						</div>
					) : null}
					{deliveryFee > 0 ? (
						<div className="table-session-receipt__total-row">
							<span>Envío</span>
							<span>{formatMoney(deliveryFee)}</span>
						</div>
					) : null}
					{discountTotal > 0 ? (
						<div className="table-session-receipt__total-row table-session-receipt__total-row--discount">
							<span>Descuento</span>
							<span>−{formatMoney(discountTotal)}</span>
						</div>
					) : null}
					<div className="table-session-receipt__total-row table-session-receipt__total-row--final">
						<span>Total a pagar</span>
						<span>
							{formatOrderTotal
								? formatOrderTotal(total, order)
								: formatMoney(total)}
						</span>
					</div>
				</section>

				{children ? (
					<div className="table-session-receipt__extra">{children}</div>
				) : null}
			</div>

			{footer ? (
				<footer className="table-session-receipt__foot">{footer}</footer>
			) : null}
		</>
	);
}
