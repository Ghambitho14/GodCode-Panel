import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    X,
    KeyRound,
    MapPin,
    ChefHat,
    Banknote,
    Copy,
    Send,
    ImageIcon,
    ExternalLink,
    Loader2,
} from 'lucide-react';
import { supabase, TABLES } from '@/integrations/supabase';
import { useOrderMoney } from '@/modules/cash/hooks/useOrderMoney';
import { getFormStrategy, paymentMethodRequiresReceipt } from '@/lib/geo/country-forms';
import { isVenezuelaCountry, resolveEffectiveCountry } from '@/lib/geo/tenant-locale';
import { paymentMethodUsesBolivaresInVenezuela } from '@/lib/money/venezuela-payment-copy';
import { useAdmin } from '@/modules/cash/admin/pages/AdminProvider';
import { buildWhatsAppUrl, WhatsAppGlyph } from '@/shared/utils/phoneWhatsApp';
import {
    isOrderDelivery,
    deliveryAddressLines,
    buildOrderWhatsAppShareText,
    buildOrderDeliveryDriverPack,
    shareDeliveryPackViaWhatsApp,
    getOrderFulfillmentKind,
    getOrderFulfillmentDisplayLabel,
    getPaymentLabel,
    getOrderPaymentDisplayLabel,
    getOrderItemLineTotal,
    isOrderPaymentDeferred,
    isOrderPaymentSettled,
    resolveOrderCouponCode,
    resolveOrderClientPhoneForDisplay,
    resolveOrderClientRutForDisplay,
    resolveOrderClientNameForDisplay,
    isCajaGenericIdentity,
    resolveItemKitchenNote,
    isLegacyGlobalKitchenNote,
    ORDERS_PANEL_SELECT,
    sanitizeOrder,
} from '@/shared/utils/orderUtils';
import { isOpenOrderSessionStatus } from '@/modules/cash/hooks/manual-order/manualOrderShared';
import { printOrderTicket } from '@/modules/cash/admin/utils/receiptPrinting';
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

function formatOrderRef(orderId) {
    const raw = String(orderId ?? '').replace(/-/g, '');
    if (!raw) return '—';
    return raw.slice(-6).toUpperCase();
}

function parseItems(raw) {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
        try {
            const p = JSON.parse(raw);
            return Array.isArray(p) ? p : [];
        } catch {
            return [];
        }
    }
    return [];
}

const ADDRESS_FIELD_LABELS = [
    ['named_area_label', 'Zona'],
    ['zone_label', 'Zona'],
    ['formatted_address', 'Dirección'],
    ['label', 'Etiqueta'],
    ['address', 'Dirección'],
    ['street', 'Calle'],
    ['line1', 'Dirección'],
    ['line_1', 'Dirección'],
    ['street_detail', 'Detalle'],
    ['reference', 'Referencia'],
    ['referencia', 'Referencia'],
    ['description', 'Indicaciones'],
    ['comuna', 'Comuna'],
    ['commune', 'Comuna'],
    ['city', 'Ciudad'],
    ['ciudad', 'Ciudad'],
];

function structuredAddressRows(addr, fallbackLines = []) {
    if (!addr || typeof addr !== 'object' || Array.isArray(addr)) {
        return fallbackLines.map((value, i) => ({
            key: `line-${i}`,
            label: i === 0 ? 'Dirección' : 'Detalle',
            value,
        }));
    }
    const rows = [];
    const seenValues = new Set();
    for (const [field, label] of ADDRESS_FIELD_LABELS) {
        const raw = addr[field];
        if (raw == null) continue;
        const value = String(raw).trim();
        if (!value) continue;
        const dedupe = value.toLowerCase();
        if (seenValues.has(dedupe)) continue;
        seenValues.add(dedupe);
        rows.push({ key: field, label, value });
    }
    if (rows.length > 0) return rows;
    return fallbackLines.map((value, i) => ({
        key: `fallback-${i}`,
        label: i === 0 ? 'Dirección' : 'Detalle',
        value,
    }));
}

const OrderDetailModal = ({
    order,
    onClose,
    branch = null,
    logoUrl = null,
    companyName = null,
    showNotify,
    setReceiptModalOrder,
    onMarkPaid = null,
}) => {
    const { companyProfile } = useAdmin();
    const orderMoney = useOrderMoney();
    const fmt = orderMoney.formatMoney;
    const fmtOrder = (amount, orderRow) => orderMoney.formatOrderAmount({
        amountUsd: amount,
        paymentMethod: orderRow?.payment_method_specific,
        order: orderRow,
    });
    const idLabel = useMemo(() => {
        const country = resolveEffectiveCountry(branch, companyProfile);
        return getFormStrategy(country).idName;
    }, [branch, companyProfile]);
    const [liveOrder, setLiveOrder] = useState(order);
    const [refreshingOrder, setRefreshingOrder] = useState(false);
    const showVeRateDisclaimer = useMemo(() => {
        const country = resolveEffectiveCountry(branch, companyProfile);
        if (!isVenezuelaCountry(country)) return false;
        if (orderMoney.exchangeRate == null) return false;
        return paymentMethodUsesBolivaresInVenezuela(liveOrder?.payment_method_specific);
    }, [branch, companyProfile, orderMoney.exchangeRate, liveOrder?.payment_method_specific]);
    const highlightReceipt = useMemo(() => {
        const method = liveOrder?.payment_method_specific;
        return paymentMethodRequiresReceipt(method)
            || (liveOrder?.payment_type === 'online' && liveOrder?.payment_ref);
    }, [liveOrder?.payment_method_specific, liveOrder?.payment_type, liveOrder?.payment_ref]);

    useEffect(() => {
        if (!order?.id) {
            setLiveOrder(null);
            return;
        }
        setLiveOrder(order);
        // Si el pedido ya viene con items hidratados desde memoria, evitamos el refetch puntual.
        if (Array.isArray(order.items) && order.items.length > 0) {
            return;
        }
        let cancelled = false;
        setRefreshingOrder(true);
        (async () => {
            try {
                const { data, error } = await supabase
                    .from(TABLES.orders)
                    .select(ORDERS_PANEL_SELECT)
                    .eq('id', order.id)
                    .maybeSingle();
                if (cancelled) return;
                if (error) throw error;
                if (data) setLiveOrder(sanitizeOrder(data));
            } catch {
                /* conservar snapshot del listado */
            } finally {
                if (!cancelled) setRefreshingOrder(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [order?.id]);

    useEffect(() => {
        if (!order) return;
        const onEsc = (e) => {
            if (e.key === 'Escape') onClose?.();
        };
        window.addEventListener('keydown', onEsc);
        return () => window.removeEventListener('keydown', onEsc);
    }, [order, onClose]);

    if (!order || typeof document === 'undefined') return null;

    const items = parseItems(liveOrder?.items);
    const itemCount = items.reduce((acc, i) => acc + (Number(i.quantity) || 1), 0);
    const isDelivery = isOrderDelivery(liveOrder);
    const addrLines = deliveryAddressLines(liveOrder.delivery_address);
    const addrObj =
        liveOrder.delivery_address && typeof liveOrder.delivery_address === 'object' && !Array.isArray(liveOrder.delivery_address)
            ? liveOrder.delivery_address
            : null;
    const mapsUrl = addrObj?.maps_url ? String(addrObj.maps_url).trim() : '';
    const handoff =
        liveOrder.handoff_code != null && String(liveOrder.handoff_code).trim() !== ''
            ? String(liveOrder.handoff_code).trim()
            : '';
    const addressRows = structuredAddressRows(addrObj, addrLines);

    const fulfillmentKind = getOrderFulfillmentKind(liveOrder);
    const fulfillmentLabel = getOrderFulfillmentDisplayLabel(liveOrder);
    const sessionNumber = liveOrder.shift_sequence ?? liveOrder.id;
    const orderRef = formatOrderRef(liveOrder.id);

    const clientPhone = resolveOrderClientPhoneForDisplay(liveOrder);
    const clientRut = resolveOrderClientRutForDisplay(liveOrder);
    const clientDisplay = resolveOrderClientNameForDisplay(liveOrder, fulfillmentKind);
    const showCajaHint = isCajaGenericIdentity(clientRut, clientPhone);
    const whatsAppHref = clientPhone ? buildWhatsAppUrl(clientPhone) : null;

    const paymentDeferred = isOrderPaymentDeferred(liveOrder);
    const paymentLabel = getOrderPaymentDisplayLabel(liveOrder);
    const showPaidBadge = isOrderPaymentSettled(liveOrder);
    const canMarkPaid =
        Boolean(onMarkPaid) &&
        paymentDeferred &&
        isOpenOrderSessionStatus(liveOrder.status);
    const statusLabel = STATUS_LABELS[liveOrder.status] || liveOrder.status || '—';
    const couponCode = resolveOrderCouponCode(liveOrder);
    const createdAt = new Date(liveOrder.created_at);

    const deliveryFee = isDelivery ? Number(liveOrder.delivery_fee) || 0 : 0;
    const taxTotal = Number(liveOrder.tax_total) || 0;
    const discountTotal = Number(liveOrder.discount_total) || 0;
    const total = Number(liveOrder.total) || 0;
    const linesSubtotal = Math.round(items.reduce((sum, item) => sum + getOrderItemLineTotal(item), 0));
    const subtotal = Number(liveOrder.subtotal) > 0 ? Number(liveOrder.subtotal) : linesSubtotal;

    const ticketPrintOpts = (variant) => ({
        variant,
        branchAddress: branch?.address ?? null,
        companyName: companyName ?? null,
        branch,
        company: companyProfile,
        exchangeRate: orderMoney.exchangeRate,
    });

    const shareLocale = useMemo(() => ({
        branch,
        company: companyProfile,
        exchangeRate: orderMoney.exchangeRate,
    }), [branch, companyProfile, orderMoney.exchangeRate]);

    const handleCopyShare = async () => {
        const text = buildOrderWhatsAppShareText(liveOrder, branch?.name, shareLocale);
        try {
            await navigator.clipboard.writeText(text);
            showNotify?.('Resumen del pedido copiado.', 'success');
        } catch {
            showNotify?.('No se pudo copiar el resumen.', 'error');
        }
    };

    const handleDeliveryWhatsApp = async () => {
        const text = buildOrderDeliveryDriverPack(liveOrder, branch?.name ?? null, branch?.address ?? null, shareLocale);
        await shareDeliveryPackViaWhatsApp(text, {
            onError: (msg) => showNotify?.(msg, 'error'),
        });
    };

    const modal = (
        <div className="table-session-modal-portal tenant-theme-vars order-detail-receipt-portal">
            <div
                className="table-session-modal-overlay"
                onClick={onClose}
                role="presentation"
            >
                <div className="admin-layout table-session-modal-portal-host">
                    <div
                        className={`order-detail-panel order-detail-panel--receipt table-session-modal table-session-modal--receipt table-session-modal--${fulfillmentKind}`}
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="order-detail-title"
                    >
                        <header className="table-session-receipt__head">
                            <div className="table-session-receipt__head-text">
                                <h2 id="order-detail-title" className="table-session-receipt__title-row">
                                    <span className="table-session-receipt__title">
                                        {fulfillmentLabel} #{sessionNumber}
                                    </span>
                                    {showPaidBadge ? (
                                        <span className="table-session-receipt__paid-badge" title="Pedido ya pagado">
                                            <PickupBagIcon size={16} aria-hidden />
                                            Pagado
                                        </span>
                                    ) : null}
                                </h2>
                                <p className="table-session-receipt__order-id">
                                    Detalle · Pedido{' '}
                                    <strong className="table-session-receipt__order-code">#{orderRef}</strong>
                                </p>
                                <div className="table-session-receipt__meta">
                                    <span className="order-detail-status-chip">{statusLabel}</span>
                                    <span
                                        className={`table-session-receipt__meta-payment${
                                            paymentDeferred ? ' table-session-receipt__meta-payment--pending' : ''
                                        }`}
                                    >
                                        {paymentLabel}
                                    </span>
                                    <span className="table-session-receipt__meta-sep" aria-hidden>·</span>
                                    <span className="table-session-receipt__meta-item">{clientDisplay.name}</span>
                                    {itemCount > 0 ? (
                                        <>
                                            <span className="table-session-receipt__meta-sep" aria-hidden>·</span>
                                            <span className="table-session-receipt__meta-item">
                                                {itemCount} {itemCount === 1 ? 'ítem' : 'ítems'}
                                            </span>
                                        </>
                                    ) : null}
                                    {couponCode ? (
                                        <>
                                            <span className="table-session-receipt__meta-sep" aria-hidden>·</span>
                                            <span className="table-session-receipt__meta-code">{couponCode}</span>
                                        </>
                                    ) : null}
                                </div>
                            </div>
                            <button
                                type="button"
                                className="table-session-receipt__icon-btn"
                                onClick={onClose}
                                aria-label="Cerrar detalle"
                            >
                                <X size={18} strokeWidth={1.75} />
                            </button>
                        </header>

                        <div className="table-session-receipt__scroll">
                            <section className="table-session-receipt__section">
                                <h3 className="table-session-receipt__section-title">
                                    {fulfillmentKind === 'mesa' ? 'Mesa / Cliente' : 'Cliente'}
                                </h3>
                                {clientDisplay.subtitle ? (
                                    <p className="order-detail-client-subtitle">{clientDisplay.subtitle}</p>
                                ) : null}
                                <dl className="order-detail-receipt-dl">
                                    <div className="order-detail-receipt-dl__row">
                                        <dt>Nombre</dt>
                                        <dd>{clientDisplay.name}</dd>
                                    </div>
                                    <div className="order-detail-receipt-dl__row">
                                        <dt>Teléfono</dt>
                                        <dd className="order-detail-receipt-dl__contact">
                                            {clientPhone ? (
                                                <>
                                                    <span>{clientPhone}</span>
                                                    {whatsAppHref ? (
                                                        <a
                                                            href={whatsAppHref}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="order-detail-wa-btn"
                                                            title="WhatsApp"
                                                            aria-label="WhatsApp"
                                                        >
                                                            <WhatsAppGlyph className="order-detail-wa-glyph" />
                                                        </a>
                                                    ) : null}
                                                </>
                                            ) : (
                                                <span className="order-detail-client-empty">No registrado</span>
                                            )}
                                        </dd>
                                    </div>
                                    <div className="order-detail-receipt-dl__row">
                                        <dt>{idLabel}</dt>
                                        <dd>
                                            {clientRut ? (
                                                clientRut
                                            ) : (
                                                <span className="order-detail-client-empty">No registrado</span>
                                            )}
                                        </dd>
                                    </div>
                                    {branch?.name ? (
                                        <div className="order-detail-receipt-dl__row">
                                            <dt>Sucursal</dt>
                                            <dd>{branch.name}</dd>
                                        </div>
                                    ) : null}
                                    <div className="order-detail-receipt-dl__row">
                                        <dt>Fecha</dt>
                                        <dd>{createdAt.toLocaleString('es-CL')}</dd>
                                    </div>
                                </dl>
                                {showCajaHint ? (
                                    <p className="order-detail-caja-hint">Documento y teléfono genéricos de caja</p>
                                ) : null}
                            </section>

                            <section className="table-session-receipt__section">
                                <h3 className="table-session-receipt__section-title">Entrega</h3>
                                <div className={`order-detail-fulfillment is-${fulfillmentKind}`}>
                                    {fulfillmentKind === 'moto' ? (
                                        <DeliveryMotoIcon size={18} aria-hidden />
                                    ) : fulfillmentKind === 'retiro' ? (
                                        <PickupBagIcon size={18} aria-hidden />
                                    ) : (
                                        <TableRestaurantIcon size={18} aria-hidden />
                                    )}
                                    {fulfillmentLabel}
                                </div>
                                {canMarkPaid ? (
                                    <button
                                        type="button"
                                        className="table-session-receipt__cta order-detail-mark-paid-btn"
                                        onClick={() => onMarkPaid(liveOrder)}
                                    >
                                        <Banknote size={16} aria-hidden />
                                        Marcar pagado
                                    </button>
                                ) : null}
                                {isDelivery && deliveryFee > 0 ? (
                                    <div className="table-session-receipt__total-row">
                                        <span>Cargo envío</span>
                                        <span>{fmt(deliveryFee)}</span>
                                    </div>
                                ) : null}
                            </section>

                            {handoff ? (
                                <section className="table-session-receipt__section">
                                    <h3 className="table-session-receipt__section-title">Código de verificación</h3>
                                    <div className="order-detail-handoff-code">
                                        <KeyRound size={18} className="order-detail-handoff-icon" aria-hidden />
                                        <span className="order-detail-handoff-digits">{handoff}</span>
                                    </div>
                                </section>
                            ) : null}

                            {isDelivery && addressRows.length > 0 ? (
                                <section className="table-session-receipt__section">
                                    <h3 className="table-session-receipt__section-title">Dirección de envío</h3>
                                    <dl className="order-detail-receipt-dl">
                                        {addressRows.map((row) => (
                                            <div key={row.key} className="order-detail-receipt-dl__row">
                                                <dt>{row.label}</dt>
                                                <dd>{row.value}</dd>
                                            </div>
                                        ))}
                                    </dl>
                                    {mapsUrl ? (
                                        <a
                                            href={mapsUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="table-session-receipt__link order-detail-receipt-maps"
                                        >
                                            <MapPin size={16} aria-hidden />
                                            Abrir en mapas
                                            <ExternalLink size={14} aria-hidden />
                                        </a>
                                    ) : null}
                                </section>
                            ) : null}

                            {refreshingOrder && items.length === 0 ? (
                                <section className="table-session-receipt__section" role="status">
                                    <Loader2 size={20} className="animate-spin" aria-hidden />
                                    <span>Cargando ítems…</span>
                                </section>
                            ) : null}

                            {items.length > 0 ? (
                                <section className="table-session-receipt__section">
                                    <h3 className="table-session-receipt__section-title">Ítems pedidos</h3>
                                    <ul className="table-session-receipt__items">
                                        {items.map((item, idx) => {
                                            const itemNote = resolveItemKitchenNote(item, liveOrder.note) ?? '';
                                            return (
                                                <li key={`${item.id ?? idx}-${idx}`} className="table-session-receipt__item">
                                                    <div className="table-session-receipt__item-main">
                                                        <span className="table-session-receipt__item-name">
                                                            {item.quantity}x {item.name}
                                                        </span>
                                                        {itemNote ? (
                                                            <span className="table-session-receipt__item-note">{itemNote}</span>
                                                        ) : null}
                                                    </div>
                                                    <span className="table-session-receipt__item-price">
                                                        {fmt(getOrderItemLineTotal(item))}
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
                                    <span>{fmt(subtotal)}</span>
                                </div>
                                {taxTotal > 0 ? (
                                    <div className="table-session-receipt__total-row">
                                        <span>Impuesto</span>
                                        <span>{fmt(taxTotal)}</span>
                                    </div>
                                ) : null}
                                {deliveryFee > 0 ? (
                                    <div className="table-session-receipt__total-row">
                                        <span>Envío</span>
                                        <span>{fmt(deliveryFee)}</span>
                                    </div>
                                ) : null}
                                {discountTotal > 0 ? (
                                    <div className="table-session-receipt__total-row table-session-receipt__total-row--discount">
                                        <span>Descuento</span>
                                        <span>−{fmt(discountTotal)}</span>
                                    </div>
                                ) : null}
                                <div className="table-session-receipt__total-row table-session-receipt__total-row--final">
                                    <span>Total a pagar</span>
                                    <span>{fmtOrder(total, liveOrder)}</span>
                                </div>
                                {showVeRateDisclaimer ? (
                                    <p className="order-detail-ve-rate-disclaimer order-detail-muted">
                                        Equivalente en Bs. con tasa actual; el checkout no guarda tasa histórica.
                                    </p>
                                ) : null}
                            </section>

                            {isLegacyGlobalKitchenNote(liveOrder) ? (
                                <section className="table-session-receipt__section">
                                    <h3 className="table-session-receipt__section-title">Nota</h3>
                                    <p className="order-detail-receipt-note">{String(liveOrder.note).trim()}</p>
                                </section>
                            ) : null}

                            {(liveOrder.payment_type === 'online' &&
                            liveOrder.payment_ref &&
                            String(liveOrder.payment_ref).startsWith('http')) ||
                            (highlightReceipt && liveOrder.payment_ref && String(liveOrder.payment_ref).startsWith('http')) ? (
                                <section className={`table-session-receipt__section${highlightReceipt ? ' table-session-receipt__section--receipt-highlight' : ''}`}>
                                    <a
                                        href={liveOrder.payment_ref}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="table-session-receipt__link"
                                    >
                                        <ImageIcon size={16} aria-hidden />
                                        {paymentMethodRequiresReceipt(liveOrder.payment_method_specific)
                                            ? 'Ver comprobante de pago (requerido)'
                                            : 'Ver comprobante de pago'}
                                    </a>
                                </section>
                            ) : highlightReceipt && !liveOrder.payment_ref ? (
                                <section className="table-session-receipt__section table-session-receipt__section--receipt-highlight">
                                    <p className="order-detail-muted">
                                        Este método requiere comprobante de pago; aún no hay referencia cargada.
                                    </p>
                                </section>
                            ) : null}
                        </div>

                        <footer className="table-session-receipt__foot order-detail-receipt__foot">
                            <div className="order-detail-receipt-actions">
                                <button
                                    type="button"
                                    className="order-detail-receipt-action"
                                    onClick={() => {
                                        printOrderTicket(liveOrder, branch?.name, logoUrl ?? null, ticketPrintOpts('kitchen'));
                                    }}
                                >
                                    <ChefHat size={16} aria-hidden />
                                    Ticket cocina
                                </button>
                                <button
                                    type="button"
                                    className="order-detail-receipt-action"
                                    onClick={() => {
                                        printOrderTicket(liveOrder, branch?.name, logoUrl ?? null, ticketPrintOpts('cashier'));
                                    }}
                                >
                                    <Banknote size={16} aria-hidden />
                                    Ticket caja
                                </button>
                                <button
                                    type="button"
                                    className="order-detail-receipt-action"
                                    onClick={() => void handleCopyShare()}
                                >
                                    <Copy size={16} aria-hidden />
                                    Copiar
                                </button>
                                {whatsAppHref ? (
                                    <a
                                        href={whatsAppHref}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="order-detail-receipt-action order-detail-receipt-action--whatsapp"
                                    >
                                        <WhatsAppGlyph className="order-detail-wa-glyph order-detail-wa-glyph--btn" />
                                        WhatsApp
                                    </a>
                                ) : null}
                                {isDelivery ? (
                                    <button
                                        type="button"
                                        className="order-detail-receipt-action"
                                        onClick={() => void handleDeliveryWhatsApp()}
                                    >
                                        <Send size={16} aria-hidden />
                                        Envío
                                    </button>
                                ) : null}
                                {liveOrder.payment_type === 'online' && setReceiptModalOrder ? (
                                    <button
                                        type="button"
                                        className="order-detail-receipt-action"
                                        onClick={() => {
                                            setReceiptModalOrder(liveOrder);
                                            onClose?.();
                                        }}
                                    >
                                        <ImageIcon size={16} aria-hidden />
                                        Comprobante
                                    </button>
                                ) : null}
                            </div>
                            <button type="button" className="table-session-receipt__cta" onClick={onClose}>
                                Cerrar
                            </button>
                        </footer>
                    </div>
                </div>
            </div>
        </div>
    );

    return createPortal(modal, document.body);
};

export default OrderDetailModal;
