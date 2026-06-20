import React, { useEffect, useMemo, useState } from 'react';
import { X, CheckCircle2 } from 'lucide-react';
import { createMoneyFormatter } from '@/shared/utils/money';
import {
	buildPaymentBreakdownForOrder,
	getPaymentLabel,
	isOrderPaymentSettled,
	validateCheckoutPayment,
} from '@/shared/utils/orderUtils';
import PaymentDetails from './manual-order/PaymentDetails';
import { useLockBodyScroll } from '@/shared/hooks/useLockBodyScroll';

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
	const { formatMoney } = useMemo(() => createMoneyFormatter(branch), [branch]);
	const [form, setForm] = useState(DEFAULT_FORM);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (!isOpen || !order) return;
		setForm({
			...DEFAULT_FORM,
			payment_type: order.payment_type && order.payment_type !== 'pendiente' ? order.payment_type : 'tienda',
		});
	}, [isOpen, order]);

	useLockBodyScroll(isOpen);

	if (!isOpen || !order) return null;

	const total = Number(order.total) || 0;

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

	return (
		<div className="table-session-modal-overlay" role="presentation" onClick={onClose}>
			<div
				className="table-session-modal close-table-modal glass"
				role="dialog"
				aria-label="Cerrar mesa"
				onClick={(e) => e.stopPropagation()}
			>
				<header className="table-session-modal__head">
					<h2>Cerrar {order.shift_sequence ? `#${order.shift_sequence}` : 'mesa'}</h2>
					<button type="button" className="admin-icon-btn" onClick={onClose} aria-label="Cerrar">
						<X size={20} />
					</button>
				</header>

				<div className="close-table-modal__summary">
					<p>
						<strong>{order.client_name}</strong>
					</p>
					<p className="close-table-modal__total">Total: {formatMoney(total)}</p>
				</div>

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
						confirmLabel="Confirmar y cerrar"
						hideCheckoutActions={false}
					/>
				)}

				{confirmOnly ? (
					<footer className="table-session-modal__foot">
						<button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
							Cancelar
						</button>
						<button type="button" className="btn btn-primary" onClick={handleConfirm} disabled={loading}>
							{loading ? 'Cerrando…' : 'Confirmar entrega'}
						</button>
					</footer>
				) : null}
			</div>
		</div>
	);
}
