import React, { useEffect, useId, useMemo, useRef, useState } from 'react';

import { createPortal } from 'react-dom';

import { Loader2, X } from 'lucide-react';

import { useOrderMoney } from '@/modules/cash/hooks/useOrderMoney';

import {
	buildPaymentBreakdownForOrder,
	getOrderFulfillmentDisplayLabel,
	getOrderItemLineTotal,
	getOrderPaymentDisplayLabel,
	getOrderPaymentPreferenceHint,
	getOrderTileKind,
	isOrderDelivery,
	isOrderPaymentDeferred,
	isOrderPaymentSettled,
	resolveOrderCouponCode,
	resolveOrderDueMinor,
	validateCheckoutPayment,
} from '@/shared/utils/orderUtils';

import { useLockBodyScroll } from '@/shared/hooks/useLockBodyScroll';
import { localeForCurrency } from '@/shared/utils/money';
import { formatMinor, isoFractionDigits, majorToMinor, minorToMajor } from '@/lib/money/minor-units';
import { extractExchangeRateFromDeliverySettings } from '@/lib/money/order-amount';
import { getCountryProfile } from '@/lib/geo/country-profiles';
import { isVenezuelaCountry } from '@/lib/geo/tenant-locale';
import { normalizeConfiguredPaymentMethods } from '../domain/payment-methods';
import { normalizeManualOrderSettings } from '../domain/manual-order-settings';
import { useReceiptUpload } from '../hooks/manual-order/useReceiptUpload';
import { usePaymentLines } from '../hooks/manual-order/usePaymentLines';
import DualCurrencyAmount from './manual-order/DualCurrencyAmount';
import DeliveryMotoIcon from './DeliveryMotoIcon';
import PickupBagIcon from './PickupBagIcon';
import TableRestaurantIcon from './TableRestaurantIcon';
import CobroDue from './cobro/CobroDue';
import CobroEvidence from './cobro/CobroEvidence';
import CobroLegacyPanel from './cobro/CobroLegacyPanel';
import CobroLinesPanel from './cobro/CobroLinesPanel';
import CobroTicket from './cobro/CobroTicket';
import { summarizeLegacyPayment, summarizeLinesPayment } from './cobro/cobroPayment';

const DEFAULT_FORM = {
	payment_mode: 'single',
	payment_type: '',
	cash_amount: 0,
	card_amount: 0,
	cash_tendered: 0,
	payment_lines: [],
};

const KIND_ICON = {
	mesa: TableRestaurantIcon,
	moto: DeliveryMotoIcon,
	retiro: PickupBagIcon,
};

const CLOSE_LABEL_BY_KIND = {
	mesa: 'Confirmar y cerrar mesa',
	retiro: 'Confirmar y cerrar retiro',
	moto: 'Confirmar y cerrar delivery',
};

const SETTLED_NOTE_BY_KIND = {
	mesa: 'Confirma la entrega para cerrar la mesa.',
	retiro: 'Confirma la entrega para cerrar el retiro.',
	moto: 'Confirma la entrega para cerrar el delivery.',
};

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

function initialFormFor(order) {
	return {
		...DEFAULT_FORM,
		// Un pedido pendiente no hereda "efectivo". El cajero debe confirmar
		// el método real antes de registrar o cerrar el cobro.
		payment_type: order.payment_type && order.payment_type !== 'pendiente' ? order.payment_type : '',
	};
}

function formatOrderRef(orderId) {
	const raw = String(orderId ?? '').replace(/-/g, '');
	if (!raw) return '—';
	return raw.slice(-6).toUpperCase();
}

function parseMinorField(value) {
	if (value == null || value === '') return null;
	const number = Number(value);
	return Number.isSafeInteger(number) ? number : null;
}

/**
 * Cobro y cierre de un pedido: ticket a un lado, cobro al otro.
 *
 * `intent="pay"` registra el pago; `intent="close"` cobra (si hace falta) y
 * cierra. Si el pedido ya está pagado, solo pide confirmar la entrega.
 */
export default function CloseTableModal(props) {
	if (!props.isOpen || !props.order || typeof document === 'undefined') return null;
	/* La key reinicia formulario y comprobante al cambiar de pedido. Un objeto
	   nuevo del mismo pedido (realtime) no remonta: conserva lo que se escribió. */
	return createPortal(<CobroSheet key={props.order.id} {...props} />, document.body);
}

function CobroSheet({
	onClose,
	order,
	branch,
	onConfirm,
	showNotify,
	intent = 'close',
	stackAboveManualOrder = false,
}) {
	const isPayIntent = intent === 'pay';
	const confirmOnly = !isPayIntent && isOrderPaymentSettled(order);
	const kind = getOrderTileKind(order);

	const orderMoney = useOrderMoney();
	const { formatMoney, formatOrderAmount } = orderMoney;

	const [form, setForm] = useState(() => initialFormFor(order));
	const [loading, setLoading] = useState(false);
	const dueMinorBaselineRef = useRef(resolveOrderDueMinor(order));
	const dialogRef = useRef(null);
	const overlayPressRef = useRef(false);
	const titleId = useId();
	const methodsTitleId = useId();

	const {
		receiptFile,
		receiptPreview,
		handleFileChange,
		removeReceipt,
		resetReceipt,
	} = useReceiptUpload(showNotify);

	/* Si el saldo cambia con el modal abierto (otro cajero cobró una parte, se
	   agregó un ítem), los montos repartidos ya no valen: se vuelven a elegir. */
	useEffect(() => {
		if (confirmOnly) return;
		const nextDue = resolveOrderDueMinor(order);
		if (dueMinorBaselineRef.current === nextDue) return;
		dueMinorBaselineRef.current = nextDue;
		setForm((prev) => ({
			...prev,
			payment_lines: [],
			cash_amount: 0,
			card_amount: 0,
			cash_tendered: 0,
		}));
		// eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando cambia el saldo del pedido
	}, [
		confirmOnly,
		order.id,
		order.payment_balance_minor,
		order.total_minor,
		order.total,
		order.currency,
	]);

	useLockBodyScroll(true);

	/* Foco dentro del diálogo al abrir y de vuelta a donde estaba al cerrar. */
	useEffect(() => {
		const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		dialogRef.current?.focus({ preventScroll: true });
		return () => previouslyFocused?.focus?.({ preventScroll: true });
	}, []);

	useEffect(() => {
		const onKeyDown = (event) => {
			if (event.key === 'Escape') {
				onClose();
				return;
			}
			if (event.key !== 'Tab') return;
			const root = dialogRef.current;
			if (!root) return;
			const focusable = [...root.querySelectorAll(FOCUSABLE)].filter((element) => element.getClientRects().length > 0);
			if (focusable.length === 0) {
				event.preventDefault();
				root.focus();
				return;
			}
			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			const active = document.activeElement;
			if (!root.contains(active)) {
				event.preventDefault();
				first.focus();
			} else if (event.shiftKey && (active === first || active === root)) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && active === last) {
				event.preventDefault();
				first.focus();
			}
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [onClose]);

	/* En Venezuela la moneda contable es USD aunque la sucursal tenga VES
	   configurada: lo dice resolveEffectiveCurrency y lo usa el resto de la app.
	   Leyendo la moneda en crudo, este flujo se saltaba la regla y los botones de
	   metodo de pago decian VES mientras los importes de la misma pantalla salian
	   en dolares. Solo se fuerza para Venezuela; el resto de paises conservan la
	   precedencia que tenian. */
	const currency = isVenezuelaCountry(branch?.country)
		? 'USD'
		: String(order.currency || branch?.currency || 'CLP').toUpperCase();
	const fractionDigits = isoFractionDigits(currency, branch?.manual_order_settings?.currencyFractionDigits);
	const manualOrderSettings = useMemo(
		() => normalizeManualOrderSettings(branch?.manual_order_settings),
		[branch?.manual_order_settings],
	);
	/* Mismo locale y billetes que el pedido manual: sin locale, el saldo salía
	   como "USD 24.00" junto a un total "USD 24,00". */
	const countryProfile = getCountryProfile(branch?.country || orderMoney.country, { currency });
	const locale = countryProfile.locale || localeForCurrency(currency);
	const cashDenominations = { ...countryProfile.cashDenominations, ...manualOrderSettings.cashDenominations };
	const exchangeRate = extractExchangeRateFromDeliverySettings(branch?.delivery_settings);
	const isV2Order = order.manual_order_mode === 'session' || order.manual_order_mode === 'quick_sale';
	const paymentMethods = normalizeConfiguredPaymentMethods(branch?.payment_methods, { accountingCurrency: currency });
	const dueMinor = resolveOrderDueMinor(order);
	const total = !confirmOnly
		? minorToMajor(dueMinor, currency, fractionDigits)
		: (Number(order.total) || 0);

	const formatAccounting = (minor) => formatMinor(minor, { currency, locale, fractionDigits });
	const formatIn = (minor, code = currency) => {
		const target = String(code || currency).toUpperCase();
		return formatMinor(minor, { currency: target, locale, fractionDigits: target === currency ? fractionDigits : undefined });
	};
	const toMinor = (value) => {
		const amount = Number(value);
		if (!Number.isFinite(amount) || amount <= 0) return 0;
		try {
			return majorToMinor(amount, currency, fractionDigits);
		} catch {
			return 0;
		}
	};
	const fromMinor = (minor) => minorToMajor(minor, currency, fractionDigits);

	const manualOrderShape = {
		...form,
		total,
		order_type: order.order_type,
		delivery_fee: order.delivery_fee,
		items: order.items,
		coupon_code: order.coupon_code,
		v2Enabled: isV2Order,
		currency,
		locale,
		fractionDigits,
		quote: isV2Order ? { totalMinor: dueMinor, currency, fractionDigits, quoteHash: 'settlement' } : null,
		paymentMethods,
		payment_lines: form.payment_lines,
		cashDenominations,
	};

	const pl = usePaymentLines({
		manualOrder: manualOrderShape,
		updatePaymentLines: (lines) => setForm((f) => ({ ...f, payment_lines: lines })),
		branchDeliveryCfg: { exchangeRate: exchangeRate ?? '' },
	});

	const legacyMixed = form.payment_mode === 'mixed';
	const requiresEvidence = isV2Order
		? (form.payment_lines || []).some((line) => line?.evidencePolicy === 'required')
		: !legacyMixed && form.payment_type === 'online';
	const showEvidence = !confirmOnly && (isV2Order
		? (form.payment_lines || []).some((line) => line?.evidencePolicy && line.evidencePolicy !== 'none')
		: requiresEvidence);

	const isFormValid = () => {
		if (confirmOnly) return true;
		if (dueMinor <= 0) return false;
		if (requiresEvidence && !receiptFile) return false;
		if (isV2Order) return pl.validation.valid;

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
			showNotify?.(
				requiresEvidence && !receiptFile
					? 'Adjuntá el comprobante antes de confirmar el pago.'
					: 'Revisa el método de pago',
				'warning',
			);
			return;
		}

		setLoading(true);

		try {
			const paymentPatch = confirmOnly
				? null
				: {
					...form,
					receiptFile: receiptFile || null,
					branchPaymentMethods: branch?.payment_methods || null,
					payment_breakdown: buildPaymentBreakdownForOrder({
						payment_mode: form.payment_mode,
						payment_type: form.payment_type,
						cash_amount: form.cash_amount,
						card_amount: form.card_amount,
						total,
					}),
				};

			const ok = await onConfirm(order, paymentPatch);

			if (ok) {
				resetReceipt();
				onClose();
			}
		} finally {
			setLoading(false);
		}
	};

	/* —— Ticket —— */
	const items = order.items || [];
	const itemCount = items.reduce((acc, item) => acc + (Number(item.quantity) || 1), 0);
	const scale = 10 ** fractionDigits;
	const linesSubtotal = Math.round(items.reduce((sum, item) => sum + getOrderItemLineTotal(item), 0) * scale) / scale;
	const subtotal = Number(order.subtotal) > 0 ? Number(order.subtotal) : linesSubtotal;
	const deliveryFee = isOrderDelivery(order) ? Number(order.delivery_fee) || 0 : 0;
	const orderTotalText = formatOrderAmount({
		amountUsd: Number(order.total) || 0,
		order,
		paymentMethod: order.payment_method_specific,
	});
	const orderTotalMinor = parseMinorField(order.total_minor) ?? toMinor(order.total);
	const partiallyPaid = !confirmOnly && dueMinor > 0 && orderTotalMinor > dueMinor;

	/* —— Cabecera —— */
	const KindIcon = KIND_ICON[kind] ?? PickupBagIcon;
	const kindLabel = getOrderFulfillmentDisplayLabel(order);
	const sequence = order.shift_sequence ?? order.id;
	const clientName = order.display_name || order.client_name || 'Cliente';
	const paymentLabel = getOrderPaymentDisplayLabel(order);
	const paymentDeferred = isOrderPaymentDeferred(order);
	const paymentSettled = isOrderPaymentSettled(order);
	const preferenceHint = paymentDeferred ? getOrderPaymentPreferenceHint(order) : null;
	const couponCode = resolveOrderCouponCode(order);
	const intentLabel = isPayIntent ? 'Cobrar' : confirmOnly ? 'Entregar' : 'Cerrar';

	/* —— Estado del cobro —— */
	const heroMinor = confirmOnly ? orderTotalMinor : dueMinor;
	const hasEvidence = Boolean(receiptFile);
	let summary;
	if (confirmOnly) {
		summary = {
			tone: 'ready',
			message: 'Pago registrado',
			detail: paymentLabel,
			hint: null,
			segments: [{ key: 'paid', minor: Math.max(1, heroMinor), label: paymentLabel }],
		};
	} else if (dueMinor <= 0) {
		summary = {
			tone: 'idle',
			message: 'Sin saldo por cobrar',
			hint: 'Este pedido no tiene saldo pendiente.',
			segments: [],
		};
	} else if (isV2Order) {
		summary = summarizeLinesPayment({ pl, dueMinor, formatAccounting, formatIn, requiresEvidence, hasEvidence });
	} else {
		summary = summarizeLegacyPayment({ form, dueMinor, toMinor, formatAccounting, requiresEvidence, hasEvidence });
	}

	const canConfirm = isFormValid();
	const confirmLabel = isPayIntent
		? 'Registrar pago'
		: confirmOnly
			? 'Confirmar entrega'
			: (CLOSE_LABEL_BY_KIND[kind] ?? 'Confirmar y cerrar');
	const hint = !canConfirm && !loading ? summary.hint : null;
	const dueLabel = confirmOnly ? 'Total pagado' : partiallyPaid ? 'Saldo por cobrar' : 'Total a cobrar';

	const portalClassName = [
		'table-session-modal-portal',
		'tenant-theme-vars',
		isPayIntent ? 'table-session-modal-portal--pay-intent' : '',
		stackAboveManualOrder ? 'table-session-modal-portal--above-manual-order' : '',
	].filter(Boolean).join(' ');

	return (
		<div className={portalClassName}>
			<div
				className="table-session-modal-overlay cobro-overlay"
				role="presentation"
				onPointerDown={(event) => {
					overlayPressRef.current = event.target === event.currentTarget;
				}}
				onClick={(event) => {
					/* Solo si el toque empezó fuera: arrastrar desde un campo y
					   soltar sobre el fondo no debe tirar el cobro a medias. */
					if (overlayPressRef.current && event.target === event.currentTarget) onClose();
				}}
			>
				<div
					ref={dialogRef}
					className={`cobro cobro--${kind}`}
					role="dialog"
					aria-modal="true"
					aria-labelledby={titleId}
					tabIndex={-1}
				>
					<header className="cobro__head">
						<span className="cobro__kind" aria-hidden>
							<KindIcon size={20} strokeWidth={2} />
						</span>
						<div className="cobro__head-text">
							<div className="cobro__title-row">
								<h2 id={titleId} className="cobro__title">
									<span className="sr-only">{intentLabel}</span>
									{' '}{kindLabel} #{sequence}
								</h2>
								<span
									className={`cobro__chip${
										paymentDeferred ? ' cobro__chip--pending' : paymentSettled ? ' cobro__chip--paid' : ''
									}`}
								>
									{paymentLabel}
								</span>
								{couponCode ? <span className="cobro__chip cobro__chip--code">{couponCode}</span> : null}
							</div>
							<p className="cobro__meta">
								<span>Pedido <strong className="cobro__ref">#{formatOrderRef(order.id)}</strong></span>
								<span className="cobro__meta-sep" aria-hidden>·</span>
								<span className="cobro__client">{clientName}</span>
								{itemCount > 0 ? (
									<>
										<span className="cobro__meta-sep" aria-hidden>·</span>
										<span>{itemCount} {itemCount === 1 ? 'ítem' : 'ítems'}</span>
									</>
								) : null}
								{preferenceHint ? (
									<>
										<span className="cobro__meta-sep" aria-hidden>·</span>
										<span>{preferenceHint}</span>
									</>
								) : null}
							</p>
						</div>
						<button type="button" className="cobro__close" onClick={onClose} aria-label="Cerrar">
							<X size={20} strokeWidth={2} aria-hidden />
						</button>
					</header>

					<div className="cobro__body">
						<CobroDue
							label={dueLabel}
							amountText={formatAccounting(heroMinor)}
							currency={currency}
							dueMinor={heroMinor}
							summary={summary}
							secondary={confirmOnly ? null : (
								<DualCurrencyAmount
									amount={minorToMajor(heroMinor, currency, fractionDigits)}
									currency={currency}
									locale={locale}
									exchangeRate={exchangeRate}
									layout="inline"
									hidePrimary
									size="md"
									align="end"
								/>
							)}
						/>

						<CobroTicket
							order={order}
							itemCount={itemCount}
							subtotal={subtotal}
							taxTotal={Number(order.tax_total) || 0}
							deliveryFee={deliveryFee}
							discountTotal={Number(order.discount_total) || 0}
							paidText={partiallyPaid ? formatAccounting(orderTotalMinor - dueMinor) : null}
							totalText={orderTotalText}
							formatMoney={formatMoney}
						/>

						<section className="cobro-pay" aria-labelledby={confirmOnly ? undefined : methodsTitleId}>
							{confirmOnly ? (
								<p className="cobro-settled">
									{SETTLED_NOTE_BY_KIND[kind] ?? 'Confirma la entrega para cerrar el pedido.'}
								</p>
							) : (
								<>
									<div className="cobro-pay__head">
										<h3 id={methodsTitleId} className="cobro-pay__title">Método de pago</h3>
										{isV2Order && pl.methods.length > 1 ? (
											<span className="cobro-pay__hint">Toca varios para dividir el pago</span>
										) : null}
									</div>
									{isV2Order ? (
										<CobroLinesPanel
											pl={pl}
											cashDenominations={cashDenominations}
											formatIn={formatIn}
											formatAccounting={formatAccounting}
										/>
									) : (
										<CobroLegacyPanel
											form={form}
											dueMinor={dueMinor}
											currency={currency}
											fractionDigits={fractionDigits}
											locale={locale}
											cashDenominations={cashDenominations}
											toMinor={toMinor}
											fromMinor={fromMinor}
											formatAccounting={formatAccounting}
											formatIn={formatIn}
											onSelectType={(type) => setForm((f) => ({ ...f, payment_mode: 'single', payment_type: type }))}
											onToggleMixed={() => setForm((f) => ({ ...f, payment_mode: f.payment_mode === 'mixed' ? 'single' : 'mixed' }))}
											onCashAmount={(value) => setForm((f) => ({ ...f, cash_amount: value }))}
											onCardAmount={(value) => setForm((f) => ({ ...f, card_amount: value }))}
											onTendered={(value) => setForm((f) => ({ ...f, cash_tendered: value }))}
										/>
									)}
									{showEvidence ? (
										<CobroEvidence
											required={requiresEvidence}
											receiptFile={receiptFile}
											receiptPreview={receiptPreview}
											onFileChange={handleFileChange}
											onRemove={removeReceipt}
										/>
									) : null}
								</>
							)}
						</section>

						<footer className="cobro__foot">
							{hint ? <p className="cobro__hint">{hint}</p> : null}
							<button
								type="button"
								className="cobro__cta"
								onClick={handleConfirm}
								disabled={loading || !canConfirm}
								aria-busy={loading || undefined}
							>
								{loading ? (
									<span className="cobro__cta-busy">
										<Loader2 size={18} className="animate-spin" aria-hidden />
										{isPayIntent ? 'Registrando…' : 'Cerrando…'}
									</span>
								) : (
									<>
										<span className="cobro__cta-label">{confirmLabel}</span>
										{!confirmOnly && dueMinor > 0 ? (
											<span className="cobro__cta-amount">{formatAccounting(dueMinor)}</span>
										) : null}
									</>
								)}
							</button>
						</footer>
					</div>
				</div>
			</div>
		</div>
	);
}
