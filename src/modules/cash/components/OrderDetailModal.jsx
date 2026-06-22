import React, { useEffect, useMemo } from 'react';
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
} from 'lucide-react';
import { createMoneyFormatter } from '@/shared/utils/money';
import { buildWhatsAppUrl, WhatsAppGlyph } from '@/shared/utils/phoneWhatsApp';
import {
    isOrderDelivery,
    deliveryAddressLines,
    buildOrderWhatsAppShareText,
    buildOrderDeliveryDriverPack,
    shareDeliveryPackViaWhatsApp,
    getOrderFulfillmentKind,
    getFulfillmentKindLabel,
    getPaymentLabel,
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
    const { formatMoney: fmt } = useMemo(() => createMoneyFormatter(branch), [branch]);

    useEffect(() => {
        if (!order) return;
        const onEsc = (e) => {
            if (e.key === 'Escape') onClose?.();
        };
        window.addEventListener('keydown', onEsc);
        return () => window.removeEventListener('keydown', onEsc);
    }, [order, onClose]);

    if (!order || typeof document === 'undefined') return null;

    const items = parseItems(order.items);
    const itemCount = items.reduce((acc, i) => acc + (Number(i.quantity) || 1), 0);
    const isDelivery = isOrderDelivery(order);
    const addrLines = deliveryAddressLines(order.delivery_address);
    const addrObj =
        order.delivery_address && typeof order.delivery_address === 'object' && !Array.isArray(order.delivery_address)
            ? order.delivery_address
            : null;
    const mapsUrl = addrObj?.maps_url ? String(addrObj.maps_url).trim() : '';
    const handoff =
        order.handoff_code != null && String(order.handoff_code).trim() !== ''
            ? String(order.handoff_code).trim()
            : '';
    const addressRows = structuredAddressRows(addrObj, addrLines);

    const fulfillmentKind = getOrderFulfillmentKind(order);
    const fulfillmentLabel = getFulfillmentKindLabel(fulfillmentKind);
    const sessionNumber = order.shift_sequence ?? order.id;
    const orderRef = formatOrderRef(order.id);

    const clientPhone = resolveOrderClientPhoneForDisplay(order);
    const clientRut = resolveOrderClientRutForDisplay(order);
    const clientDisplay = resolveOrderClientNameForDisplay(order, fulfillmentKind);
    const showCajaHint = isCajaGenericIdentity(clientRut, clientPhone);
    const whatsAppHref = clientPhone ? buildWhatsAppUrl(clientPhone) : null;

    const paymentDeferred = isOrderPaymentDeferred(order);
    const paymentLabel = getPaymentLabel(order);
    const showPaidBadge = isOrderPaymentSettled(order);
    const canMarkPaid =
        Boolean(onMarkPaid) &&
        paymentDeferred &&
        isOpenOrderSessionStatus(order.status);
    const statusLabel = STATUS_LABELS[order.status] || order.status || '—';
    const couponCode = resolveOrderCouponCode(order);
    const createdAt = new Date(order.created_at);

    const deliveryFee = isDelivery ? Number(order.delivery_fee) || 0 : 0;
    const taxTotal = Number(order.tax_total) || 0;
    const discountTotal = Number(order.discount_total) || 0;
    const total = Number(order.total) || 0;
    const linesSubtotal = Math.round(items.reduce((sum, item) => sum + getOrderItemLineTotal(item), 0));
    const subtotal = Number(order.subtotal) > 0 ? Number(order.subtotal) : linesSubtotal;

    const ticketPrintOpts = (variant) => ({
        variant,
        branchAddress: branch?.address ?? null,
        companyName: companyName ?? null,
    });

    const handleCopyShare = async () => {
        const text = buildOrderWhatsAppShareText(order, branch?.name);
        try {
            await navigator.clipboard.writeText(text);
            showNotify?.('Resumen del pedido copiado.', 'success');
        } catch {
            showNotify?.('No se pudo copiar el resumen.', 'error');
        }
    };

    const handleDeliveryWhatsApp = async () => {
        const text = buildOrderDeliveryDriverPack(order, branch?.name ?? null, branch?.address ?? null);
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
                                        <dt>RUT / DNI</dt>
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
                                        onClick={() => onMarkPaid(order)}
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

                            {items.length > 0 ? (
                                <section className="table-session-receipt__section">
                                    <h3 className="table-session-receipt__section-title">Ítems pedidos</h3>
                                    <ul className="table-session-receipt__items">
                                        {items.map((item, idx) => {
                                            const itemNote = resolveItemKitchenNote(item, order.note) ?? '';
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
                                    <span>{fmt(total)}</span>
                                </div>
                            </section>

                            {isLegacyGlobalKitchenNote(order) ? (
                                <section className="table-session-receipt__section">
                                    <h3 className="table-session-receipt__section-title">Nota</h3>
                                    <p className="order-detail-receipt-note">{String(order.note).trim()}</p>
                                </section>
                            ) : null}

                            {order.payment_type === 'online' &&
                            order.payment_ref &&
                            String(order.payment_ref).startsWith('http') ? (
                                <section className="table-session-receipt__section">
                                    <a
                                        href={order.payment_ref}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="table-session-receipt__link"
                                    >
                                        <ImageIcon size={16} aria-hidden />
                                        Ver comprobante de pago
                                    </a>
                                </section>
                            ) : null}
                        </div>

                        <footer className="table-session-receipt__foot order-detail-receipt__foot">
                            <div className="order-detail-receipt-actions">
                                <button
                                    type="button"
                                    className="order-detail-receipt-action"
                                    onClick={() => {
                                        printOrderTicket(order, branch?.name, logoUrl ?? null, ticketPrintOpts('kitchen'));
                                    }}
                                >
                                    <ChefHat size={16} aria-hidden />
                                    Ticket cocina
                                </button>
                                <button
                                    type="button"
                                    className="order-detail-receipt-action"
                                    onClick={() => {
                                        printOrderTicket(order, branch?.name, logoUrl ?? null, ticketPrintOpts('cashier'));
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
                                {order.payment_type === 'online' && setReceiptModalOrder ? (
                                    <button
                                        type="button"
                                        className="order-detail-receipt-action"
                                        onClick={() => {
                                            setReceiptModalOrder(order);
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
