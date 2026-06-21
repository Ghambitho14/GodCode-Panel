import React from 'react';
import { Phone } from 'lucide-react';
import {
	getPaymentLabel,
	getOrderFulfillmentKind,
	getFulfillmentKindLabel,
	isOrderPaymentDeferred,
	isOrderPaymentSettled,
	isOrderDelivery,
	resolveOrderClientRutForDisplay,
	resolveOrderClientPhoneForDisplay,
	resolveOrderClientNameForDisplay,
	isCajaGenericIdentity,
} from '@/shared/utils/orderUtils';
import { buildWhatsAppUrl, normalizePhoneDigits, WhatsAppGlyph } from '@/shared/utils/phoneWhatsApp';
import DeliveryMotoIcon from './DeliveryMotoIcon';
import TableRestaurantIcon from './TableRestaurantIcon';
import PickupBagIcon from './PickupBagIcon';

const STATUS_LABELS = {
	pending: 'Pendiente',
	active: 'En cocina',
	completed: 'Listo',
	picked_up: 'Entregado',
	cancelled: 'Cancelado',
};

function buildTelHref(phone) {
	const digits = normalizePhoneDigits(phone);
	return digits ? `tel:+${digits.startsWith('56') ? digits : `56${digits}`}` : null;
}

/**
 * Grid compartido Estado / Cliente / Entrega para OrderDetailModal y CashOrderDetailPanel.
 */
export default function OrderDetailMetaCards({
	order,
	branch = null,
	fmt,
	phoneVariant = 'default',
	statusExtra = null,
}) {
	const kind = getOrderFulfillmentKind(order);
	const kindLabel = getFulfillmentKindLabel(kind);
	const isDelivery = isOrderDelivery(order);
	const deliveryFee = Number(order.delivery_fee) || 0;
	const paymentDeferred = isOrderPaymentDeferred(order);
	const paymentLabel = getPaymentLabel(order);
	const showPaidBadge = isOrderPaymentSettled(order);

	const clientRut = resolveOrderClientRutForDisplay(order);
	const clientPhone = resolveOrderClientPhoneForDisplay(order);
	const clientDisplay = resolveOrderClientNameForDisplay(order, kind);
	const showCajaHint = isCajaGenericIdentity(clientRut, clientPhone);
	const telHref = clientPhone ? buildTelHref(clientPhone) : null;
	const whatsAppHref = clientPhone ? buildWhatsAppUrl(clientPhone) : null;

	const createdAt = new Date(order.created_at);
	const statusLabel = STATUS_LABELS[order.status] || order.status || '—';
	const clientCardLabel = kind === 'mesa' ? 'Mesa / Cliente' : 'Cliente';

	return (
		<div className="order-detail-meta-grid">
			<div className="order-detail-card">
				<span className="order-detail-label">Estado y pago</span>
				<div className="order-detail-card-main">
					<div className="order-detail-status-row">
						<span className="order-detail-status-chip">{statusLabel}</span>
						<span
							className={`order-detail-payment-chip${
								paymentDeferred ? ' order-detail-payment-chip--pending' : ''
							}`}
						>
							{paymentLabel}
						</span>
						{showPaidBadge ? (
							<span className="order-detail-paid-badge" title="Pedido ya pagado">
								<PickupBagIcon size={14} aria-hidden />
								Pagado
							</span>
						) : null}
						{statusExtra}
					</div>
					<ul className="order-detail-facts">
						<li>{createdAt.toLocaleString('es-CL')}</li>
						{branch?.name ? <li>{branch.name}</li> : null}
					</ul>
				</div>
				<div className="order-detail-card-foot" aria-hidden />
			</div>

			<div className="order-detail-card">
				<span className="order-detail-label">{clientCardLabel}</span>
				<div className="order-detail-card-main">
					<p className="order-detail-value">{clientDisplay.name}</p>
					{clientDisplay.subtitle ? (
						<p className="order-detail-client-subtitle">{clientDisplay.subtitle}</p>
					) : null}
					<dl className="order-detail-client-grid">
						<div className="order-detail-client-row">
							<dt>Teléfono</dt>
							<dd
								className={
									phoneVariant === 'cash' && clientPhone
										? 'order-detail-client-row__phone'
										: undefined
								}
							>
								{clientPhone ? (
									phoneVariant === 'cash' ? (
										<a href={telHref || undefined} className="cash-order-detail-phone-link">
											<Phone size={14} aria-hidden />
											{clientPhone}
										</a>
									) : (
										<span>{clientPhone}</span>
									)
								) : (
									<span className="order-detail-client-empty">No registrado</span>
								)}
								{whatsAppHref ? (
									<a
										href={whatsAppHref}
										target="_blank"
										rel="noopener noreferrer"
										className={
											phoneVariant === 'cash'
												? 'cash-order-detail-wa-btn'
												: 'order-detail-wa-btn'
										}
										title="Abrir WhatsApp con el cliente"
										aria-label="Abrir WhatsApp con el cliente"
									>
										<WhatsAppGlyph
											className={
												phoneVariant === 'cash'
													? 'cash-order-detail-wa-glyph'
													: 'order-detail-wa-glyph'
											}
										/>
									</a>
								) : null}
							</dd>
						</div>
						<div className="order-detail-client-row">
							<dt>RUT / DNI</dt>
							<dd>
								{clientRut ? (
									clientRut
								) : (
									<span className="order-detail-client-empty">No registrado</span>
								)}
							</dd>
						</div>
					</dl>
					{showCajaHint ? (
						<p className="order-detail-caja-hint">Documento y teléfono genéricos de caja</p>
					) : null}
				</div>
				<div className="order-detail-card-foot" aria-hidden />
			</div>

			<div className="order-detail-card">
				<span className="order-detail-label">Entrega</span>
				<div className="order-detail-card-main">
					<div className={`order-detail-fulfillment is-${kind}`}>
						{kind === 'moto' ? (
							<DeliveryMotoIcon size={18} aria-hidden />
						) : kind === 'retiro' ? (
							<PickupBagIcon size={18} aria-hidden />
						) : (
							<TableRestaurantIcon size={18} aria-hidden />
						)}
						{kindLabel}
					</div>
				</div>
				<div className="order-detail-card-foot">
					<span className="order-detail-kv-label">Cargo envío</span>
					<span className="order-detail-kv-value">
						{isDelivery && deliveryFee > 0 ? fmt(deliveryFee) : '—'}
					</span>
				</div>
			</div>
		</div>
	);
}
