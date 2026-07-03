import React, { useState, useRef, useMemo, useCallback } from 'react';
import {
    Clock, XCircle, Upload, ImageIcon, Printer, Edit2, Copy, Send,
    ChefHat, Banknote, Eye, ChevronDown, ChevronUp, Loader2,
} from 'lucide-react';
import OrderDetailModal from './OrderDetailModal';
import CloseTableModal from './CloseTableModal';
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
} from '@/shared/utils/orderUtils';
import PickupBagIcon from './PickupBagIcon';
import { isOpenOrderSessionStatus } from '@/modules/cash/hooks/manual-order/manualOrderShared';
import { printOrderTicket } from '@/modules/cash/admin/utils/receiptPrinting';
import ManualOrderModal from './ManualOrderModal';
import OrderCardAnchoredMenu from './OrderCardAnchoredMenu';
import { useAdmin } from '@/modules/cash/admin/pages/AdminProvider';

function buildItemsSummary(items, { missingItems = false } = {}) {
    const list = Array.isArray(items) ? items : [];
    const count = list.length;
    if (missingItems && count === 0) {
        return { count: 0, text: 'Tocá Ver más para ver productos' };
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
    const [expanded, setExpanded] = useState(false);
    const [itemsHydrating, setItemsHydrating] = useState(false);
    const [editPreparing, setEditPreparing] = useState(false);
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
    const hasLoadedItems = Array.isArray(liveOrder.items) && liveOrder.items.length > 0;
    const itemsSummary = useMemo(
        () => buildItemsSummary(liveOrder.items, { missingItems: !hasLoadedItems }),
        [liveOrder.items, hasLoadedItems],
    );

    const handleExpandItems = useCallback(async (e) => {
        e.stopPropagation();
        if (!hasLoadedItems && hydrateOrderItems) {
            setItemsHydrating(true);
            try {
                await hydrateOrderItems(order.id);
            } catch (err) {
                console.error('Error hydrating order items:', err);
                showNotify?.('No se pudieron cargar los productos del pedido', 'error');
            } finally {
                setItemsHydrating(false);
            }
        }
        setExpanded(true);
    }, [hasLoadedItems, hydrateOrderItems, order.id, showNotify]);

    const handleOpenEdit = useCallback(async (e) => {
        e.stopPropagation();
        setTicketMenuOpen(false);
        if (!hasLoadedItems && hydrateOrderItems) {
            setEditPreparing(true);
            try {
                await hydrateOrderItems(order.id);
            } catch (err) {
                console.error('Error hydrating order items for edit:', err);
                showNotify?.('No se pudieron cargar los productos del pedido', 'error');
                return;
            } finally {
                setEditPreparing(false);
            }
        }
        setEditWizardOpen(true);
    }, [hasLoadedItems, hydrateOrderItems, order.id, showNotify]);

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

    const fulfillmentPill = fulfillmentKind ? (
        <span
            className={`order-fulfillment-pill order-fulfillment-pill--${fulfillmentKind === 'moto' ? 'delivery' : fulfillmentKind}`}
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
                <PickupBagIcon size={12} aria-hidden />
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

    const orderTimeEl = (
        <span className="order-time" title={new Date(order.created_at).toLocaleString()}>
            {!gridTile && queueIndex != null ? (
                <span className="order-queue-badge" title={`Pedido ${queueIndex} en la cola (más antiguo primero)`}>
                    {queueIndex}
                </span>
            ) : null}
            <Clock size={12} />
            {formatTimeElapsed(order.created_at)}
        </span>
    );

    const headerTools = (
        <>
            <button
                type="button"
                onClick={handleCopyShare}
                className="admin-icon-btn admin-icon-btn--sm order-card-tool-btn"
                title="Copiar resumen del pedido"
            >
                <Copy size={14} aria-hidden />
            </button>
            {isDelivery ? (
                <button
                    type="button"
                    onClick={handleDeliveryWhatsApp}
                    className="admin-icon-btn admin-icon-btn--sm order-card-tool-btn"
                    title="WhatsApp envío"
                    aria-label="Enviar datos de delivery por WhatsApp"
                >
                    <Send size={14} aria-hidden />
                </button>
            ) : null}
            <div className="order-ticket-menu" ref={ticketMenuRef}>
                <button
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
                    <Printer size={14} aria-hidden />
                </button>
                {ticketMenuOpen ? (
                    <OrderCardAnchoredMenu
                        anchorRef={ticketMenuRef}
                        isOpen={ticketMenuOpen}
                        onClose={() => setTicketMenuOpen(false)}
                        menuWidth={200}
                        menuHeight={120}
                    >
                        <button type="button" className="order-ticket-menu-item" role="menuitem" onClick={printKitchenAgain}>
                            <ChefHat size={16} aria-hidden />
                            Ticket cocina
                        </button>
                        <button type="button" className="order-ticket-menu-item" role="menuitem" onClick={printTicketCaja}>
                            <Banknote size={16} aria-hidden />
                            Ticket caja
                        </button>
                    </OrderCardAnchoredMenu>
                ) : null}
            </div>
            {gridTile ? (
                <button
                    type="button"
                    onClick={openDetailModal}
                    className="admin-icon-btn admin-icon-btn--sm order-card-tool-btn"
                    title="Ver detalle del pedido"
                    aria-label="Ver detalle del pedido"
                >
                    <Eye size={14} aria-hidden />
                </button>
            ) : null}
        </>
    );

    return (
        <div className={`kanban-card glass animate-slide-up${expanded ? ' kanban-card--expanded' : ''}${menuOpen ? ' kanban-card--menu-open' : ''}${gridTile ? ' kanban-card--grid-tile kanban-card--receipt-clean' : ''} ${order.status === 'pending' ? 'urgent-pulse' : ''}`}>
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
                                </div>
                            </div>
                            <div className="order-card-header-tools">{headerTools}</div>
                        </div>
                        {expanded && deliverySubtitle ? (
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
                                {paymentMeta}
                            </div>
                        </div>

                        {expanded && deliverySubtitle ? (
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
                                <button
                                    type="button"
                                    className="order-detail-trigger"
                                    onClick={openDetailModal}
                                    title="Ver todo el detalle del pedido"
                                >
                                    <Eye size={12} aria-hidden />
                                    Ver detalle
                                </button>
                            </div>
                        </div>

                        <hr className="kanban-card-divider" />
                    </>
                )}
            </div>

            <div className="kanban-card-scroll">
                {!expanded ? (
                    <div className={`card-items-summary${gridTile ? ' card-items-summary--receipt' : ''}`} title={itemsSummary.text}>
                        <p className="card-items-summary__text">{itemsSummary.text}</p>
                        {deliverySubtitle ? (
                            <p className="card-items-summary__delivery" title={deliverySubtitle}>
                                {deliverySubtitle}
                            </p>
                        ) : null}
                        <button
                            type="button"
                            className="kanban-card-expand-toggle kanban-card-expand-toggle--inline"
                            onClick={handleExpandItems}
                            aria-expanded={false}
                            disabled={itemsHydrating}
                        >
                            {itemsHydrating ? (
                                <Loader2 size={14} className="animate-spin" aria-hidden />
                            ) : (
                                <ChevronDown size={14} aria-hidden />
                            )}
                            {hasLoadedItems ? `Ver más (${itemsSummary.count})` : 'Ver más'}
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="card-items card-items--expanded">
                            {itemsHydrating ? (
                                <div className="card-items-hydrating">
                                    <Loader2 size={16} className="animate-spin" aria-hidden />
                                    <span>Cargando productos…</span>
                                </div>
                            ) : Array.isArray(liveOrder.items) && liveOrder.items.length > 0 ? (
                            liveOrder.items.map((item, idx) => {
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
                            <button
                                type="button"
                                className="kanban-card-expand-toggle kanban-card-expand-toggle--inline"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setExpanded(false);
                                }}
                                aria-expanded
                            >
                                <ChevronUp size={14} aria-hidden />
                                Ver menos
                            </button>
                        </div>

                        {order.payment_type === 'online' ? (
                            <div className="receipt-container receipt-container--kanban">
                                {order.payment_ref && order.payment_ref.startsWith('http') ? (
                                    <div className="receipt-container__row">
                                        <a href={order.payment_ref} target="_blank" rel="noreferrer" className="receipt-link">
                                            <ImageIcon size={14} aria-hidden /> Ver Comprobante
                                        </a>
                                        <button type="button" onClick={() => setReceiptModalOrder(order)} className="order-card-receipt-secondary">
                                            Cambiar
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => setReceiptModalOrder(order)}
                                        className="receipt-link receipt-link--optional"
                                        title="Opcional: subir imagen del comprobante"
                                    >
                                        <Upload size={14} aria-hidden /> Comprobante (opcional)
                                    </button>
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
                            <button type="button" onClick={handleCancelOrder} className="btn-icon-action cancel" title="Cancelar Pedido">
                                <XCircle size={16} />
                            </button>
                            <button type="button" onClick={handleMoveToKitchen} className="btn-action primary">
                                A Cocina
                            </button>
                        </>
                    ) : null}
                    {order.status === 'active' ? (
                        <>
                            <button type="button" onClick={handleCancelOrder} className="btn-icon-action cancel" title="Cancelar Pedido">
                                <XCircle size={16} />
                            </button>
                            <button type="button" onClick={() => moveOrder(order.id, 'completed')} className="btn-action success">
                                Pedido Listo
                            </button>
                        </>
                    ) : null}
                    {order.status === 'completed' ? (
                        <>
                            <button type="button" onClick={handleCancelOrder} className="btn-icon-action cancel" title="Cancelar Pedido">
                                <XCircle size={16} />
                            </button>
                            <button
                                type="button"
                                onClick={handleDeliverClick}
                                className="btn-action btn-action--deliver"
                            >
                                {paymentDeferred ? 'Cobrar y entregar' : 'Entregado al Cliente'}
                            </button>
                        </>
                    ) : null}
                    <button
                        type="button"
                        onClick={handleOpenEdit}
                        className="btn-icon-action"
                        title="Editar pedido"
                        aria-label="Editar pedido"
                        disabled={editPreparing}
                    >
                        {editPreparing ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Edit2 size={16} />}
                    </button>
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
