import React, { useRef, useCallback, useEffect } from 'react';
import { Tag, Store, CreditCard, Receipt as ReceiptIcon, Upload, CheckCircle2, FileText, Coins, Split } from 'lucide-react';
import {
    computeChangeDue,
    getCashDueAmount,
    validateCheckoutPayment,
} from '@/shared/utils/orderUtils';
import AdminIconSlot from '../AdminIconSlot';
import { cn } from '@/lib/utils';
import { ADMIN_MOBILE_MQ } from '../../constants/responsive';
import { Button } from "@/components/ui/button";
import { primaryActionButtonClass, selectedToggleActiveClass, spacing, textScale, tileRadiusClass, activeStateClass } from './manualOrderStyles';
import SectionHeader from './SectionHeader';
import { parseMoneyInput, majorToMinor, minorToMajor, formatMinor } from '@/lib/money/minor-units';
import { settlementToAccountingMinor, validatePaymentLines } from '../../domain/payment-methods';

const sectionCardClass = 'manual-order-step-card rounded-[16px] border border-gc-border bg-gc-page p-4';
const inputClass =
    'w-full rounded-[12px] border border-gc-border bg-gc-card px-3.5 py-3 text-sm text-gc-text placeholder:text-gc-text-muted focus:border-gc-accent focus:outline-none focus:ring-2 focus:ring-gc-accent/15';
const confirmBtnClass = cn(
    primaryActionButtonClass,
    'manual-order-checkout-actions__confirm w-full flex-1',
);
const backBtnClass =
    'manual-order-checkout-actions__back flex min-h-[44px] min-w-[96px] max-w-[130px] flex-none items-center justify-center rounded-[12px] border border-gc-border bg-gc-muted px-3 py-3 text-[13px] font-extrabold uppercase tracking-wide text-gc-text transition-colors';

function PaymentLinesEditor({ manualOrder, updatePaymentLines, branchDeliveryCfg, paymentOptional = false }) {
    const methods = manualOrder.paymentMethods ?? [];
    const lines = manualOrder.payment_lines ?? [];
    const quote = manualOrder.quote;
    const currency = manualOrder.currency;
    const fractionDigits = manualOrder.fractionDigits;
    const exchangeRate = String(branchDeliveryCfg?.exchangeRate ?? '');
    const validation = quote ? validatePaymentLines(lines, quote, methods) : { valid: false, paidMinor: 0, errors: [] };
    const remainingMinor = quote ? Number(quote.totalMinor) - Number(validation.paidMinor || 0) : 0;

    const toggleMethod = (method) => {
        const existing = lines.find((line) => line.methodId === method.id);
        if (existing) {
            updatePaymentLines(lines.filter((line) => line.id !== existing.id));
            return;
        }
        const sameCurrency = method.currency === currency;
		const allocatedMinor = sameCurrency ? Math.max(0, remainingMinor) : 0;
		updatePaymentLines([...lines, {
			id: crypto.randomUUID(), methodId: method.id, rail: method.rail,
			amountMinor: allocatedMinor,
			currency,
			evidencePolicy: method.evidencePolicy,
			settlementTrigger: method.settlementTrigger,
			...(method.rail === 'cash' && sameCurrency ? { tenderedCurrency: currency } : {}),
            ...(sameCurrency ? {} : { settlementAmountMinor: 0, settlementCurrency: method.currency, exchangeRate }),
        }]);
    };

    const updateLine = (id, patch) => updatePaymentLines(lines.map((line) => line.id === id ? { ...line, ...patch } : line));
    const updateAccountingAmount = (line, raw) => {
		const parsed = parseMoneyInput(raw, { currency, fractionDigits, locale: manualOrder.locale });
		if (parsed.valid) updateLine(line.id, {
			amountMinor: parsed.minor,
			...(line.rail === 'cash' && Number(line.tenderedAmountMinor || 0) < parsed.minor ? { tenderedAmountMinor: parsed.minor } : {}),
		});
    };
    const updateSettlementAmount = (line, method, raw) => {
		const parsed = parseMoneyInput(raw, { currency: method.currency, locale: manualOrder.locale });
        if (!parsed.valid) return;
        try {
			updateLine(line.id, {
				settlementAmountMinor: parsed.minor,
                settlementCurrency: method.currency,
                exchangeRate,
				amountMinor: settlementToAccountingMinor(parsed.minor, method.currency, currency, exchangeRate),
				...(line.rail === 'cash' && Number(line.tenderedAmountMinor || 0) < parsed.minor ? { tenderedAmountMinor: parsed.minor, tenderedCurrency: method.currency } : {}),
            });
        } catch {
            updateLine(line.id, { settlementAmountMinor: parsed.minor, amountMinor: 0, exchangeRate: '' });
		}
	};
	const updateTenderedAmount = (line, method, raw) => {
		const tenderCurrency = method.currency;
		const parsed = parseMoneyInput(raw, { currency: tenderCurrency, locale: manualOrder.locale });
		if (parsed.valid) updateLine(line.id, { tenderedAmountMinor: parsed.minor, tenderedCurrency: tenderCurrency });
	};

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {methods.map((method) => {
                    const active = lines.some((line) => line.methodId === method.id);
                    const conversionMissing = method.currency !== currency && !exchangeRate;
                    return (
                        <Button variant={active ? 'default' : 'outline'} type="button" key={method.id}
                            className="min-h-[44px] justify-between px-3"
                            onClick={() => toggleMethod(method)} disabled={conversionMissing || !quote}
                            title={conversionMissing ? `Configura la tasa ${method.currency}/${currency}` : undefined}
                            aria-pressed={active}
                        >
                            <span>{method.label}</span>
                            <small>{method.currency}{method.evidencePolicy === 'required' ? ' · comprobante' : ''}</small>
                        </Button>
                    );
                })}
            </div>
            {lines.map((line) => {
                const method = methods.find((candidate) => candidate.id === line.methodId);
                if (!method) return null;
                const foreign = method.currency !== currency;
                return (
					<div key={line.id} className="block rounded-[12px] border border-gc-border bg-gc-card p-3 text-sm">
                        <span className="mb-2 flex justify-between font-semibold"><span>{method.label}</span><span>{formatMinor(line.amountMinor || 0, { currency, locale: manualOrder.locale, fractionDigits })}</span></span>
                        <input className={inputClass} inputMode="decimal" min="0" type="text"
                            aria-label={`Monto ${method.label}`}
                            value={foreign ? minorToMajor(line.settlementAmountMinor || 0, method.currency) : minorToMajor(line.amountMinor || 0, currency, fractionDigits)}
                            onChange={(event) => foreign ? updateSettlementAmount(line, method, event.target.value) : updateAccountingAmount(line, event.target.value)}
                        />
						{method.rail === 'cash' ? (
							<label className="mt-2 block text-xs text-gc-text-muted">
								<span>Recibido en {method.currency}</span>
								<input className={inputClass} inputMode="decimal" type="text" aria-label={`Monto recibido ${method.label}`}
									value={line.tenderedAmountMinor == null ? '' : minorToMajor(line.tenderedAmountMinor, method.currency)}
									placeholder="Confirma el monto recibido"
									onChange={(event) => updateTenderedAmount(line, method, event.target.value)} />
							</label>
						) : null}
						{method.rail === 'cash' && Array.isArray(manualOrder.cashDenominations?.[foreign ? method.currency : currency]) ? (
							<div className="mt-2 flex flex-wrap gap-2">
								{manualOrder.cashDenominations[foreign ? method.currency : currency].map((amount) => (
									<Button key={amount} variant="outline" type="button" className="min-h-[44px] rounded-full"
										onClick={() => updateTenderedAmount(line, method, String(amount))}>
										{formatMinor(majorToMinor(amount, foreign ? method.currency : currency, foreign ? undefined : fractionDigits), { currency: foreign ? method.currency : currency, locale: manualOrder.locale, fractionDigits: foreign ? undefined : fractionDigits })}
									</Button>
				))}
							</div>
						) : null}
						{method.rail === 'cash' && Number(line.tenderedAmountMinor || 0) > Number(foreign ? line.settlementAmountMinor : line.amountMinor) ? (
							<span className="mt-2 block text-sm font-semibold text-gc-success">Vuelto: {formatMinor(Number(line.tenderedAmountMinor) - Number(foreign ? line.settlementAmountMinor : line.amountMinor), { currency: method.currency, locale: manualOrder.locale })}</span>
						) : null}
                        {foreign ? <span className="mt-1 block text-xs text-gc-text-muted">Tasa: {exchangeRate || 'no configurada'} {method.currency} por {currency}</span> : null}
					</div>
                );
            })}
            {quote ? (
                <p role="status" aria-live="polite" className={cn(
					'text-sm font-semibold',
					paymentOptional && lines.length === 0
						? 'text-gc-text-muted'
						: validation.valid ? 'text-gc-success' : 'text-gc-danger',
				)}>
                    {paymentOptional && lines.length === 0
						? 'Sin método seleccionado: el pedido quedará pendiente.'
						: validation.valid
							? 'El pago cuadra exactamente.'
							: remainingMinor > 0
								? `Falta ${formatMinor(remainingMinor, { currency, locale: manualOrder.locale, fractionDigits })}`
								: `Sobra ${formatMinor(Math.abs(remainingMinor), { currency, locale: manualOrder.locale, fractionDigits })}`}
                </p>
            ) : <p role="status" className="text-sm text-gc-text-muted">Esperando cotización válida…</p>}
        </div>
    );
}

/**
 * Checkout del paso Pago: método de pago, cupón, desglose y confirmación.
 */
const PaymentDetails = ({
    manualOrder,
    branch,
    branchDeliveryCfg = null,
    updateCouponCode,
    couponPreview,
    updatePaymentType,
    updatePaymentMode,
    updateCashAmount,
    updateCardAmount,
    updateCashTendered,
    updatePaymentLines,
	acknowledgeQuoteRevision,
    receiptFile,
    receiptPreview,
    handleFileChange,
    removeReceipt,
    submitOrder,
    loading,
    isFormValid,
    goPrevStep,
    confirmLabel = 'CONFIRMAR PEDIDO',
    onCancelOrder = null,
    isEditMode = false,
    hideCheckoutActions = false,
    hideCouponSection = false,
    hideTotalBreakdown = false,
	hideEvidenceUpload = false,
	paymentOptional = false,
    embedded = false,
    variant = 'default',
}) => {
    const isReceipt = variant === 'receipt';
	const accountingCurrency = manualOrder.currency || 'CLP';
	const accountingDigits = manualOrder.fractionDigits;
	const formatAccountingMoney = useCallback((amount) => formatMinor(
		majorToMinor(amount, accountingCurrency, accountingDigits),
		{ currency: accountingCurrency, locale: manualOrder.locale, fractionDigits: accountingDigits },
	), [accountingCurrency, accountingDigits, manualOrder.locale]);
    const deliveryFeeAmt = manualOrder.order_type === 'delivery' ? (Number(manualOrder.delivery_fee) || 0) : 0;
    const grossItems = manualOrder.total;
    const couponDiscountApplied =
        couponPreview?.variant === 'success' && Number(couponPreview.discount) > 0
            ? Math.min(grossItems, Number(couponPreview.discount))
            : 0;
	const totalToPay = manualOrder.v2Enabled && manualOrder.quote
        ? manualOrder.checkout_total
		: minorToMajor(
			Math.max(0, majorToMinor(grossItems, accountingCurrency, accountingDigits) - majorToMinor(couponDiscountApplied, accountingCurrency, accountingDigits))
				+ majorToMinor(deliveryFeeAmt, accountingCurrency, accountingDigits),
			accountingCurrency,
			accountingDigits,
		);
	const billShortcuts = Array.isArray(manualOrder.cashDenominations?.[accountingCurrency])
		? manualOrder.cashDenominations[accountingCurrency]
		: [];

    const isMixed = manualOrder.payment_mode === 'mixed';
    const showCashTender =
        isMixed
            ? (Number(manualOrder.cash_amount) || 0) > 0
            : manualOrder.payment_type === 'tienda';

    const cashDue = getCashDueAmount({
        payment_mode: manualOrder.payment_mode,
        payment_type: manualOrder.payment_type,
        cash_amount: manualOrder.cash_amount,
        totalToPay,
    });

    const changeDue = showCashTender
        ? computeChangeDue(manualOrder.cash_tendered, cashDue)
        : 0;

    const paymentValidation = validateCheckoutPayment({
        payment_mode: manualOrder.payment_mode,
        payment_type: manualOrder.payment_type,
        cash_amount: manualOrder.cash_amount,
        card_amount: manualOrder.card_amount,
        cash_tendered: manualOrder.cash_tendered,
        totalToPay,
    });

    const mixedSum = (Number(manualOrder.cash_amount) || 0) + (Number(manualOrder.card_amount) || 0);
    const mixedDiff = totalToPay - mixedSum;

    const handleBillShortcut = (amount) => {
        updateCashTendered(amount);
    };

    const paymentMethodsDisabled = isMixed;

    const paymentMethodRef = useRef(null);
    const cashTenderRef = useRef(null);
    const mixedSplitRef = useRef(null);
    const postPaymentRef = useRef(null);
    const pendingScrollTargetRef = useRef(null);

    const scrollToPaymentDetail = useCallback((targetRef) => {
        const el = targetRef?.current;
        if (!el) return;
        const isCompact = typeof window !== 'undefined' && window.matchMedia(ADMIN_MOBILE_MQ).matches;
        el.scrollIntoView({
            behavior: 'smooth',
            block: isCompact ? 'nearest' : 'start',
        });
    }, []);

    useEffect(() => {
        if (!pendingScrollTargetRef.current) return;
        const target = pendingScrollTargetRef.current;
        pendingScrollTargetRef.current = null;
        scrollToPaymentDetail(target);
    }, [
        manualOrder.payment_type,
        manualOrder.payment_mode,
        showCashTender,
        hideCouponSection,
        scrollToPaymentDetail,
    ]);

    const handlePaymentTypeSelect = (type) => {
        updatePaymentType(type);
        pendingScrollTargetRef.current = type === 'tienda' ? cashTenderRef : postPaymentRef;
    };

    const handlePaymentModeToggle = () => {
        const nextMixed = !isMixed;
        updatePaymentMode(nextMixed ? 'mixed' : 'single');
        pendingScrollTargetRef.current = nextMixed ? mixedSplitRef : paymentMethodRef;
    };

    const paymentBtnClass = (active) => cn(
        `flex min-h-[78px] flex-col items-center justify-center gap-2 ${tileRadiusClass} p-3 ${textScale.body} font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45`,
        active
            ? activeStateClass
            : 'bg-gc-muted text-gc-text-muted hover:bg-gc-border/60',
    );

    return (
        <div className={cn(
            `flex min-h-0 flex-col ${spacing.normal}`,
            !embedded && 'h-full',
            isReceipt && 'manual-order-checkout--receipt',
        )}>
			{manualOrder.v2Enabled && manualOrder.quoteRevisionPending ? (
				<div className="rounded-[12px] border border-gc-warning/40 bg-gc-warning/10 p-3 text-sm text-gc-text" role="alert">
					<p className="font-semibold">La cotización cambió. Nuevo total: {formatMinor(Number(manualOrder.quote?.totalMinor || 0), { currency: manualOrder.currency, fractionDigits: manualOrder.fractionDigits })}</p>
					<p className="mt-1 text-gc-text-muted">Revisa también el desglose de pago antes de confirmar.</p>
					<Button variant="outline" type="button" className="mt-2 min-h-[44px]" onClick={acknowledgeQuoteRevision}>Entendido, revisar total</Button>
				</div>
			) : null}
            <div ref={paymentMethodRef} className={cn(sectionCardClass, 'scroll-mt-3')}>
                <SectionHeader icon={CreditCard} tone="accent">
                    {isReceipt ? 'Seleccionar método de pago' : 'Método de pago'}
                </SectionHeader>
                {manualOrder.v2Enabled ? (
	                    <PaymentLinesEditor
							manualOrder={manualOrder}
							updatePaymentLines={updatePaymentLines}
							branchDeliveryCfg={branchDeliveryCfg}
							paymentOptional={paymentOptional}
						/>
                ) : <>
				<div className={`grid grid-cols-1 ${spacing.compact} min-[430px]:grid-cols-3`}>
                    <Button variant="default"
                        type="button"
                        className={paymentBtnClass(!isMixed && manualOrder.payment_type === 'tienda')}
                        onClick={() => handlePaymentTypeSelect('tienda')}
                        disabled={paymentMethodsDisabled}
                    >
                        <Store size={24} />
						Efectivo {accountingCurrency}
                    </Button>
                    <Button variant="default"
                        type="button"
                        className={paymentBtnClass(!isMixed && manualOrder.payment_type === 'tarjeta')}
                        onClick={() => handlePaymentTypeSelect('tarjeta')}
                        disabled={paymentMethodsDisabled}
                    >
                        <CreditCard size={24} />
						Tarjeta {accountingCurrency}
                    </Button>
                    <Button variant="default"
                        type="button"
                        className={paymentBtnClass(!isMixed && manualOrder.payment_type === 'online')}
                        onClick={() => handlePaymentTypeSelect('online')}
                        disabled={paymentMethodsDisabled}
                    >
                        <ReceiptIcon size={24} />
						{isReceipt ? 'Transf.' : 'Transferencia'} {accountingCurrency}
                    </Button>
                </div>
                <Button variant="default"
                    type="button"
                    className={cn(
                        `mt-2.5 inline-flex min-h-[42px] w-full items-center justify-center ${spacing.compact} rounded-[12px] border border-dashed px-3 py-2 ${textScale.micro} font-semibold transition-colors`,
                        isMixed
                            ? 'border-gc-accent bg-gc-accent/10 text-gc-accent'
                            : 'border-gc-border bg-transparent text-gc-text-muted hover:border-gc-accent/30 hover:text-gc-accent',
                    )}
                    onClick={handlePaymentModeToggle}
                >
                    <Split size={16} aria-hidden />
                    {isReceipt ? 'Pago mixto' : 'Pago mixto (efectivo + tarjeta)'}
                </Button>
				{String(manualOrder.locale ?? '').toLowerCase().startsWith('es-ve') ? (
					<p className="mt-2 text-xs leading-relaxed text-gc-text-muted">
						Moneda contable: <strong>{accountingCurrency}</strong>. Los pagos en VES y su tasa aparecen al activar Pedidos V2 para la sucursal.
					</p>
				) : null}
	                </>}
					{paymentOptional && !manualOrder.v2Enabled
						&& !['tienda', 'tarjeta', 'online'].includes(manualOrder.payment_type)
						&& manualOrder.payment_mode !== 'mixed' ? (
						<p className="mt-2 text-sm text-gc-text-muted" role="status">
							Sin método seleccionado: el pedido quedará pendiente.
						</p>
					) : null}
	            </div>

				{!hideEvidenceUpload && ((manualOrder.v2Enabled && manualOrder.payment_lines?.some((line) => line.evidencePolicy !== 'none')) || (manualOrder.payment_type === 'online' && !isMixed)) && (
	            <div className={cn(sectionCardClass, 'animate-fade-in')}>
					<SectionHeader icon={Upload} tone="accent">
						{manualOrder.payment_lines?.some((line) => line.evidencePolicy === 'required') ? 'Comprobante requerido' : 'Comprobante opcional'}
					</SectionHeader>
	                    <p className={`mb-2 ${textScale.micro} leading-relaxed text-gc-text-muted`}>
							{manualOrder.payment_lines?.some((line) => line.evidencePolicy === 'required')
								? 'Puedes crear el pedido ahora; quedará marcado como comprobante pendiente hasta que la imagen se persista.'
								: 'Puedes subir el comprobante ahora o después desde la tarjeta del pedido.'}
	                    </p>
	                    <label
	                        htmlFor="receipt-upload"
	                        className={`flex cursor-pointer flex-col items-center justify-center ${spacing.compact} rounded-[4px] border border-dashed border-gc-border bg-gc-muted/50 p-4 transition-colors hover:border-gc-accent/30 hover:bg-gc-muted`}
	                    >
	                        <AdminIconSlot Icon={FileText} slotSize="md" tone="accent" />
	                        <span className={`${textScale.body} font-medium text-gc-text-muted`}>
	                            {receiptFile ? receiptFile.name : 'Click para subir imagen'}
	                        </span>
	                    </label>
	                    <input
	                        id="receipt-upload"
	                        type="file"
	                        accept="image/*"
	                        onChange={handleFileChange}
	                        className="hidden"
	                    />
	                    {receiptPreview && (
	                        <div className="relative mt-2.5 overflow-hidden rounded-[4px] border border-gc-border">
	                            <img src={receiptPreview} alt="Preview comprobante" className="block max-h-[150px] w-full object-cover" />
	                            <Button variant="destructive"
	                                type="button"
	                                className={`absolute right-2 top-2 rounded-[4px] bg-gc-danger/90 px-2 py-1 ${textScale.micro} font-bold text-white`}
	                                onClick={(e) => {
	                                    e.preventDefault();
	                                    removeReceipt();
	                                }}
	                            >
	                                QUITAR
	                            </Button>
	                        </div>
	                    )}
	                </div>
	            )}

            {!manualOrder.v2Enabled && isMixed ? (
            <div ref={mixedSplitRef} className={cn(sectionCardClass, 'animate-fade-in scroll-mt-3')}>
                <SectionHeader icon={Split} tone="accent">Desglose del pago</SectionHeader>
                    <div className={`grid grid-cols-2 ${spacing.normal}`}>
                        <label className={`flex flex-col ${spacing.compact} ${textScale.micro} font-semibold text-gc-text-muted`}>
                            <span>Efectivo</span>
                            <input
                                type="number"
                                inputMode="numeric"
                                min="0"
                                step="1"
                                className={inputClass}
                                value={manualOrder.cash_amount || ''}
                                onChange={(e) => updateCashAmount(e.target.value)}
                                placeholder="0"
                            />
                        </label>
                        <label className={`flex flex-col ${spacing.compact} ${textScale.micro} font-semibold text-gc-text-muted`}>
                            <span>Tarjeta</span>
                            <input
                                type="number"
                                inputMode="numeric"
                                min="0"
                                step="1"
                                className={inputClass}
                                value={manualOrder.card_amount || ''}
                                onChange={(e) => updateCardAmount(e.target.value)}
                                placeholder="0"
                            />
                        </label>
                    </div>
                    {totalToPay > 0 ? (
                        <p
                            className={cn(
                                'mt-2 text-[11px] font-semibold',
                                Math.abs(mixedDiff) <= 1
                                    ? 'text-gc-success'
                                    : mixedDiff > 0
                                      ? 'text-gc-secondary'
                                      : 'text-gc-danger',
                            )}
                            role="status"
                        >
                            {Math.abs(mixedDiff) <= 1
                                ? 'Cuadra con el total a pagar'
                                : mixedDiff > 0
								  ? `Falta ${formatAccountingMoney(mixedDiff)}`
								  : `Sobra ${formatAccountingMoney(Math.abs(mixedDiff))}`}
                        </p>
                    ) : null}
                </div>
            ) : null}

            {!manualOrder.v2Enabled && showCashTender ? (
            <div ref={cashTenderRef} className={cn(sectionCardClass, 'animate-fade-in scroll-mt-3')}>
                <SectionHeader icon={Coins} tone="accent">Efectivo recibido</SectionHeader>
                <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        step="1"
                        className={inputClass}
                        value={manualOrder.cash_tendered === '' ? '' : manualOrder.cash_tendered}
                        onChange={(e) => updateCashTendered(e.target.value)}
						placeholder={cashDue > 0 ? formatAccountingMoney(cashDue) : '0'}
                    />
                    <div className={`mt-2 flex flex-wrap ${spacing.compact}`}>
						{billShortcuts.map((bill) => (
                            <Button variant="outline"
                                key={bill}
                                type="button"
                                className={`rounded-full border border-gc-border bg-gc-card px-2.5 py-1 ${textScale.micro} font-bold text-gc-text transition-colors hover:border-gc-accent hover:text-gc-accent`}
                                onClick={() => handleBillShortcut(bill)}
                            >
								{formatAccountingMoney(bill)}
                            </Button>
                        ))}
                    </div>
                    {cashDue > 0 && manualOrder.cash_tendered !== '' ? (
                        <div
                            className={cn(
                                'mt-2.5 flex items-center justify-between rounded-[4px] border px-3 py-2.5',
                                paymentValidation.valid
                                    ? 'border-gc-success/45 bg-gc-success/10'
                                    : 'border-gc-danger/45 bg-gc-danger/10',
                            )}
                            role="status"
                        >
                            <span className={`${textScale.micro} font-semibold text-gc-text-muted`}>Cambio a devolver</span>
                            <span className={`${textScale.emphasis} font-extrabold text-gc-text`}>
                                {paymentValidation.reason === 'insufficient_tender'
									? `Faltan ${formatAccountingMoney(cashDue - (Number(manualOrder.cash_tendered) || 0))}`
									: formatAccountingMoney(changeDue)}
                            </span>
                        </div>
                    ) : null}
                </div>
            ) : null}

            {!hideCouponSection ? (
            <div ref={postPaymentRef} className={cn(sectionCardClass, 'scroll-mt-3')}>
                <SectionHeader icon={Tag} tone="accent">Código de descuento (opc.)</SectionHeader>
                    <input
                        type="text"
                        className={inputClass}
                        autoComplete="off"
                        spellCheck={false}
                        value={manualOrder.coupon_code ?? ''}
                        onChange={(e) => updateCouponCode(e.target.value)}
                        placeholder="Ej. PROMO15"
                    />
                    {couponPreview?.loading && (
                        <span className={`${textScale.micro} font-semibold text-gc-text-muted`}>Validando código…</span>
                    )}
                    {couponPreview?.message && (
                        <span
                            className={cn(
                                `${textScale.micro} font-semibold`,
                                couponPreview.variant === 'error' && 'text-gc-danger',
                                couponPreview.variant === 'success' && 'text-gc-success',
                                (!couponPreview.variant || couponPreview.variant === 'info') && 'text-gc-text-muted',
                            )}
                        >
                            {couponPreview.message}
                        </span>
                    )}
                </div>
            ) : null}

            {!hideTotalBreakdown ? (
            <div
                ref={hideCouponSection ? postPaymentRef : null}
                className={cn(sectionCardClass, hideCouponSection && 'scroll-mt-3')}
            >
                <SectionHeader>Total</SectionHeader>
                <div className="space-y-1.5">
                    <div className={`flex justify-between ${textScale.micro} text-gc-text-muted`}>
                        <span>Artículos</span>
						<span className="font-semibold text-gc-text">{formatAccountingMoney(grossItems)}</span>
                    </div>
                    {couponDiscountApplied > 0 && (
                        <div className={`flex justify-between ${textScale.micro} text-gc-discount`}>
                            <span>Descuento (cupón)</span>
							<span className="font-semibold">−{formatAccountingMoney(couponDiscountApplied)}</span>
                        </div>
                    )}
                    {deliveryFeeAmt > 0 && (
                        <div className={`flex justify-between ${textScale.micro} text-gc-text-muted`}>
                            <span>Delivery</span>
							<span className="font-semibold text-gc-text">{formatAccountingMoney(deliveryFeeAmt)}</span>
                        </div>
                    )}
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-gc-border pt-3">
                    <span className={`${textScale.micro} font-extrabold uppercase tracking-wide text-gc-text-muted`}>Total a pagar</span>
					<span className={`${textScale.price} font-black text-gc-price`}>{formatAccountingMoney(totalToPay)}</span>
                </div>
            </div>
            ) : hideCouponSection ? (
                <div ref={postPaymentRef} className="h-0 overflow-hidden" aria-hidden />
            ) : null}

            {!isFormValid() && !loading ? (
                <p className="text-center text-[11px] leading-snug text-gc-text-muted" role="status">
                    {isReceipt
                        ? paymentValidation.reason === 'insufficient_tender'
                            ? 'Indica el monto recibido en efectivo (debe cubrir el total).'
                            : paymentValidation.reason === 'split_mismatch'
                              ? 'El desglose mixto debe sumar exactamente el total a pagar.'
                              : 'Seleccioná un método de pago para continuar.'
                        : isEditMode
                          ? 'Revisa los datos del pedido antes de guardar los cambios.'
                          : paymentValidation.reason === 'insufficient_tender'
                            ? 'Indica el monto recibido en efectivo (debe cubrir lo que paga el cliente).'
                            : paymentValidation.reason === 'split_mismatch'
                              ? 'El desglose mixto debe sumar exactamente el total a pagar.'
                              : 'Revisa nombre, RUT, teléfono, productos en el carrito y datos de delivery antes de confirmar.'}
                </p>
            ) : null}

            {!hideCheckoutActions ? (
            <div className="manual-order-checkout-actions mt-auto flex w-full min-w-0 items-stretch gap-2 border-t border-gc-border pt-3">
                {goPrevStep ? (
                    <Button variant="default"
                        type="button"
                        className={backBtnClass}
                        onClick={goPrevStep}
                    >
                        ATRÁS
                    </Button>
                ) : null}
                {onCancelOrder ? (
                    <Button variant="default"
                        type="button"
                        className={cn(
                            backBtnClass,
                            'max-w-[42%] text-[11px] text-gc-danger',
                        )}
                        onClick={onCancelOrder}
                        disabled={loading}
                    >
                        Cancelar pedido
                    </Button>
                ) : null}
                <Button variant="default"
                    type="button"
                    className={confirmBtnClass}
                    onClick={submitOrder}
                    disabled={loading || !isFormValid()}
                >
                    {loading ? (
                        <>
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                            PROCESANDO...
                        </>
                    ) : (
                        <>
                            <CheckCircle2 size={20} />
                            {confirmLabel}
                        </>
                    )}
                </Button>
            </div>
            ) : null}
        </div>
    );
};

export default React.memo(PaymentDetails);
