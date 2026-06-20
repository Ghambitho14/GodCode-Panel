import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle2, User, Receipt } from 'lucide-react';
import { createMoneyFormatter } from '@/shared/utils/money';
import {
	buildPaymentBreakdownForOrder,
	getOrderTileKind,
	getPaymentLabel,
	isOrderPaymentDeferred,
	isOrderPaymentSettled,
	validateCheckoutPayment,
} from '@/shared/utils/orderUtils';
import PaymentDetails from './manual-order/PaymentDetails';
import { useLockBodyScroll } from '@/shared/hooks/useLockBodyScroll';
import DeliveryMotoIcon from './DeliveryMotoIcon';
import TableRestaurantIcon from './TableRestaurantIcon';

const DEFAULT_FORM = {
	payment_mode: 'single',
	payment_type: 'tienda',
	cash_amount: 0,
	card_amount: 0,
	cash_tendered: 0,
};

export default function CloseTableModal({
	isOpen,
	onClose,
	order,
	branch,
	onConfirm,
	showNotify,
}) {
	const confirmOnly = useMemo(() => isOrderPaymentSettled(order), [order]);
	const kind = useMemo(() => getOrderTileKind(order), [order]);
	const { formatMoney } = useMemo(() => createMoneyFormatter(branch), [branch]);
	const [form, setForm] = useState(DEFAULT_FORM);
	const [loading, setLoading] = useState(false);

	const itemCount = useMemo(
		() => (order?.items || []).reduce((acc, item) => acc + (Number(item.quantity) || 1), 0),
		[order?.items],
	);

	useEffect(() => {
		if (!isOpen || !order) return;
		setForm({
			...DEFAULT_FORM,
			payment_type: order.payment_type && order.payment_type !== 'pendiente' ? order.payment_type : 'tienda',
		});
	}, [isOpen, order]);

	useLockBodyScroll(isOpen);

	useEffect(() => {
		if (!isOpen) return undefined;
		const onKeyDown = (event) => {
			if (event.key === 'Escape') onClose();
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [isOpen, onClose]);

	if (!isOpen || !order) return null;

	const total = Number(order.total) || 0;
	const paymentDeferred = isOrderPaymentDeferred(order);
	const closeLabel = kind === 'moto' ? 'Cerrar moto' : 'Cerrar mesa';
	const confirmLabel = confirmOnly ? 'Confirmar entrega' : 'Confirmar y cerrar';

	const manualOrderShape = {
		...form,
		total,
		order_type: order.order_type,
		delivery_fee: order.delivery_fee,
		items: order.items,
		coupon_code: order.coupon_code,
	};

	const isFormValid = () => {
		if (confirmOnly) return true;
		if (total <= 0) return true;
		return validateCheckoutPayment({
			payment_mode: form.payment_mode,
			payment_type: form.payment_type,
			cash_amount: form.cash_amount,
			card_amount: form.card_amount,
			cash_tendered: form.cash_tendered,
			totalToPay: total,
		}).valid;
	};

	const handleConfirm = async () => {
		if (!isFormValid()) {
			showNotify?.('Revisa el método de pago', 'warning');
			return;
		}
		setLoading(true);
		try {
			const paymentPatch = confirmOnly
				? null
				: {
					...form,
					payment_breakdown: buildPaymentBreakdownForOrder({
						payment_mode: form.payment_mode,
						payment_type: form.payment_type,
						cash_amount: form.cash_amount,
						card_amount: form.card_amount,
						total,
					}),
				};
			const ok = await onConfirm(order, paymentPatch);
			if (ok) onClose();
		} finally {
			setLoading(false);
		}
	};

	const modal = (
		<div className="table-session-modal-portal">
			<div className="table-session-modal-overlay" role="presentation" onClick={onClose}>
				<div className="admin-layout table-session-modal-portal-host">
					<div
						className={`table-session-modal close-table-modal glass table-session-modal--completed table-session-modal--${kind}`}
						role="dialog"
						aria-modal="true"
						aria-labelledby="close-table-modal-title"
						onClick={(event) => event.stopPropagation()}
					>
						<div className="table-session-modal__accent" aria-hidden />

						<header className="table-session-modal__head">
							<div className="table-session-modal__identity">
								<div className="table-session-modal__number-row">
									<span className="table-session-modal__kind-icon" aria-hidden>
										{kind === 'moto' ? (
											<DeliveryMotoIcon size={22} />
										) : (
											<TableRestaurantIcon size={22} />
										)}
									</span>
									<h2 id="close-table-modal-title">#{order.shift_sequence ?? order.id}</h2>
									<span className="table-session-modal__status table-session-modal__status--completed">
										Lista
									</span>
								</div>
								<p className="table-session-modal__kind-label">{closeLabel}</p>
							</div>
							<button
								type="button"
								className="admin-icon-btn table-session-modal__close"
								onClick={onClose}
								aria-label="Cerrar"
							>
								<X size={20} />
							</button>
						</header>

						<div className="table-session-modal__hero">
							<div className="table-session-modal__client-row">
								<User size={16} strokeWidth={1.75} aria-hidden />
								<span>{order.client_name || 'Cliente'}</span>
							</div>
							<div className="table-session-modal__meta-row">
								{itemCount > 0 ? (
									<span className="table-session-modal__meta-chip">
										<Receipt size={13} strokeWidth={1.75} aria-hidden />
										{itemCount} {itemCount === 1 ? 'ítem' : 'ítems'}
									</span>
								) : null}
								{confirmOnly ? (
									<span className="table-session-modal__meta-chip">{getPaymentLabel(order)}</span>
								) : paymentDeferred ? (
									<span className="table-session-modal__meta-chip table-session-modal__meta-chip--warn">
										Pago pendiente
									</span>
								) : (
									<span className="table-session-modal__meta-chip">{getPaymentLabel(order)}</span>
								)}
							</div>
							<p className="table-session-modal__total">{formatMoney(total)}</p>
						</div>

						{(order.items || []).length > 0 ? (
							<div className="table-session-modal__items-wrap close-table-modal__items">
								<h3 className="table-session-modal__items-title">Comanda</h3>
								<ul className="table-session-modal__items">
									{(order.items || []).map((item, idx) => (
										<li key={idx} className="table-session-modal__item">
											<span className="table-session-modal__item-qty">{item.quantity}x</span>
											<div className="table-session-modal__item-body">
												<span className="table-session-modal__item-name">{item.name}</span>
												{item.note ? (
													<span className="table-session-modal__item-note">{item.note}</span>
												) : null}
											</div>
										</li>
									))}
								</ul>
							</div>
						) : null}

						<div className="close-table-modal__body">
							{confirmOnly ? (
								<div className="close-table-modal__confirm-only">
									<CheckCircle2 size={20} aria-hidden />
									<div>
										<strong>Pago registrado</strong>
										<p>{getPaymentLabel(order)} — confirma la entrega para cerrar.</p>
									</div>
								</div>
							) : (
								<PaymentDetails
									manualOrder={manualOrderShape}
									branch={branch}
									updateCouponCode={() => {}}
									couponPreview={null}
									updatePaymentType={(type) => setForm((f) => ({ ...f, payment_type: type }))}
									updatePaymentMode={(mode) => setForm((f) => ({ ...f, payment_mode: mode }))}
									updateCashAmount={(v) => setForm((f) => ({ ...f, cash_amount: v }))}
									updateCardAmount={(v) => setForm((f) => ({ ...f, card_amount: v }))}
									updateCashTendered={(v) => setForm((f) => ({ ...f, cash_tendered: v }))}
									receiptFile={null}
									receiptPreview={null}
									handleFileChange={() => {}}
									removeReceipt={() => {}}
									submitOrder={handleConfirm}
									loading={loading}
									isFormValid={isFormValid}
									hideCouponSection
									hideTotalBreakdown
									hideCheckoutActions
								/>
							)}
						</div>

						<footer className="table-session-modal__foot close-table-modal__foot">
							<div className="close-table-modal__actions">
								<button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
									Cancelar
								</button>
								<button
									type="button"
									className="btn btn-primary"
									onClick={handleConfirm}
									disabled={loading || !isFormValid()}
								>
									{loading ? (
										'Cerrando…'
									) : (
										<>
											<CheckCircle2 size={16} aria-hidden />
											{confirmLabel}
										</>
									)}
								</button>
							</div>
						</footer>
					</div>
				</div>
			</div>
		</div>
	);

	if (typeof document === 'undefined') return null;
	return createPortal(modal, document.body);
}
