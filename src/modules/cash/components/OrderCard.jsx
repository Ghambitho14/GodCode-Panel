import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import {
    Clock, XCircle, Upload, ImageIcon, Printer, Edit2, Copy, Send,
    ChefHat, Banknote, Eye, ChevronDown, ChevronUp, Loader2, CheckCircle2, Check,
} from 'lucide-react';
import OrderDetailModal from './OrderDetailModal';
import CloseTableModal from './CloseTableModal';
import { supabase, TABLES } from '@/integrations/supabase';
import { useOrderMoney } from '@/modules/cash/hooks/useOrderMoney';
import { formatTimeElapsed } from '@/shared/utils/formatters';
import {
    buildOrderWhatsAppShareText,
    buildOrderDeliveryDriverPack,
    shareDeliveryPackViaWhatsApp,
    getPaymentLabel,
    getOrderPaymentDisplayLabel,
    getOrderPaymentPreferenceHint,
    getOrderCouponDiscountMeta,
    getOrderTileKind,
    getOrderFulfillmentDisplayLabel,
    isOrderDelivery,
    isOrderPaymentDeferred,
    isOrderPaymentSettled,
    orderDeliveryKanbanSubtitle,
    resolveItemKitchenNote,
    ORDERS_PANEL_SELECT,
    sanitizeOrder,
} from '@/shared/utils/orderUtils';
import { isOpenOrderSessionStatus } from '@/modules/cash/hooks/manual-order/manualOrderShared';
import { printOrderTicket } from '@/modules/cash/admin/utils/receiptPrinting';
import ManualOrderModal from './ManualOrderModal';
import OrderCardAnchoredMenu from './OrderCardAnchoredMenu';
import { useAdmin } from '@/modules/cash/admin/pages/AdminProvider';
import { Button } from "@/components/ui/button";

function buildItemsSummary(items, { missingItems = false } = {}) {
    const list = Array.isArray(items) ? items : [];
    const count = list.length;
    if (missingItems && count === 0) {
        return { count: 0, text: '' };
    }
    if (count === 0) return { count: 0, text: 'Sin productos' };
    const preview = list
        .slice(0, 2)
        .map((item) => `${item.quantity ?? 1}x ${item.name ?? 'Producto'}`)
        .join(', ');
    const suffix = count > 2 ? '…' : '';
    return {
        count,
        text: `${count} producto${count === 1 ? '' : 's'} · ${preview}${suffix}`,
    };
}

const OrderCard = ({
    order, queueIndex, moveOrder, setReceiptModalOrder, branch, clients,
    logoUrl, companyName, showNotify, products, categories, onOrderSaved,
    localOrderChannels = null,
    gridTile = false,
}) => {
    const { cashSystem, markOrderSessionPaid, closeOrderSession, orders, hydrateOrderItems, companyProfile } = useAdmin();
    const orderMoney = useOrderMoney();
    const shareLocale = useMemo(() => ({
        branch,
        company: companyProfile,
        exchangeRate: orderMoney.exchangeRate,
    }), [branch, companyProfile, orderMoney.exchangeRate]);
    const formatMoney = orderMoney.formatMoney;
    const formatOrderTotal = useCallback(
        (orderRow) => orderMoney.formatOrderAmount({
            amountUsd: orderRow?.total,
            paymentMethod: orderRow?.payment_method_specific,
            order: orderRow,
        }),
        [orderMoney],
    );
    const liveOrder = useMemo(
        () => (orders || []).find((o) => o.id === order.id) ?? order,
        [orders, order],
    );
    const [editWizardOpen, setEditWizardOpen] = useState(false);
    const [ticketMenuOpen, setTicketMenuOpen] = useState(false);
    const [detailOpen, setDetailOpen] = useState(false);
    const [paymentModalIntent, setPaymentModalIntent] = useState(null);
    const [showAllItems, setShowAllItems] = useState(false);
    const [gridExpanded, setGridExpanded] = useState(false);
    const [itemsHydrating, setItemsHydrating] = useState(false);
    const [editPreparing, setEditPreparing] = useState(false);
    const [preparedItemIds, setPreparedItemIds] = useState(new Set());
    const [localItems, setLocalItems] = useState(null);
    const [itemsHydrated, setItemsHydrated] = useState(false);
    const ticketMenuRef = useRef(null);
    const isDelivery = isOrderDelivery(order);
    const deliverySubtitle = isDelivery ? orderDeliveryKanbanSubtitle(order) : '';

    const ticketPrintOpts = (variant) => ({
        variant,
        branchAddress: branch?.address ?? null,
        companyName: companyName ?? null,
        branch,
        company: companyProfile,
        exchangeRate: orderMoney.exchangeRate,
    });

    const menuOpen = ticketMenuOpen;

    const handleMoveToKitchen = (e) => {
        e.stopPropagation();
        printOrderTicket(order, branch?.name, logoUrl ?? null, ticketPrintOpts('kitchen'));
        moveOrder(order.id, 'active');
    };

    const handleCancelOrder = (e) => {
        e?.stopPropagation?.();
        const refundNote = '\n\nSi el pedido tiene venta registrada en caja, se aplicará una devolución automática.';
        const ok = typeof window !== 'undefined'
            ? window.confirm(`¿Cancelar pedido #${String(order.id).slice(-4)}?${refundNote}`)
            : true;
        if (!ok) return;
        moveOrder(order.id, 'cancelled');
    };

    const printKitchenAgain = (e) => {
        e.stopPropagation();
        printOrderTicket(order, branch?.name, logoUrl ?? null, ticketPrintOpts('kitchen'));
        setTicketMenuOpen(false);
    };

    const printTicketCaja = (e) => {
        e.stopPropagation();
        printOrderTicket(order, branch?.name, logoUrl ?? null, ticketPrintOpts('cashier'));
        setTicketMenuOpen(false);
    };

    const handleCopyShare = async (e) => {
        e.stopPropagation();
        const text = buildOrderWhatsAppShareText(order, branch?.name, shareLocale);
        try {
            await navigator.clipboard.writeText(text);
            showNotify?.(
                isDelivery
                    ? 'Resumen copiado (productos, totales y datos de envío).'
                    : 'Resumen del pedido copiado.',
            );
        } catch {
            showNotify?.('No se pudo copiar. Copia manualmente el texto del pedido.', 'error');
        }
    };

    const handleDeliveryWhatsApp = async (e) => {
        e.stopPropagation();
        const text = buildOrderDeliveryDriverPack(order, branch?.name ?? null, branch?.address ?? null, shareLocale);
        await shareDeliveryPackViaWhatsApp(text, {
            onError: (msg) => showNotify?.(msg, 'error'),
        });
    };

    const clientData = useMemo(
        () => clients?.find((c) => c.id === order.client_id),
        [clients, order.client_id],
    );
    const isVip = clientData?.total_orders >= 5;
    const displayItems = localItems ?? liveOrder.items;
    const hasLoadedItems = Array.isArray(displayItems);
    const itemsCount = displayItems?.length ?? 0;
    const itemsSummary = useMemo(
        () => buildItemsSummary(displayItems, { missingItems: !hasLoadedItems }),
        [displayItems, hasLoadedItems],
    );

    const loadOrderItems = useCallback(async (orderId) => {
        if (!orderId) return;
        setItemsHydrating(true);
        try {
            if (hydrateOrderItems) {
                const result = await hydrateOrderItems(orderId);
                if (result?.items && result.items.length > 0) {
                    setLocalItems(result.items);
                    return;
                }
            }
            const { data, error } = await supabase
                .from(TABLES.orders)
                .select(ORDERS_PANEL_SELECT)
                .eq('id', orderId)
                .maybeSingle();
            if (error) throw error;
            if (data) {
                const hydrated = sanitizeOrder(data);
                if (Array.isArray(hydrated.items) && hydrated.items.length > 0) {
                    setLocalItems(hydrated.items);
                }
            }
        } catch (err) {
            console.error('Error loading order items:', err);
            showNotify?.('No se pudieron cargar los productos del pedido', 'error');
        } finally {
            setItemsHydrating(false);
        }
    }, [hydrateOrderItems, showNotify]);

    useEffect(() => {
        setLocalItems(null);
        setPreparedItemIds(new Set());
        setShowAllItems(false);
        setItemsHydrated(false);
    }, [order.id]);

    useEffect(() => {
        if (!liveOrder.id || itemsHydrated) return;
        setItemsHydrated(true);
        loadOrderItems(liveOrder.id);
    }, [liveOrder.id, itemsHydrated, loadOrderItems]);

    useEffect(() => {
        if (liveOrder.status === 'completed' && Array.isArray(displayItems) && displayItems.length > 0) {
            setPreparedItemIds((prev) => {
                const allIndices = new Set(displayItems.map((_, idx) => idx));
                if (prev.size === allIndices.size) return prev;
                return allIndices;
            });
        }
    }, [liveOrder.status, displayItems]);

    const togglePrepared = useCallback((idx) => {
        setPreparedItemIds((prev) => {
            const next = new Set(prev);
            if (next.has(idx)) next.delete(idx);
            else next.add(idx);
            return next;
        });
    }, []);

    const handleGridExpandItems = useCallback(async (e) => {
        e.stopPropagation();
        if (!hasLoadedItems && liveOrder.id) {
            await loadOrderItems(liveOrder.id);
        }
        setGridExpanded(true);
    }, [hasLoadedItems, liveOrder.id, loadOrderItems]);

    const handleOpenEdit = useCallback(async (e) => {
        e.stopPropagation();
        setTicketMenuOpen(false);
        if (!hasLoadedItems && liveOrder.id) {
            setEditPreparing(true);
            try {
                await loadOrderItems(liveOrder.id);
            } catch (err) {
                console.error('Error hydrating order items for edit:', err);
                showNotify?.('No se pudieron cargar los productos del pedido', 'error');
                return;
            } finally {
                setEditPreparing(false);
            }
        }
        setEditWizardOpen(true);
    }, [hasLoadedItems, liveOrder.id, loadOrderItems, showNotify]);

    const discountMeta = useMemo(() => getOrderCouponDiscountMeta(order), [order]);
    const paymentDeferred = isOrderPaymentDeferred(liveOrder);
    const showPaidBadge = isOrderPaymentSettled(liveOrder);
    const paymentMethodLabel = getOrderPaymentDisplayLabel(liveOrder);
    const paymentPreferenceHint = getOrderPaymentPreferenceHint(liveOrder);
    const fulfillmentKind = getOrderTileKind(liveOrder);
    const fulfillmentLabel = getOrderFulfillmentDisplayLabel(liveOrder);
    const canMarkPaid =
        Boolean(markOrderSessionPaid) &&
        paymentDeferred &&
        isOpenOrderSessionStatus(liveOrder.status);

    const openMarkPaidModal = (eOrOrder) => {
        if (eOrOrder?.stopPropagation) eOrOrder.stopPropagation();
        setTicketMenuOpen(false);
        setPaymentModalIntent('pay');
    };

    const handleDeliverClick = (e) => {
        e.stopPropagation();
        if (paymentDeferred && closeOrderSession) {
            setPaymentModalIntent('close');
            return;
        }
        moveOrder(order.id, 'picked_up');
    };

    const handlePaymentModalConfirm = async (targetOrder, paymentPatch) => {
        if (paymentModalIntent === 'pay') {
            const result = await markOrderSessionPaid(targetOrder, paymentPatch);
            if (result) setPaymentModalIntent(null);
            return Boolean(result);
        }
        if (paymentModalIntent === 'close') {
            const ok = await closeOrderSession(targetOrder, paymentPatch);
            if (ok) setPaymentModalIntent(null);
            return ok;
        }
        return false;
    };

    const openDetailModal = (e) => {
        e.stopPropagation();
        setDetailOpen(true);
        setTicketMenuOpen(false);
    };

    const isWebChannel = fulfillmentLabel === 'Web';
    const fulfillmentPill = fulfillmentKind ? (
        <span
            className={`order-fulfillment-pill order-fulfillment-pill--${fulfillmentKind === 'moto' ? 'delivery' : fulfillmentKind}${isWebChannel ? ' order-fulfillment-pill--web' : ''}`}
            title={
                fulfillmentKind === 'moto'
                    ? 'Pedido con envío'
                    : fulfillmentKind === 'retiro'
                      ? 'Retiro en local'
                      : 'Consumo en salón'
            }
        >
            {fulfillmentLabel}
        </span>
    ) : null;

    const paymentMeta = showPaidBadge ? (
        <div className="order-card-payment-stack order-card-payment-stack--inline">
            <span className="order-card-paid-badge" title="Pedido ya pagado">
                <CheckCircle2 size={12} aria-hidden />
                Pagado
            </span>
            <span
                className={`payment-badge payment-badge--settled${order.payment_type === 'online' ? ' online' : ''}`}
            >
                {getPaymentLabel(order)}
            </span>
        </div>
    ) : (
        <div className="order-card-payment-stack order-card-payment-stack--inline">
            {paymentDeferred ? (
                <span className="order-card-unpaid-badge" title="Pago pendiente de cobro en caja">
                    Sin pagar
                </span>
            ) : null}
            {paymentDeferred && paymentPreferenceHint ? (
                <span
                    className="payment-badge payment-badge--pending"
                    title="Método elegido en el menú (preferencia, todavía sin cobrar)"
                >
                    {paymentPreferenceHint}
                </span>
            ) : !paymentDeferred && paymentMethodLabel !== 'Pago pendiente' ? (
                <span className={`payment-badge${order.payment_type === 'online' ? ' online' : ''}`}>
                    {paymentMethodLabel}
                </span>
            ) : null}
        </div>
    );

    const minutesElapsed = Math.floor((new Date() - new Date(order.created_at)) / 60000);
    const timerColorClass =
        minutesElapsed >= 20 ? 'order-time--danger' : minutesElapsed >= 10 ? 'order-time--warning' : '';

    const orderTimeEl = (
        <span className={`order-time${timerColorClass ? ` ${timerColorClass}` : ''}`} title={new Date(order.created_at).toLocaleString()}>
            {!gridTile && queueIndex != null ? (
                <span className="order-queue-badge" title={`Pedido ${queueIndex} en la cola (más antiguo primero)`}>
                    {queueIndex}
                </span>
            ) : null}
            <Clock size={12} />
            <span className="order-time__text">{formatTimeElapsed(order.created_at)}</span>
        </span>
    );

    const headerTools = (
        <>
            <Button variant="default"
                type="button"
                onClick={handleCopyShare}
                className="admin-icon-btn--sm order-card-tool-btn"
                title="Copiar resumen del pedido"
            >
                <Copy size={16} aria-hidden />
            </Button>
            {isDelivery ? (
                <Button variant="default"
                    type="button"
                    onClick={handleDeliveryWhatsApp}
                    className="admin-icon-btn--sm order-card-tool-btn"
                    title="WhatsApp envío"
                    aria-label="Enviar datos de delivery por WhatsApp"
                >
                    <Send size={16} aria-hidden />
                </Button>
            ) : null}
            <div className="order-ticket-menu" ref={ticketMenuRef}>
                <Button variant="default"
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        setTicketMenuOpen((v) => !v);
                    }}
                    className={`admin-icon-btn admin-icon-btn--sm order-card-tool-btn${ticketMenuOpen ? ' is-active' : ''}`}
                    title="Imprimir tickets"
                    aria-expanded={ticketMenuOpen}
                    aria-haspopup="menu"
                    aria-label="Menú imprimir tickets"
                >
                    <Printer size={16} aria-hidden />
                </Button>
                {ticketMenuOpen ? (
                    <OrderCardAnchoredMenu
                        anchorRef={ticketMenuRef}
                        isOpen={ticketMenuOpen}
                        onClose={() => setTicketMenuOpen(false)}
                        menuWidth={200}
                        menuHeight={120}
                    >
                        <Button variant="default" type="button" className="order-ticket-menu-item" role="menuitem" onClick={printKitchenAgain}>
                            <ChefHat size={16} aria-hidden />
                            Ticket cocina
                        </Button>
                        <Button variant="default" type="button" className="order-ticket-menu-item" role="menuitem" onClick={printTicketCaja}>
                            <Banknote size={16} aria-hidden />
                            Ticket caja
                        </Button>
                    </OrderCardAnchoredMenu>
                ) : null}
            </div>
            {gridTile ? (
                <Button variant="default"
                    type="button"
                    onClick={openDetailModal}
                    className="admin-icon-btn--sm order-card-tool-btn"
                    title="Ver detalle del pedido"
                    aria-label="Ver detalle del pedido"
                >
                    <Eye size={16} aria-hidden />
                </Button>
            ) : null}
        </>
    );

    return (
        <div className={`kanban-card glass animate-slide-up${(gridTile ? gridExpanded : true) ? ' kanban-card--expanded' : ''}${menuOpen ? ' kanban-card--menu-open' : ''}${gridTile ? ' kanban-card--grid-tile kanban-card--receipt-clean' : ''} ${order.status === 'pending' ? 'urgent-pulse' : ''}`}>
            <div className="kanban-card-top">
                {gridTile ? (
                    <>
                        <div className="kanban-card-receipt-head">
                            <div className="kanban-card-receipt-head__main">
                                <div className="kanban-card-receipt-title-row">
                                    {queueIndex != null ? (
                                        <span
                                            className="kanban-card-receipt-code"
                                            title={`Pedido ${queueIndex} en la cola (más antiguo primero)`}
                                        >
                                            {queueIndex}
                                        </span>
                                    ) : null}
                                    <h4 className="card-client-name">{order.client_name}</h4>
                                    {isVip ? (
                                        <span className="order-card-vip-badge" title={`Cliente habitual · ${clientData.total_orders} pedidos`}>
                                            VIP
                                        </span>
                                    ) : null}
                                </div>
                                <div className="kanban-card-receipt-meta">
                                    {fulfillmentPill}
                                    {paymentMeta}
                                    <span className="kanban-card-receipt-meta__dot" aria-hidden>·</span>
                                    {orderTimeEl}
                                    <div className="order-card-header-tools order-card-header-tools--receipt-meta">{headerTools}</div>
                                </div>
                            </div>
                        </div>
                        {gridExpanded && deliverySubtitle ? (
                            <div className="order-delivery-mini" title={deliverySubtitle}>
                                {deliverySubtitle}
                            </div>
                        ) : null}
                    </>
                ) : (
                    <>
                        <div className="card-header-row">
                            {orderTimeEl}
                            <div className="order-card-header-tools">
                                {headerTools}
                            </div>
                        </div>

                        {deliverySubtitle ? (
                            <div className="order-delivery-mini" title={deliverySubtitle}>
                                {deliverySubtitle}
                            </div>
                        ) : null}

                        <div className="card-client">
                            <div className="card-client-name-row">
                                <h4 className="card-client-name">{order.client_name}</h4>
                                {isVip ? (
                                    <span className="order-card-vip-badge" title={`Cliente habitual · ${clientData.total_orders} pedidos`}>
                                        VIP
                                    </span>
                                ) : null}
                            </div>
                            <div className="card-kanban-meta-row">
                                {fulfillmentPill}
                                {paymentMeta}
                                <button
                                    type="button"
                                    className="order-detail-link"
                                    onClick={openDetailModal}
                                    title="Ver todo el detalle del pedido"
                                >
                                    Ver detalle
                                </button>
                            </div>
                        </div>

                        <hr className="kanban-card-divider" />
                    </>
                )}
            </div>

            <div className="kanban-card-scroll">
                {gridTile ? (
                    <>
                        {!gridExpanded ? (
                            <div className="card-items-summary card-items-summary--receipt" title={itemsSummary.text}>
                                {itemsSummary.text ? <p className="card-items-summary__text">{itemsSummary.text}</p> : null}
                                {deliverySubtitle ? (
                                    <p className="card-items-summary__delivery" title={deliverySubtitle}>
                                        {deliverySubtitle}
                                    </p>
                                ) : null}
                                <Button variant="default"
                                    type="button"
                                    className="kanban-card-expand-toggle kanban-card-expand-toggle--inline"
                                    onClick={handleGridExpandItems}
                                    aria-expanded={false}
                                    disabled={itemsHydrating}
                                >
                                    {itemsHydrating ? (
                                        <Loader2 size={14} className="animate-spin" aria-hidden />
                                    ) : (
                                        <ChevronDown size={14} aria-hidden />
                                    )}
                                    {hasLoadedItems && itemsCount > 0 ? `Ver más (${itemsCount})` : 'Ver más'}
                                </Button>
                            </div>
                        ) : (
                            <>
                                <div className="card-items card-items--expanded">
                                    {itemsHydrating ? (
                                        <div className="card-items-hydrating">
                                            <Loader2 size={16} className="animate-spin" aria-hidden />
                                            <span>Cargando productos…</span>
                                        </div>
                                    ) : Array.isArray(displayItems) && displayItems.length > 0 ? (
                                    displayItems.map((item, idx) => {
                                        const itemNote = resolveItemKitchenNote(item, liveOrder.note) ?? '';
                                        return (
                                            <div key={idx} className="order-item-row order-item-row--stacked">
                                                <div className="order-item-row__main">
                                                    <span className="qty-circle">{item.quantity}</span>
                                                    <span className="item-name">{item.name}</span>
                                                </div>
                                                {Array.isArray(item.extras) && item.extras.length > 0 ? (
                                                    <div className="order-item-extras">
                                                        {item.extras.map((extra, extraIdx) => (
                                                            <div key={extraIdx} className="order-item-extra-line">
                                                                <span className="order-item-extra-plus">+</span>
                                                                <span>{extra.quantity || 1}x {extra.name}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : null}
                                                {itemNote ? (
                                                    <div className="order-item-note" title={itemNote}>
                                                        <span className="order-item-note-tag">NOTA</span>
                                                        <span className="order-item-note-text">{itemNote}</span>
                                                    </div>
                                                ) : null}
                                            </div>
                                        );
                                    })
                                    ) : (
                                        <p className="card-items-empty">Sin productos</p>
                                    )}
                                    <Button variant="default"
                                        type="button"
                                        className="kanban-card-expand-toggle kanban-card-expand-toggle--inline"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setGridExpanded(false);
                                        }}
                                        aria-expanded
                                    >
                                        <ChevronUp size={14} aria-hidden />
                                        Ver menos
                                    </Button>
                                </div>

                                {order.payment_type === 'online' ? (
                                    <div className="receipt-container receipt-container--kanban">
                                        {order.payment_ref && order.payment_ref.startsWith('http') ? (
                                            <div className="receipt-container__row">
                                                <a href={order.payment_ref} target="_blank" rel="noreferrer" className="receipt-link">
                                                    <ImageIcon size={14} aria-hidden /> Ver Comprobante
                                                </a>
                                                <Button variant="default" type="button" onClick={() => setReceiptModalOrder(order)} className="order-card-receipt-secondary">
                                                    Cambiar
                                                </Button>
                                            </div>
                                        ) : (
                                            <Button variant="default"
                                                type="button"
                                                onClick={() => setReceiptModalOrder(order)}
                                                className="receipt-link receipt-link--optional"
                                                title="Opcional: subir imagen del comprobante"
                                            >
                                                <Upload size={14} aria-hidden /> Comprobante (opcional)
                                            </Button>
                                        )}
                                    </div>
                                ) : null}
                            </>
                        )}
                    </>
                ) : (
                    <>
                        <div className="card-items card-items--always-visible">
                            {itemsHydrating ? (
                                <div className="card-items-hydrating">
                                    <Loader2 size={16} className="animate-spin" aria-hidden />
                                    <span>Cargando productos…</span>
                                </div>
                            ) : !hasLoadedItems || itemsCount === 0 ? (
                                <p className="card-items-empty">Sin productos</p>
                            ) : (
                                <>
                                    {(showAllItems ? displayItems : displayItems.slice(0, 6)).map((item, idx) => {
                                        const itemNote = resolveItemKitchenNote(item, liveOrder.note) ?? '';
                                        const isPrepared = preparedItemIds.has(idx);
                                        const extrasText = Array.isArray(item.extras) && item.extras.length > 0
                                            ? item.extras.map((extra) => `${extra.quantity || 1}x ${extra.name}`).join(', ')
                                            : '';
                                        return (
                                            <div key={idx} className={`order-item-row${isPrepared ? ' order-item-row--prepared' : ''}`}>
                                                <label className="order-item-checkbox-label" title={isPrepared ? 'Marcar como pendiente' : 'Marcar como preparado'}>
                                                    <input
                                                        type="checkbox"
                                                        className="order-item-checkbox"
                                                        checked={isPrepared}
                                                        onChange={() => togglePrepared(idx)}
                                                    />
                                                    <span className={`order-item-checkbox-visual${isPrepared ? ' order-item-checkbox-visual--checked' : ''}`}>
                                                        {isPrepared ? <Check size={11} strokeWidth={3} aria-hidden /> : null}
                                                    </span>
                                                </label>
                                                <div className="order-item-content">
                                                    <div className="order-item-main">
                                                        <span className="order-item-qty">{item.quantity ?? 1}x</span>
                                                        <span className="order-item-name">{item.name ?? 'Producto'}</span>
                                                    </div>
                                                    {(extrasText || itemNote) ? (
                                                        <div className="order-item-meta">
                                                            {extrasText ? <span>{extrasText}</span> : null}
                                                            {itemNote ? <span>{itemNote}</span> : null}
                                                        </div>
                                                    ) : null}
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {itemsCount > 6 && !showAllItems ? (
                                        <button
                                            type="button"
                                            className="order-items-expand-link"
                                            onClick={() => setShowAllItems(true)}
                                        >
                                            +{itemsCount - 6} más
                                        </button>
                                    ) : null}
                                </>
                            )}
                        </div>

                        {order.payment_type === 'online' ? (
                            <div className="receipt-container receipt-container--kanban">
                                {order.payment_ref && order.payment_ref.startsWith('http') ? (
                                    <div className="receipt-container__row">
                                        <a href={order.payment_ref} target="_blank" rel="noreferrer" className="receipt-link">
                                            <ImageIcon size={14} aria-hidden /> Ver Comprobante
                                        </a>
                                        <Button variant="default" type="button" onClick={() => setReceiptModalOrder(order)} className="order-card-receipt-secondary">
                                            Cambiar
                                        </Button>
                                    </div>
                                ) : (
                                    <Button variant="default"
                                        type="button"
                                        onClick={() => setReceiptModalOrder(order)}
                                        className="receipt-link receipt-link--optional"
                                        title="Opcional: subir imagen del comprobante"
                                    >
                                        <Upload size={14} aria-hidden /> Comprobante (opcional)
                                    </Button>
                                )}
                            </div>
                        ) : null}
                    </>
                )}
            </div>

            <div className={`kanban-card-foot${gridTile ? ' kanban-card-receipt-foot' : ''}`}>
                <div className={`card-total${gridTile ? ' kanban-card-receipt-total kanban-card-receipt-total--final' : ''}`}>
                    <span className="total-label">{gridTile ? 'Total' : 'TOTAL'}</span>
                    <div className="card-total-amounts">
                        <span className="total-amount">{formatOrderTotal(liveOrder)}</span>
                        {discountMeta ? (
                            <span
                                className="card-total-before"
                                aria-label={`Precio antes del descuento: ${formatMoney(discountMeta.originalTotal)}, ${discountMeta.discountPercent}% de descuento`}
                            >
                                <span className="card-total-before-price">
                                    {formatMoney(discountMeta.originalTotal)}
                                </span>
                                <span className="card-total-before-pct">-{discountMeta.discountPercent}%</span>
                            </span>
                        ) : null}
                    </div>
                </div>

                <div className="card-actions">
                    {order.status === 'pending' ? (
                        <>
                            <Button variant="default" type="button" onClick={handleCancelOrder} className="btn-icon-action cancel" title="Cancelar Pedido">
                                <XCircle size={16} />
                            </Button>
                            <Button variant="default" type="button" onClick={handleMoveToKitchen} className="btn-action primary">
                                A Cocina
                            </Button>
                        </>
                    ) : null}
                    {order.status === 'active' ? (
                        <>
                            <Button variant="default" type="button" onClick={handleCancelOrder} className="btn-icon-action cancel" title="Cancelar Pedido">
                                <XCircle size={16} />
                            </Button>
                            <Button variant="default" type="button" onClick={() => moveOrder(order.id, 'completed')} className="btn-action success">
                                Pedido Listo
                            </Button>
                        </>
                    ) : null}
                    {order.status === 'completed' ? (
                        <>
                            <Button variant="default" type="button" onClick={handleCancelOrder} className="btn-icon-action cancel" title="Cancelar Pedido">
                                <XCircle size={16} />
                            </Button>
                            <Button variant="default"
                                type="button"
                                onClick={handleDeliverClick}
                                className="btn-action btn-action--deliver"
                            >
                                {paymentDeferred ? 'Cobrar y entregar' : 'Entregado al Cliente'}
                            </Button>
                        </>
                    ) : null}
                    <Button variant="default"
                        type="button"
                        onClick={handleOpenEdit}
                        className="btn-icon-action"
                        title="Editar pedido"
                        aria-label="Editar pedido"
                        disabled={editPreparing}
                    >
                        {editPreparing ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Edit2 size={16} />}
                    </Button>
                </div>
            </div>

            {detailOpen ? (
                <OrderDetailModal
                    order={liveOrder}
                    onClose={() => setDetailOpen(false)}
                    branch={branch}
                    logoUrl={logoUrl ?? null}
                    companyName={companyName}
                    showNotify={showNotify}
                    setReceiptModalOrder={setReceiptModalOrder}
                    onMarkPaid={canMarkPaid ? openMarkPaidModal : null}
                />
            ) : null}

            {paymentModalIntent ? (
                <CloseTableModal
                    isOpen
                    intent={paymentModalIntent}
                    onClose={() => setPaymentModalIntent(null)}
                    order={liveOrder}
                    branch={branch}
                    showNotify={showNotify}
                    onConfirm={handlePaymentModalConfirm}
                />
            ) : null}

            {editWizardOpen ? (
                <ManualOrderModal
                    isOpen={editWizardOpen}
                    editOrder={liveOrder}
                    moveOrder={moveOrder}
                    onClose={() => setEditWizardOpen(false)}
                    products={products}
                    categories={categories}
                    clients={clients}
                    branch={branch}
                    logoUrl={logoUrl ?? null}
                    companyName={companyName}
                    showNotify={showNotify}
                    onOrderSaved={(saved) => {
                        onOrderSaved?.(saved);
                        setEditWizardOpen(false);
                    }}
                    resyncOrderSale={cashSystem?.resyncOrderSale ?? null}
                    localOrderChannels={localOrderChannels}
                />
            ) : null}
        </div>
    );
};

export default React.memo(OrderCard);
