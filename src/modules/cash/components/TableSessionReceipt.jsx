import React, { useMemo } from 'react';
import { Edit2, Trash2, X } from 'lucide-react';
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
import PickupBagIcon from './PickupBagIcon';
import { Button } from "@/components/ui/button";

function formatOrderRef(orderId) {
	const raw = String(orderId ?? '').replace(/-/g, '');
	if (!raw) return '—';
	return raw.slice(-6).toUpperCase();
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
						<ul className="table-session-receipt__items">
							{items.map((item, idx) => {
								const itemNote = resolveItemKitchenNote(item, order.note);
								return (
								<li key={idx} className="table-session-receipt__item">
									<div className="table-session-receipt__item-main">
										<span className="table-session-receipt__item-name">
											{item.quantity}x {item.name}
										</span>
										{itemNote ? (
											<span className="table-session-receipt__item-note">{itemNote}</span>
										) : null}
									</div>
									<span className="table-session-receipt__item-price">
										{formatMoney(getOrderItemLineTotal(item))}
									</span>
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
