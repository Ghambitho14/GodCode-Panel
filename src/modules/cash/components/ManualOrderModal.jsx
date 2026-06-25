import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle2, ShoppingBag, Banknote } from 'lucide-react';
import { createMoneyFormatter } from '@/shared/utils/money';
import { useManualOrder } from '../hooks/useManualOrder';
import { useOrderEdit } from '../hooks/useOrderEdit';
import { branchSettingsService } from '../services/branchSettingsService';
import { normalizeDeliverySettings, effectiveDeliveryPricingMode } from '@/lib/delivery-settings';
import { getLocalFulfillmentMode, isOpenMesaMeseroMode, isOpenOrderSessionStatus } from '../hooks/manual-order/manualOrderShared';
import {
    buildDeliveryAddressRecord,
    validateCheckoutPayment,
    isLocalOpenSessionOrder,
    isOrderPaymentDeferred,
    getPaymentLabel,
} from '@/shared/utils/orderUtils';
import { printOrderTicket } from '@/modules/cash/admin/utils/receiptPrinting';
import { useAdmin } from '@/modules/cash/admin/pages/AdminProvider';
import { canOverrideDeliveryFee } from '../utils/deliveryFeePermissions';

// Subcomponentes presentacionales
import ManualOrderCatalog from './manual-order/ManualOrderCatalog';
import ClientForm from './manual-order/ClientForm';
import OrderSummary from './manual-order/OrderSummary';
import PaymentDetails from './manual-order/PaymentDetails';
import CloseTableModal from './CloseTableModal';
import { ADMIN_MOBILE_MQ } from '../constants/responsive';
import { cn } from '@/lib/utils';

const stepNavBackClass =
    'flex max-w-[40%] flex-1 items-center justify-center rounded-[4px] border border-gc-border bg-gc-muted px-3.5 py-3 text-[13px] font-extrabold uppercase tracking-wide text-gc-text transition-all';
const stepNavNextClass =
    'flex min-h-[44px] flex-1 items-center justify-center rounded-[4px] bg-gc-accent px-6 text-[13px] font-extrabold uppercase tracking-wide text-white shadow-[0_4px_12px_rgba(79,91,255,0.35)] transition-all hover:-translate-y-0.5 hover:bg-gc-accent-hover disabled:cursor-not-allowed disabled:border disabled:border-gc-border disabled:bg-gc-muted disabled:text-gc-text-muted disabled:shadow-none disabled:hover:translate-y-0';
const confirmBtnClass =
    'manual-order-checkout-actions__confirm flex min-h-[44px] w-full min-w-0 items-center justify-center gap-2 rounded-[4px] border border-transparent bg-gc-accent px-4 py-3 text-sm font-extrabold uppercase tracking-wide text-white shadow-[0_4px_12px_rgba(79,91,255,0.35)] transition-[background,border-color,color,box-shadow,transform] enabled:hover:-translate-y-0.5 enabled:hover:bg-gc-accent-hover disabled:cursor-not-allowed disabled:border-gc-accent/40 disabled:bg-gc-accent/10 disabled:text-gc-accent disabled:shadow-none disabled:hover:translate-y-0';
const checkoutColBase =
    'manual-order-checkout-col flex min-h-0 min-w-0 flex-col overflow-hidden';
const checkoutColCard =
    'rounded-[4px] border border-gc-border bg-gc-card';
const openMesaPaymentCardClass = 'rounded-[4px] border border-gc-border bg-gc-card p-5';
const openMesaSectionTitleClass =
    'mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gc-text-muted';
const openMesaToggleClass =
    'flex min-h-[44px] items-center justify-center rounded-[4px] border border-gc-border bg-gc-page px-2.5 py-3 text-xs font-semibold text-gc-text transition-colors sm:px-3';
const openMesaToggleActiveClass = 'border-gc-accent bg-gc-accent/10 text-gc-accent';
const openMesaHintClass =
    'mt-3 rounded-[4px] border border-gc-accent/25 bg-gc-accent/10 px-3 py-2.5 text-xs leading-relaxed text-gc-text-muted';
const checkoutActionsClass =
    'manual-order-checkout-actions flex w-full min-w-0 flex-shrink-0 flex-col gap-2 border-t border-gc-border bg-gc-card pt-3';
const checkoutBackBtnClass =
    'manual-order-checkout-actions__back flex min-h-[44px] w-full min-w-0 items-center justify-center rounded-[4px] border border-gc-border bg-gc-muted px-3 py-3 text-[13px] font-extrabold uppercase tracking-wide text-gc-text transition-colors';

function branchFlag(map, branchId, defaultOn = true) {
    if (!branchId || !map || typeof map !== 'object') return defaultOn;
    if (Object.prototype.hasOwnProperty.call(map, branchId)) {
        return map[branchId] !== false;
    }
    return defaultOn;
}

function normalizeCartUpsellCatalog(catalog, kind) {
    if (!Array.isArray(catalog)) return [];
    return catalog.flatMap((row) => {
        if (!row || typeof row !== 'object' || Array.isArray(row)) return [];
        const id = String(row.id ?? '').trim();
        const name = String(row.name ?? '').trim();
        const price = Number(row.price);
        if (!id || !name || !Number.isFinite(price) || price < 0) return [];
        const category = String(row.category ?? row.catalogCategory ?? row.group ?? '').trim();
        const beverageKind = String(row.beverageKind ?? row.beverage_kind ?? '').trim();
        const imageUrl = String(row.imageUrl ?? row.image_url ?? '').trim();

        if (row.active === false || row.is_active === false || row.enabled === false) return [];

        return [{
            id,
            name,
            price,
            has_discount: false,
            discount_price: null,
            image_url: imageUrl,
            description: beverageKind || null,
            category_name: category,
            manual_order_source: kind,
            is_active: true,
        }];
    });
}

const DESKTOP_WIZARD_STEPS = 2;
const MOBILE_WIZARD_STEPS = 3;

const ManualOrderModal = ({
    isOpen,
    onClose,
    products = [],
    categories = [],
    clients = [],
    editOrder = null,
    moveOrder = null,
    onOrderSaved,
    showNotify,
    branch,
    logoUrl,
    companyName,
    resyncOrderSale = null,
    openMesaMode = false,
    localOrderChannels = null,
}) => {
    const { userRole, markOrderSessionPaid, orders } = useAdmin();
    const canEditDeliveryFee = canOverrideDeliveryFee(userRole);
    const isEditMode = Boolean(editOrder?.id);
    const liveEditOrder = useMemo(() => {
        if (!editOrder?.id) return editOrder;
        return orders.find((o) => o.id === editOrder.id) ?? editOrder;
    }, [editOrder, orders]);
    const isLocalSessionEdit = isEditMode && isLocalOpenSessionOrder(liveEditOrder);
    const effectiveOpenMesaMode = openMesaMode || isLocalSessionEdit;
    const showClassicPaymentStep = !effectiveOpenMesaMode;
    const showOpenMesaPaymentChoice = openMesaMode && !isEditMode;
    // --- ESTADOS LOCALES DE CONFIGURACIÓN Y CATÁLOGO DE UPSELL ---
    const [branchDeliveryCfg, setBranchDeliveryCfg] = useState(null);
    const [branchDeliveryCfgLoading, setBranchDeliveryCfgLoading] = useState(false);
    const [cartUpsellCatalogs, setCartUpsellCatalogs] = useState({
        beveragesEnabled: false,
        extrasEnabled: false,
        beverages: [],
        extras: [],
    });
    const { formatMoney } = useMemo(() => createMoneyFormatter(branch), [branch]);

    const createHook = useManualOrder(
        showNotify,
        isEditMode ? undefined : onOrderSaved,
        onClose,
        branch,
        branchDeliveryCfg,
        userRole,
        openMesaMode,
        localOrderChannels,
    );

    const editHook = useOrderEdit(
        showNotify,
        isEditMode ? onOrderSaved : undefined,
        onClose,
        branch,
        branchDeliveryCfg,
        isEditMode ? editOrder : null,
        resyncOrderSale,
        userRole,
    );

    const {
        manualOrder, loading, rutValid, phoneValid,
        receiptFile, receiptPreview,
        updateClientName, updateCouponCode, couponPreview, updatePaymentType,
        updatePaymentMode, updateCashAmount, updateCardAmount, updateCashTendered, updateChargeNow,
        handleRutChange,
        handlePhoneChange, handleFileChange, removeReceipt, addItem, updateQuantity, removeItem,
        updateItemNote,
        updateOrderType, updateLocalFulfillmentMode, updateMesaPartyMode, updateDeliveryAddress, updateDeliveryReference, updateDeliveryKm,
        updateDeliveryFee, updateDeliveryNamedAreaId,
        applyClientRecord,
        applySavedAddress,
        submitOrder, resetOrder, getInputStyle,
    } = isEditMode ? editHook : createHook;

    const openMesaChargeNow = showOpenMesaPaymentChoice && Boolean(manualOrder?.charge_now);

    // --- WIZARD (2 pasos: Productos + Checkout) ---
    const [orderStep, setOrderStep] = useState(1);
    const [isCompactNav, setIsCompactNav] = useState(() => {
        if (typeof window === 'undefined') return false;
        return window.matchMedia(ADMIN_MOBILE_MQ).matches;
    });

    const [touchStart, setTouchStart] = useState(null);
    const [touchEnd, setTouchEnd] = useState(null);
    const [payModalOpen, setPayModalOpen] = useState(false);
    const wasOpenRef = useRef(false);

    const sessionPaymentDeferred = isEditMode && isOrderPaymentDeferred(liveEditOrder);
    const canMarkPaidSession =
        isLocalSessionEdit &&
        Boolean(markOrderSessionPaid) &&
        sessionPaymentDeferred &&
        isOpenOrderSessionStatus(liveEditOrder?.status);

    const wizardStepCount = effectiveOpenMesaMode
        ? (openMesaChargeNow && isCompactNav ? 3 : 2)
        : (isCompactNav ? MOBILE_WIZARD_STEPS : DESKTOP_WIZARD_STEPS);

    useEffect(() => {
        if (isOpen && !wasOpenRef.current) {
            resetOrder();
            setOrderStep(1);
            setPayModalOpen(false);
        }
        wasOpenRef.current = isOpen;
    }, [isOpen, resetOrder]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const mq = window.matchMedia(ADMIN_MOBILE_MQ);
        const sync = () => setIsCompactNav(mq.matches);
        sync();
        mq.addEventListener('change', sync);
        return () => mq.removeEventListener('change', sync);
    }, []);

    useEffect(() => {
        setOrderStep((prev) => {
            const max = isCompactNav ? MOBILE_WIZARD_STEPS : DESKTOP_WIZARD_STEPS;
            if (prev <= max) return prev;
            if (!isCompactNav && prev === 3) return 2;
            return max;
        });
    }, [isCompactNav]);

    // Cargar Catálogos de Upsell de la Sucursal al abrir
    useEffect(() => {
        let cancelled = false;
        const resetCatalogs = () => {
            setCartUpsellCatalogs({
                beveragesEnabled: false,
                extrasEnabled: false,
                beverages: [],
                extras: [],
            });
        };

        if (!isOpen || !branch?.id || branch.id === 'all') {
            resetCatalogs();
            setBranchDeliveryCfg(null);
            setBranchDeliveryCfgLoading(false);
            return undefined;
        }

        const loadCatalogs = async () => {
            setBranchDeliveryCfgLoading(true);
            try {
                const data = await branchSettingsService.getDeliveryConfig(branch.id);
                if (cancelled) return;
                if (!data) {
                    resetCatalogs();
                    setBranchDeliveryCfg(null);
                    return;
                }

                setBranchDeliveryCfg({
                    ...normalizeDeliverySettings(data),
                    originLat: data.originLat ?? null,
                    originLng: data.originLng ?? null,
                });
                setCartUpsellCatalogs({
                    beveragesEnabled: branchFlag(data.beveragesUpsellEnabledByBranch, branch.id, true),
                    extrasEnabled: branchFlag(data.extrasEnabledByBranch, branch.id, true),
                    beverages: normalizeCartUpsellCatalog(data.cartBeveragesCatalog, 'beverages'),
                    extras: normalizeCartUpsellCatalog(data.cartGlobalExtrasCatalog, 'extras'),
                });
            } catch {
                if (!cancelled) {
                    resetCatalogs();
                    setBranchDeliveryCfg(null);
                }
            } finally {
                if (!cancelled) setBranchDeliveryCfgLoading(false);
            }
        };

        void loadCatalogs();
        return () => {
            cancelled = true;
        };
    }, [isOpen, branch?.id]);

    // --- IMPRESIÓN DE TICKETS ---
    const manualOrderForTicket = useMemo(() => {
        if (manualOrder.order_type !== 'delivery') return manualOrder;
        const nid = String(manualOrder.delivery_named_area_id ?? '').trim();
        const nlab = nid && branchDeliveryCfg?.namedAreas?.length
            ? String(branchDeliveryCfg.namedAreas.find((z) => z.id === nid)?.name ?? '')
            : '';
        const da = buildDeliveryAddressRecord({
            rawAddress: manualOrder.delivery_address,
            deliveryReference: manualOrder.delivery_reference,
            namedAreaId: nid || null,
            namedAreaLabel: nlab || null,
        });
        return {
            ...manualOrder,
            delivery_address: da,
            delivery_fee: Number(manualOrder.delivery_fee) || 0,
            channel: 'delivery',
        };
    }, [manualOrder, branchDeliveryCfg]);

    const ticketOpts = (variant) => ({
        variant,
        branchAddress: branch?.address ?? null,
        orderChannel: 'PDV',
        companyName: companyName ?? null,
    });

    const printManualKitchen = () => {
        printOrderTicket(manualOrderForTicket, branch?.name, logoUrl ?? null, ticketOpts('kitchen'));
    };

    const printManualCaja = () => {
        printOrderTicket(manualOrderForTicket, branch?.name, logoUrl ?? null, ticketOpts('cashier'));
    };

    // --- TECLA ESCAPE PARA CERRAR ---
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    // --- GESTOS MÓVILES (DESLIZAR HACIA ABAJO PARA CERRAR) ---
    const onTouchStart = (e) => {
        setTouchEnd(null);
        setTouchStart(e.targetTouches[0].clientY);
    };
    const onTouchMove = (e) => setTouchEnd(e.targetTouches[0].clientY);
    const onTouchEnd = () => {
        if (!touchStart || !touchEnd) return;
        const distance = touchStart - touchEnd;
        if (distance < -50) onClose(); // Swipe hacia abajo
    };

    const couponDiscountApplied =
        couponPreview?.variant === 'success' && Number(couponPreview.discount) > 0
            ? Math.min(manualOrder.total ?? 0, Number(couponPreview.discount))
            : 0;
    const deliveryFeeAmt =
        manualOrder.order_type === 'delivery' ? (Number(manualOrder.delivery_fee) || 0) : 0;
    const totalToPay = Math.max(0, (manualOrder.total ?? 0) - couponDiscountApplied + deliveryFeeAmt);

    const openMesaFulfillment = effectiveOpenMesaMode ? getLocalFulfillmentMode(manualOrder) : null;
    const openMesaSubmitLabel = loading
        ? (isEditMode ? 'GUARDANDO…' : 'ABRIENDO…')
        : isEditMode
            ? 'GUARDAR CAMBIOS'
            : ({
                mesa: 'ABRIR MESA',
                retiro: 'ABRIR RETIRO',
                delivery: 'ABRIR DELIVERY',
            }[openMesaFulfillment ?? 'mesa'] ?? 'ABRIR MESA');

    const isOpenMesaMesero = () =>
        effectiveOpenMesaMode && isOpenMesaMeseroMode(manualOrder);

    const hasOpenMesaClientName = () => {
        if (isOpenMesaMesero()) {
            return String(manualOrder.client_name ?? '').trim().length >= 2;
        }
        return (
            Boolean(String(manualOrder.selected_client_id ?? '').trim()) ||
            Boolean(String(manualOrder.client_name ?? '').trim()) ||
            manualOrder.order_type === 'delivery'
        );
    };

    const isOpenMesaContactValid = () => {
        if (!effectiveOpenMesaMode || isOpenMesaMesero()) return true;
        const exactRutLength = manualOrder.client_rut?.trim().length || 0;
        return exactRutLength > 0 && rutValid && phoneValid === true;
    };

    const isDeliveryValidForOrder = () => {
        if (manualOrder.order_type !== 'delivery') return true;

        if (branchDeliveryCfgLoading) return false;

        const addrOk = Boolean(manualOrder.delivery_address && manualOrder.delivery_address.trim().length >= 5);

        if (!branchDeliveryCfg) return addrOk;

        const pricing = effectiveDeliveryPricingMode(branchDeliveryCfg);

        if (pricing === 'named') {
            return String(manualOrder.delivery_named_area_id ?? '').trim().length > 0;
        }

        if (pricing === 'distance') return addrOk;

        return addrOk || String(manualOrder.delivery_named_area_id ?? '').trim().length > 0;
    };

    const isPaymentValid = () => {
        if (totalToPay <= 0) return true;
        return validateCheckoutPayment({
            payment_mode: manualOrder.payment_mode,
            payment_type: manualOrder.payment_type,
            cash_amount: manualOrder.cash_amount,
            card_amount: manualOrder.card_amount,
            cash_tendered: manualOrder.cash_tendered,
            totalToPay,
        }).valid;
    };

    // --- VALIDACIÓN GLOBAL DEL FORMULARIO ---
    const isFormValid = () => {
        const hasItems = manualOrder.items && manualOrder.items.length > 0;
        const hasClientName = effectiveOpenMesaMode
            ? hasOpenMesaClientName()
            : Boolean(manualOrder.client_name && manualOrder.client_name.trim().length >= 3);
        const hasPaymentType = !!manualOrder.payment_type;
        const paymentOk = effectiveOpenMesaMode
            ? (openMesaChargeNow ? isPaymentValid() && manualOrder.payment_type !== 'pendiente' : true)
            : isPaymentValid();

        if (isEditMode) {
            if (effectiveOpenMesaMode) {
                return hasItems && hasClientName && isOpenMesaContactValid() && isDeliveryValidForOrder();
            }
            return hasItems && hasClientName && hasPaymentType && paymentOk;
        }

        if (effectiveOpenMesaMode) {
            const base = hasItems && hasClientName && isOpenMesaContactValid() && isDeliveryValidForOrder();
            return openMesaChargeNow ? base && hasPaymentType && paymentOk : base;
        }

        const exactRutLength = manualOrder.client_rut?.trim().length || 0;
        const isRutRequiredAndValid = exactRutLength > 0 && rutValid;
        const isPhoneStrictlyValid = phoneValid === true;

        return hasItems && hasClientName && hasPaymentType && paymentOk && isRutRequiredAndValid && isPhoneStrictlyValid && isDeliveryValidForOrder();
    };

    const isClientStepValid = () => {
        const hasClientName = effectiveOpenMesaMode
            ? hasOpenMesaClientName()
            : Boolean(manualOrder.client_name && manualOrder.client_name.trim().length >= 3);
        if (effectiveOpenMesaMode) {
            return hasClientName && isOpenMesaContactValid() && isDeliveryValidForOrder();
        }
        return Boolean(hasClientName && isDeliveryValidForOrder());
    };

    const hasCartItems = (manualOrder.items?.length ?? 0) > 0;
    const cartItemCount = (manualOrder.items ?? []).reduce((acc, i) => acc + (Number(i.quantity) || 1), 0);

    const goNextStep = () => {
        if (orderStep >= wizardStepCount) return;

        if (orderStep === 1) {
            if (!hasCartItems) {
                showNotify?.('Agrega al menos un producto al carrito.', 'warning');
                return;
            }
            setOrderStep(2);
            return;
        }

        if (isCompactNav && orderStep === 2 && showClassicPaymentStep) {
            if (!isClientStepValid()) {
                showNotify?.('Completa el nombre del cliente y los datos de entrega.', 'warning');
                return;
            }
            setOrderStep(3);
            return;
        }

        if (isCompactNav && orderStep === 2 && openMesaChargeNow) {
            if (!isClientStepValid()) {
                showNotify?.('Completa los datos del cliente.', 'warning');
                return;
            }
            setOrderStep(3);
        }
    };

    const goPrevStep = () => {
        setOrderStep((prev) => (prev > 1 ? prev - 1 : prev));
    };

    const canCancelOrder = Boolean(
        isEditMode &&
        moveOrder &&
        editOrder?.id &&
        String(editOrder?.status ?? '').toLowerCase() !== 'cancelled',
    );

    const handleMarkPaidConfirm = async (targetOrder, paymentPatch) => {
        if (!markOrderSessionPaid) return false;
        const result = await markOrderSessionPaid(targetOrder, paymentPatch);
        if (result) setPayModalOpen(false);
        return Boolean(result);
    };

    const handleCancelOrder = async () => {
        if (!canCancelOrder || loading) return;
        const status = String(editOrder?.status ?? '').toLowerCase();
        const stageLabel =
            status === 'pending' ? 'Pendiente' :
            status === 'active' ? 'En cocina' :
            status === 'completed' ? 'Listo' :
            status === 'picked_up' ? 'Entregado' :
            status;
        const refundWarning = '\n\nSi el pedido tiene venta registrada en caja, se aplicará una devolución automática.';
        const ok = typeof window !== 'undefined'
            ? window.confirm(`Cancelar pedido #${editOrder.id} (estado: ${stageLabel})?${refundWarning}`)
            : true;
        if (!ok) return;
        try {
            await moveOrder(editOrder.id, 'cancelled');
            onClose?.();
        } catch {
            // moveOrder ya notifica errores
        }
    };

    if (!isOpen) return null;

    const stepLabels = effectiveOpenMesaMode
        ? (isEditMode
            ? (isCompactNav ? ['Productos', 'Mesa'] : ['Productos', 'Editar sesión'])
            : (openMesaChargeNow && isCompactNav
                ? ['Productos', 'Cliente', 'Pago']
                : (isCompactNav ? ['Productos', 'Pedido'] : ['Productos', 'Pedido'])))
        : (isCompactNav
            ? ['Productos', 'Cliente', 'Pago']
            : ['Productos', 'Cliente y pago']);

    const clientSection = (
        <ClientForm
            manualOrder={manualOrder}
            branchDeliveryCfg={branchDeliveryCfg}
            clients={clients}
            updateOrderType={updateOrderType}
            updateLocalFulfillmentMode={updateLocalFulfillmentMode}
            updateMesaPartyMode={updateMesaPartyMode}
            updateDeliveryAddress={updateDeliveryAddress}
            updateDeliveryReference={updateDeliveryReference}
            updateDeliveryKm={updateDeliveryKm}
            updateDeliveryFee={updateDeliveryFee}
            updateDeliveryNamedAreaId={updateDeliveryNamedAreaId}
            updateClientName={updateClientName}
            applyClientRecord={applyClientRecord}
            applySavedAddress={applySavedAddress}
            handleRutChange={handleRutChange}
            handlePhoneChange={handlePhoneChange}
            rutValid={rutValid}
            phoneValid={phoneValid}
            getInputStyle={getInputStyle}
            branch={branch}
            showNotify={showNotify}
            canOverrideDeliveryFee={canEditDeliveryFee}
            openMesaMode={effectiveOpenMesaMode}
            branchDeliveryCfgLoading={branchDeliveryCfgLoading}
            enabledLocalChannels={localOrderChannels}
            isEditMode={isEditMode}
        />
    );

    const showEditSaveOnFooter = isEditMode && orderStep === 1;

    const wizardNavButtons = (
        <div
            className={`manual-order-footer-nav${showEditSaveOnFooter ? ' manual-order-footer-nav--edit' : ''}`}
            role="group"
            aria-label="Navegación del pedido"
        >
            {orderStep > 1 ? (
                <button
                    type="button"
                    className={stepNavBackClass}
                    onClick={goPrevStep}
                >
                    ATRÁS
                </button>
            ) : (
                <span className="manual-order-steps-nav__spacer" aria-hidden />
            )}
            {showEditSaveOnFooter ? (
                <>
                    <button
                        type="button"
                        className="manual-order-steps-nav__btn manual-order-steps-nav__btn--next-secondary"
                        onClick={goNextStep}
                        disabled={!hasCartItems}
                    >
                        Siguiente
                    </button>
                    <button
                        type="button"
                        className="manual-order-steps-nav__btn manual-order-steps-nav__btn--save"
                        onClick={submitOrder}
                        disabled={loading}
                    >
                        {loading ? 'GUARDANDO...' : 'Guardar cambios'}
                    </button>
                </>
            ) : orderStep === 1 ? (
                <button
                    type="button"
                    className="manual-order-steps-nav__btn manual-order-steps-nav__btn--next manual-order-steps-nav__btn--next-step1"
                    onClick={goNextStep}
                    disabled={!hasCartItems}
                >
                    Siguiente
                </button>
            ) : null}
        </div>
    );

    const orderSummaryProps = {
        manualOrder,
        updateQuantity,
        removeItem,
        updateItemNote,
        printManualKitchen,
        printManualCaja,
        showCheckoutTotals: effectiveOpenMesaMode,
    };

    const paymentDetailsProps = {
        manualOrder,
        branch,
        branchDeliveryCfg,
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
        confirmLabel: openMesaChargeNow
            ? openMesaSubmitLabel
            : (isEditMode ? 'GUARDAR CAMBIOS' : (effectiveOpenMesaMode ? openMesaSubmitLabel : 'CONFIRMAR PEDIDO')),
        onCancelOrder: canCancelOrder ? handleCancelOrder : null,
        isEditMode,
        hideCheckoutActions: false,
    };

    const paymentDetailsMobileProps = {
        ...paymentDetailsProps,
        goPrevStep: null,
        hideCheckoutActions: true,
    };

    const catalogBlock = (
        <ManualOrderCatalog
            products={products}
            categories={categories}
            cartUpsellCatalogs={cartUpsellCatalogs}
            addItem={addItem}
            updateQuantity={updateQuantity}
            removeItem={removeItem}
            getQty={(id) => {
                const key = id == null ? '' : String(id);
                return manualOrder.items.find((i) => String(i.id) === key)?.quantity || 0;
            }}
        />
    );

    const openMesaPaymentChoiceSection = showOpenMesaPaymentChoice ? (
        <div className={openMesaPaymentCardClass}>
            <div className={openMesaSectionTitleClass}>
                <Banknote size={14} className="text-gc-accent" aria-hidden />
                Pago
            </div>
            <div className="grid grid-cols-1 gap-2.5 min-[400px]:grid-cols-2">
                <button
                    type="button"
                    className={cn(
                        openMesaToggleClass,
                        !manualOrder.charge_now && openMesaToggleActiveClass,
                    )}
                    onClick={() => updateChargeNow?.(false)}
                >
                    Pago pendiente
                </button>
                <button
                    type="button"
                    className={cn(
                        openMesaToggleClass,
                        manualOrder.charge_now && openMesaToggleActiveClass,
                    )}
                    onClick={() => updateChargeNow?.(true)}
                >
                    Ya pagado
                </button>
            </div>
            <p className={openMesaHintClass}>
                {manualOrder.charge_now
                    ? 'Registra el método de pago al abrir la sesión.'
                    : 'El cobro se registra al cerrar la mesa, retiro o delivery.'}
            </p>
        </div>
    ) : null;

    const openMesaSessionPaymentSection = isEditMode && isLocalSessionEdit ? (
        <div className={openMesaPaymentCardClass}>
            <div className={openMesaSectionTitleClass}>
                <Banknote size={14} className="text-gc-accent" aria-hidden />
                Pago
            </div>
            {sessionPaymentDeferred ? (
                <p className={openMesaHintClass}>
                    El cobro se registra al cerrar la mesa, retiro o delivery.
                </p>
            ) : (
                <p className={openMesaHintClass}>
                    {getPaymentLabel(liveEditOrder)}
                </p>
            )}
            {canMarkPaidSession ? (
                <button
                    type="button"
                    className="mt-3 flex min-h-[44px] w-full items-center justify-center rounded-[4px] bg-gc-accent px-4 text-sm font-bold text-white transition-colors hover:bg-gc-accent-hover disabled:cursor-not-allowed disabled:opacity-55"
                    onClick={(e) => {
                        e.stopPropagation();
                        setPayModalOpen(true);
                    }}
                >
                    Marcar pagado
                </button>
            ) : null}
        </div>
    ) : null;

    const mobileDock = isCompactNav ? (
        <div className="manual-order-mobile-dock" role="group" aria-label="Navegación del pedido">
            {orderStep === 1 ? (
                <>
                    <div className="manual-order-mobile-cart-bar" aria-live="polite">
                        <ShoppingBag size={18} aria-hidden />
                        <span className="manual-order-mobile-cart-bar__text">
                            {hasCartItems
                                ? `${cartItemCount} ${cartItemCount === 1 ? 'ítem' : 'ítems'} · ${formatMoney(manualOrder.total ?? 0)}`
                                : 'Carrito vacío'}
                        </span>
                    </div>
                    {showEditSaveOnFooter ? (
                        <div className="manual-order-mobile-dock__actions manual-order-mobile-dock__actions--edit">
                            <button
                                type="button"
                                className="manual-order-steps-nav__btn manual-order-steps-nav__btn--next-secondary"
                                onClick={goNextStep}
                                disabled={!hasCartItems}
                            >
                                Siguiente
                            </button>
                            <button
                                type="button"
                                className="manual-order-steps-nav__btn manual-order-steps-nav__btn--save"
                                onClick={submitOrder}
                                disabled={loading}
                            >
                                {loading ? 'GUARDANDO...' : 'Guardar'}
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            className="manual-order-steps-nav__btn manual-order-steps-nav__btn--next manual-order-steps-nav__btn--next-step1 transition-all duration-200 hover:!-translate-y-0.5 active:!translate-y-0"
                            onClick={goNextStep}
                            disabled={!hasCartItems}
                        >
                            Siguiente
                        </button>
                    )}
                </>
            ) : null}
            {orderStep === 2 ? (
                <div className="manual-order-mobile-dock__actions">
                    <button
                        type="button"
                        className={stepNavBackClass}
                        onClick={goPrevStep}
                    >
                        ATRÁS
                    </button>
                    {effectiveOpenMesaMode && !openMesaChargeNow ? (
                        <button
                            type="button"
                            className={cn(confirmBtnClass, 'manual-order-mobile-dock__confirm')}
                            onClick={submitOrder}
                            disabled={loading || !isFormValid()}
                        >
                            {openMesaSubmitLabel}
                        </button>
                    ) : effectiveOpenMesaMode && openMesaChargeNow ? (
                        <button
                            type="button"
                            className={stepNavNextClass}
                            onClick={goNextStep}
                            disabled={!isClientStepValid()}
                        >
                            Siguiente
                        </button>
                    ) : (
                        <button
                            type="button"
                            className={stepNavNextClass}
                            onClick={goNextStep}
                            disabled={!isClientStepValid()}
                        >
                            Siguiente
                        </button>
                    )}
                </div>
            ) : null}
            {orderStep === 3 && (showClassicPaymentStep || openMesaChargeNow) ? (
                <div className="manual-order-mobile-dock__actions manual-order-mobile-dock__actions--confirm">
                    <button
                        type="button"
                        className={stepNavBackClass}
                        onClick={goPrevStep}
                    >
                        ATRÁS
                    </button>
                    {canCancelOrder ? (
                        <button
                            type="button"
                            className={cn(
                                stepNavBackClass,
                                'max-w-[36%] text-[10px] text-gc-danger',
                            )}
                            onClick={handleCancelOrder}
                            disabled={loading}
                        >
                            Cancelar
                        </button>
                    ) : null}
                    <button
                        type="button"
                        className={cn(confirmBtnClass, 'manual-order-mobile-dock__confirm')}
                        onClick={submitOrder}
                        disabled={loading || !isFormValid()}
                    >
                        {loading ? 'PROCESANDO...' : (openMesaChargeNow ? openMesaSubmitLabel : (isEditMode ? 'GUARDAR' : 'CONFIRMAR'))}
                    </button>
                </div>
            ) : null}
        </div>
    ) : null;

    const sidebarSection = (
        <div className={cn(
            'manual-order-sidebar flex min-h-0 w-full min-w-0 flex-shrink-0 flex-col gap-3 overflow-hidden !bg-gc-page lg:w-80',
            orderStep === 2 && '!border-gc-border',
        )}>
            {orderStep === 1 ? (
                <>
                    <OrderSummary {...orderSummaryProps} />
                    <div className="manual-order-footer relative z-10 flex-shrink-0">
                        {showEditSaveOnFooter ? (
                            <p className="manual-order-footer-edit-hint" role="status">
                                Puedes guardar aquí sin pasar por los otros pasos.
                            </p>
                        ) : null}
                        {wizardNavButtons}
                    </div>
                </>
            ) : (
                <div className={cn(
                    'manual-order-checkout-stage grid w-full max-w-[1280px] flex-1 grid-cols-1 gap-5 xl:grid-cols-[minmax(260px,1.15fr)_minmax(220px,1fr)_minmax(220px,1fr)]',
                    effectiveOpenMesaMode && 'manual-order-checkout-stage--open-mesa',
                )}>
                    <div className={cn(checkoutColBase, 'manual-order-checkout-col--client')}>
                        <div className="manual-order-client-stage flex w-full flex-col gap-3.5">
                            {clientSection}
                        </div>
                    </div>
                    <div className={cn(checkoutColBase, 'manual-order-checkout-col--summary')}>
                        <OrderSummary {...orderSummaryProps} />
                    </div>
                    {effectiveOpenMesaMode ? (
                        <div className={cn(
                            checkoutColBase,
                            checkoutColCard,
                            'manual-order-checkout-col--payment manual-order-checkout-col--payment-open overflow-hidden p-0',
                        )}>
                            <div className="manual-order-checkout-col__scroll flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto p-5">
                                {openMesaPaymentChoiceSection}
                                {openMesaSessionPaymentSection}
                                {openMesaChargeNow ? (
                                    <PaymentDetails {...paymentDetailsProps} hideCheckoutActions embedded />
                                ) : null}
                            </div>
                            <div className={cn(checkoutActionsClass, 'px-5 pb-5')}>
                                <button
                                    type="button"
                                    className={checkoutBackBtnClass}
                                    onClick={goPrevStep}
                                >
                                    ATRÁS
                                </button>
                                <button
                                    type="button"
                                    className={confirmBtnClass}
                                    onClick={submitOrder}
                                    disabled={loading || !isFormValid()}
                                >
                                    {openMesaSubmitLabel}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className={cn(checkoutColBase, checkoutColCard, 'manual-order-checkout-col--payment gap-3.5 p-5')}>
                            <PaymentDetails {...paymentDetailsProps} />
                        </div>
                    )}
                </div>
            )}
        </div>
    );

    const modalUi = (
        <div className="manual-order-overlay" onClick={onClose}>
            <div
                className={`manual-order-container manual-order-wizard manual-order-step-${orderStep}${isCompactNav ? ' manual-order--mobile' : ''}${effectiveOpenMesaMode ? ' manual-order--open-mesa' : ''} flex h-full flex-col overflow-hidden`}
                onClick={e => e.stopPropagation()}
            >
                {/* ÁREA INVISIBLE PARA GESTOS */}
                <div
                    className="manual-order-drag-zone"
                    onTouchStart={onTouchStart}
                    onTouchMove={onTouchMove}
                    onTouchEnd={onTouchEnd}
                />

                {/* BOTÓN CERRAR FLOTANTE */}
                <button type="button" onClick={onClose} className="manual-order-floating-close" title="Cerrar (Esc)">
                    <X size={24} />
                </button>

                <div
                    className={`manual-order-steps-progress${isEditMode ? ' manual-order-steps-progress--editable' : ''}`}
                    aria-label={`Paso ${orderStep} de ${wizardStepCount}`}
                >
                    {stepLabels.map((label, idx) => {
                        const n = idx + 1;
                        const isActive = orderStep === n;
                        const isDone = orderStep > n;
                        const itemClassName = `manual-order-steps-progress__item ${isActive ? 'is-active' : ''} ${isDone ? 'is-done' : ''}${isEditMode ? ' manual-order-steps-progress__item--clickable' : ''}`;

                        if (isEditMode) {
                            return (
                                <button
                                    key={label}
                                    type="button"
                                    className={itemClassName}
                                    onClick={() => setOrderStep(n)}
                                    aria-current={isActive ? 'step' : undefined}
                                    aria-label={`Ir a ${label}`}
                                >
                                    <span className="manual-order-steps-progress__dot">
                                        {isDone ? <CheckCircle2 size={14} /> : n}
                                    </span>
                                    <span className="manual-order-steps-progress__label">{label}</span>
                                </button>
                            );
                        }

                        return (
                            <div key={label} className={itemClassName}>
                                <span className="manual-order-steps-progress__dot">
                                    {isDone ? <CheckCircle2 size={14} /> : n}
                                </span>
                                <span className="manual-order-steps-progress__label">{label}</span>
                            </div>
                        );
                    })}
                </div>

                {isCompactNav ? (
                    <div className="manual-order-mobile-scene">
                        {orderStep === 1 ? (
                            <div className="manual-order-stage manual-order-mobile-stage--catalog">
                                {catalogBlock}
                            </div>
                        ) : null}
                        {orderStep === 2 ? (
                            <div className="manual-order-mobile-panel manual-order-mobile-panel--client flex flex-col gap-3">
                                {effectiveOpenMesaMode ? (
                                    <>
                                        {clientSection}
                                        {openMesaPaymentChoiceSection}
                                        {openMesaSessionPaymentSection}
                                        <OrderSummary {...orderSummaryProps} />
                                    </>
                                ) : (
                                    clientSection
                                )}
                            </div>
                        ) : null}
                        {orderStep === 3 && (showClassicPaymentStep || openMesaChargeNow) ? (
                            <div className="manual-order-mobile-panel manual-order-mobile-panel--payment">
                                <OrderSummary {...orderSummaryProps} />
                                <PaymentDetails {...paymentDetailsMobileProps} />
                            </div>
                        ) : null}
                    </div>
                ) : (
                    <div className={cn(
                        'manual-order-body flex min-h-0 flex-1 gap-5 p-5 !bg-gc-page',
                    )}>
                        <div className="manual-order-stage min-h-0 flex-1 overflow-hidden">
                            {catalogBlock}
                        </div>
                        {sidebarSection}
                    </div>
                )}

                {mobileDock}
            </div>
        </div>
    );

    if (typeof document === 'undefined') return null;
    return createPortal(
        <div className="manual-order-portal-scope">
            {modalUi}
            {payModalOpen && liveEditOrder ? (
                <CloseTableModal
                    isOpen
                    intent="pay"
                    stackAboveManualOrder
                    onClose={() => setPayModalOpen(false)}
                    order={liveEditOrder}
                    branch={branch}
                    showNotify={showNotify}
                    onConfirm={handleMarkPaidConfirm}
                />
            ) : null}
        </div>,
        document.body,
    );
};

export default ManualOrderModal;
