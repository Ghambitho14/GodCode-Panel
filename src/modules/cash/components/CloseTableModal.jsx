import React, { useEffect, useMemo, useState } from 'react';

import { createPortal } from 'react-dom';

import { CheckCircle2 } from 'lucide-react';

import { createMoneyFormatter } from '@/shared/utils/money';

import {

	buildPaymentBreakdownForOrder,

	getOrderTileKind,

	getOrderPaymentDisplayLabel,

	isOrderPaymentSettled,

	validateCheckoutPayment,

} from '@/shared/utils/orderUtils';

import PaymentDetails from './manual-order/PaymentDetails';

import { useLockBodyScroll } from '@/shared/hooks/useLockBodyScroll';

import TableSessionReceipt from './TableSessionReceipt';



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

	intent = 'close',

	stackAboveManualOrder = false,

}) {

	const isPayIntent = intent === 'pay';

	const confirmOnly = useMemo(
		() => !isPayIntent && isOrderPaymentSettled(order),
		[order, isPayIntent],
	);

	const kind = useMemo(() => getOrderTileKind(order), [order]);

	const { formatMoney } = useMemo(() => createMoneyFormatter(branch), [branch]);

	const [form, setForm] = useState(DEFAULT_FORM);

	const [loading, setLoading] = useState(false);



	useEffect(() => {

		if (!isOpen || !order) return;

		setForm({

			...DEFAULT_FORM,

			payment_type: order.payment_type && order.payment_type !== 'pendiente' ? order.payment_type : 'tienda',

		});

		// Solo al abrir o cambiar de pedido — no cuando el padre pasa un nuevo objeto (realtime).
	}, [isOpen, order?.id]);



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

	const confirmLabel = isPayIntent
		? 'Registrar pago'
		: confirmOnly
			? 'Confirmar entrega'
			: ({
				mesa: 'Confirmar y cerrar mesa',
				retiro: 'Confirmar y cerrar retiro',
				moto: 'Confirmar y cerrar delivery',
			}[kind] ?? 'Confirmar y cerrar');

	const statusLabel = isPayIntent ? 'Cobro' : 'Lista';



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

		<div className={`table-session-modal-portal tenant-theme-vars${isPayIntent ? ' table-session-modal-portal--pay-intent' : ''}${stackAboveManualOrder ? ' table-session-modal-portal--above-manual-order' : ''}`}>

			<div className="table-session-modal-overlay" role="presentation" onClick={onClose}>

				<div className="admin-layout table-session-modal-portal-host">

					<div

						className={`table-session-modal close-table-modal table-session-modal--receipt table-session-modal--completed table-session-modal--${kind}${isPayIntent ? ' close-table-modal--pay' : ''}`}

						role="dialog"

						aria-modal="true"

						aria-labelledby="close-table-modal-title"

						onClick={(event) => event.stopPropagation()}

					>

						<TableSessionReceipt

							order={order}

							formatMoney={formatMoney}

							kind={kind}

							mode="checkout"

							titleId="close-table-modal-title"

							statusLabel={statusLabel}

							onClose={onClose}

							children={

								confirmOnly ? (

									<div className="close-table-modal__confirm-only">

										<CheckCircle2 size={20} aria-hidden />

										<div>

											<strong>Pago registrado</strong>

											<p>{getOrderPaymentDisplayLabel(order)} — confirma la entrega para cerrar.</p>

										</div>

									</div>

								) : (

									<PaymentDetails

										variant="receipt"

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

								)

							}

							footer={

								<button

									type="button"

									className="table-session-receipt__cta"

									onClick={handleConfirm}

									disabled={loading || !isFormValid()}

								>

									{loading ? (isPayIntent ? 'Registrando…' : 'Cerrando…') : confirmLabel}

								</button>

							}

						/>

					</div>

				</div>

			</div>

		</div>

	);



	if (typeof document === 'undefined') return null;

	return createPortal(modal, document.body);

}

