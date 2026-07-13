import React, { useRef, useCallback, useEffect } from 'react';
import { Tag, Store, CreditCard, Receipt as ReceiptIcon, Upload, CheckCircle2, FileText, Coins, Split } from 'lucide-react';
import { useOrderMoney } from '@/modules/cash/hooks/useOrderMoney';
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

const BILL_SHORTCUTS = [1000, 2000, 5000, 10000, 20000];

function resolveManualCheckoutPaymentMethod(manualOrder) {
    if (manualOrder?.payment_method_specific) return manualOrder.payment_method_specific;
    const pt = manualOrder?.payment_type;
    if (pt === 'tienda') return 'efectivo';
    if (pt === 'tarjeta') return 'tarjeta';
    if (pt === 'online') return 'transferencia_bancaria';
    return pt;
}

const sectionCardClass = 'rounded-[4px] border border-gc-border bg-gc-page p-4';
const inputClass =
    'w-full rounded-[4px] border border-gc-border bg-gc-card px-3.5 py-3 text-sm text-gc-text placeholder:text-gc-text-muted focus:border-gc-accent focus:outline-none focus:ring-2 focus:ring-gc-accent/15';
const confirmBtnClass = cn(
    primaryActionButtonClass,
    'manual-order-checkout-actions__confirm w-full flex-1',
);
const backBtnClass =
    'manual-order-checkout-actions__back flex min-h-[44px] min-w-[96px] max-w-[130px] flex-none items-center justify-center rounded-[4px] border border-gc-border bg-gc-muted px-3 py-3 text-[13px] font-extrabold uppercase tracking-wide text-gc-text transition-colors';

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
    embedded = false,
    variant = 'default',
}) => {
    const isReceipt = variant === 'receipt';
    const orderMoney = useOrderMoney();
    const { formatMoney, formatOrderAmount } = orderMoney;
    const checkoutPaymentMethod = resolveManualCheckoutPaymentMethod(manualOrder);
    const formatCheckoutTotal = (amount) => formatOrderAmount({
        amountUsd: amount,
        paymentMethod: checkoutPaymentMethod,
    });
    const deliveryFeeAmt = manualOrder.order_type === 'delivery' ? (Number(manualOrder.delivery_fee) || 0) : 0;
    const grossItems = manualOrder.total;
    const couponDiscountApplied =
        couponPreview?.variant === 'success' && Number(couponPreview.discount) > 0
            ? Math.min(grossItems, Number(couponPreview.discount))
            : 0;
    const totalToPay = Math.round(
        (Math.max(0, grossItems - couponDiscountApplied) + deliveryFeeAmt) * 100,
    ) / 100;

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
        `flex aspect-square flex-col items-center justify-center gap-2 ${tileRadiusClass} p-3 ${textScale.body} font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45`,
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
            <div ref={paymentMethodRef} className={cn(sectionCardClass, 'scroll-mt-3')}>
                <SectionHeader icon={CreditCard} tone="accent">
                    {isReceipt ? 'Seleccionar método de pago' : 'Método de pago'}
                </SectionHeader>
                <div className={`grid grid-cols-3 ${spacing.compact}`}>
                    <Button variant="default"
                        type="button"
                        className={paymentBtnClass(!isMixed && manualOrder.payment_type === 'tienda')}
                        onClick={() => handlePaymentTypeSelect('tienda')}
                        disabled={paymentMethodsDisabled}
                    >
                        <Store size={24} />
                        {isReceipt ? 'Efectivo' : 'Efectivo'}
                    </Button>
                    <Button variant="default"
                        type="button"
                        className={paymentBtnClass(!isMixed && manualOrder.payment_type === 'tarjeta')}
                        onClick={() => handlePaymentTypeSelect('tarjeta')}
                        disabled={paymentMethodsDisabled}
                    >
                        <CreditCard size={24} />
                        {isReceipt ? 'Tarjeta' : 'Tarjeta'}
                    </Button>
                    <Button variant="default"
                        type="button"
                        className={paymentBtnClass(!isMixed && manualOrder.payment_type === 'online')}
                        onClick={() => handlePaymentTypeSelect('online')}
                        disabled={paymentMethodsDisabled}
                    >
                        <ReceiptIcon size={24} />
                        {isReceipt ? 'Transf.' : 'Transferencia'}
                    </Button>
                </div>
                <Button variant="default"
                    type="button"
                    className={cn(
                        `mt-2.5 inline-flex items-center ${spacing.compact} rounded-[4px] border border-dashed px-3 py-2 ${textScale.micro} font-semibold transition-colors`,
                        isMixed
                            ? 'border-gc-accent bg-gc-accent/10 text-gc-accent'
                            : 'border-gc-border bg-transparent text-gc-text-muted hover:border-gc-accent/30 hover:text-gc-accent',
                    )}
                    onClick={handlePaymentModeToggle}
                >
                    <Split size={16} aria-hidden />
                    {isReceipt ? 'Pago mixto' : 'Pago mixto (efectivo + tarjeta)'}
                </Button>
            </div>

            {isMixed ? (
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
                                  ? `Falta ${formatMoney(mixedDiff)}`
                                  : `Sobra ${formatMoney(Math.abs(mixedDiff))}`}
                        </p>
                    ) : null}
                </div>
            ) : null}

            {showCashTender ? (
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
                        placeholder={cashDue > 0 ? formatMoney(cashDue) : '0'}
                    />
                    <div className={`mt-2 flex flex-wrap ${spacing.compact}`}>
                        {BILL_SHORTCUTS.map((bill) => (
                            <Button variant="outline"
                                key={bill}
                                type="button"
                                className={`rounded-full border border-gc-border bg-gc-card px-2.5 py-1 ${textScale.micro} font-bold text-gc-text transition-colors hover:border-gc-accent hover:text-gc-accent`}
                                onClick={() => handleBillShortcut(bill)}
                            >
                                {formatMoney(bill)}
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
                                    ? `Faltan ${formatMoney(cashDue - (Number(manualOrder.cash_tendered) || 0))}`
                                    : formatMoney(changeDue)}
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
                        <span className="font-semibold text-gc-text">{formatMoney(grossItems)}</span>
                    </div>
                    {couponDiscountApplied > 0 && (
                        <div className={`flex justify-between ${textScale.micro} text-gc-discount`}>
                            <span>Descuento (cupón)</span>
                            <span className="font-semibold">−{formatMoney(couponDiscountApplied)}</span>
                        </div>
                    )}
                    {deliveryFeeAmt > 0 && (
                        <div className={`flex justify-between ${textScale.micro} text-gc-text-muted`}>
                            <span>Delivery</span>
                            <span className="font-semibold text-gc-text">{formatMoney(deliveryFeeAmt)}</span>
                        </div>
                    )}
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-gc-border pt-3">
                    <span className={`${textScale.micro} font-extrabold uppercase tracking-wide text-gc-text-muted`}>Total a pagar</span>
                    <span className={`${textScale.price} font-black text-gc-price`}>{formatCheckoutTotal(totalToPay)}</span>
                </div>
            </div>
            ) : hideCouponSection ? (
                <div ref={postPaymentRef} className="h-0 overflow-hidden" aria-hidden />
            ) : null}

            {manualOrder.payment_type === 'online' && !isMixed && (
            <div className={cn(sectionCardClass, 'animate-fade-in')}>
                <SectionHeader icon={Upload} tone="accent">Comprobante (opc.)</SectionHeader>
                    <p className={`mb-2 ${textScale.micro} leading-relaxed text-gc-text-muted`}>
                        Podés confirmar el pedido sin imagen. Si querés, subí el comprobante ahora o después desde la tarjeta del pedido.
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
