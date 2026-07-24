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
    ShoppingBag,
    Bike,
    UtensilsCrossed,
    MessageCircle,
    CheckCircle2,
} from 'lucide-react';
import { supabase, TABLES } from '@/integrations/supabase';
import { useOrderMoney } from '@/modules/cash/hooks/useOrderMoney';
import { getFormStrategy, paymentMethodRequiresReceipt } from '@/lib/geo/country-forms';
import { isVenezuelaCountry, resolveEffectiveCountry } from '@/lib/geo/tenant-locale';
import { paymentMethodUsesBolivaresInVenezuela } from '@/lib/money/venezuela-payment-copy';
import { useAdmin } from '@/modules/cash/admin/pages/AdminProvider';
import { buildWhatsAppUrl } from '@/shared/utils/phoneWhatsApp';
import { isStorageObjectReference } from '@/shared/utils/supabaseStorage';
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
import { printOrderTicket } from '@/modules/cash/admin/utils/receiptPrinting';
import { Button } from "@/components/ui/button";
import { manualOrderV2Service } from '../services/manualOrderV2Service';
import { orderLifecycleV3Service } from '../services/orderLifecycleV3Service';
import { parseMoneyInput, formatMinor, isoFractionDigits } from '@/lib/money/minor-units';

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
	const { companyProfile, userRole, upsertOrder } = useAdmin();
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
	const [paymentLedger, setPaymentLedger] = useState([]);
	const [refundForm, setRefundForm] = useState({ paymentLineId: '', amount: '', reason: '' });
	const [refunding, setRefunding] = useState(false);
    const [orderLines, setOrderLines] = useState([]);
    const [transitioningLineId, setTransitioningLineId] = useState(null);
    const showVeRateDisclaimer = useMemo(() => {
        const country = resolveEffectiveCountry(branch, companyProfile);
        if (!isVenezuelaCountry(country)) return false;
        if (orderMoney.exchangeRate == null) return false;
        return paymentMethodUsesBolivaresInVenezuela(liveOrder?.payment_method_specific);
    }, [branch, companyProfile, orderMoney.exchangeRate, liveOrder?.payment_method_specific]);
    const hasReceiptFile = isStorageObjectReference(liveOrder?.payment_ref, 'receipts');
    const highlightReceipt = useMemo(() => {
        const method = liveOrder?.payment_method_specific;
        return paymentMethodRequiresReceipt(method)
			|| liveOrder?.payment_lines?.some((line) => line.evidencePolicy === 'required')
			|| Boolean(liveOrder?.payment_evidence_status)
            || (liveOrder?.payment_type === 'online' && hasReceiptFile);
	}, [liveOrder?.payment_method_specific, liveOrder?.payment_type, liveOrder?.payment_lines, liveOrder?.payment_evidence_status, hasReceiptFile]);

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
		if (!order?.id || !liveOrder?.manual_order_mode) { setPaymentLedger([]); return; }
		let cancelled = false;
		manualOrderV2Service.listPaymentLedger(order.id)
			.then((rows) => {
				if (cancelled) return;
				setPaymentLedger(rows);
				setRefundForm((current) => ({ ...current, paymentLineId: current.paymentLineId || rows.find((row) => row.refundableMinor > 0)?.id || '' }));
			})
			.catch(() => { if (!cancelled) setPaymentLedger([]); });
		return () => { cancelled = true; };
	}, [order?.id, liveOrder?.manual_order_mode]);

    useEffect(() => {
        if (!order?.id) {
            setOrderLines([]);
            return;
        }
        let cancelled = false;
        orderLifecycleV3Service.listLines(order.id)
            .then((rows) => {
                if (!cancelled) setOrderLines(rows);
            })
            .catch(() => {
                if (!cancelled) setOrderLines([]);
            });
        return () => {
            cancelled = true;
        };
    }, [order?.id, liveOrder?.updated_at]);

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
    const orderLineById = new Map(
        orderLines.map((line) => [String(line.id), line]),
    );
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
        String(liveOrder.status || '').toLowerCase() !== 'cancelled';
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

    const transitionOrderLine = async (line, targetStatus) => {
        if (!line?.id || transitioningLineId) return;
        setTransitioningLineId(line.id);
        try {
            const result = await orderLifecycleV3Service.transitionLine({
                orderId: liveOrder.id,
                lineId: line.id,
                targetStatus,
                quantity: 1,
                expectedVersion: line.version,
            });
            if (result?.line) {
                setOrderLines((current) =>
                    current.map((row) => (row.id === result.line.id ? result.line : row)),
                );
            }
            if (result?.order) {
                const nextOrder = sanitizeOrder(result.order);
                setLiveOrder(nextOrder);
                upsertOrder?.(nextOrder);
            }
            showNotify?.(
                targetStatus === 'preparing'
                    ? 'Producto enviado a preparación.'
                    : targetStatus === 'ready'
                        ? 'Producto marcado como listo.'
                        : 'Producto marcado como servido.',
                'success',
            );
        } catch (error) {
            showNotify?.(error?.message || 'No se pudo actualizar el producto.', 'error');
            try {
                setOrderLines(await orderLifecycleV3Service.listLines(liveOrder.id));
            } catch {
                // Se conserva el último estado visible.
            }
        } finally {
            setTransitioningLineId(null);
        }
    };

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

	const canRefund = ['ceo', 'owner', 'admin'].includes(String(userRole || '').toLowerCase())
		&& paymentLedger.some((line) => line.refundableMinor > 0);

	const handleRefund = async () => {
		const line = paymentLedger.find((row) => row.id === refundForm.paymentLineId);
		if (!line) { showNotify?.('Selecciona una línea de pago con saldo.', 'warning'); return; }
		const parsed = parseMoneyInput(refundForm.amount, {
			currency: liveOrder.currency,
			fractionDigits: isoFractionDigits(liveOrder.currency),
		});
		if (!parsed.valid || parsed.minor <= 0 || parsed.minor > line.refundableMinor) {
			showNotify?.('El monto debe ser mayor que cero y no superar el saldo de esa línea.', 'warning');
			return;
		}
		if (refundForm.reason.trim().length < 3) { showNotify?.('Indica el motivo de la devolución.', 'warning'); return; }
		setRefunding(true);
		try {
			await manualOrderV2Service.refund(liveOrder.id, {
				amountMinor: parsed.minor,
				paymentLineId: line.id,
				reason: refundForm.reason.trim(),
			});
			const [{ data, error }, ledger] = await Promise.all([
				supabase.from(TABLES.orders).select(ORDERS_PANEL_SELECT).eq('id', liveOrder.id).maybeSingle(),
				manualOrderV2Service.listPaymentLedger(liveOrder.id),
			]);
			if (error) throw error;
			const refreshed = sanitizeOrder(data);
			setLiveOrder(refreshed);
			setPaymentLedger(ledger);
			upsertOrder?.(refreshed);
			setRefundForm({ paymentLineId: ledger.find((row) => row.refundableMinor > 0)?.id || '', amount: '', reason: '' });
			showNotify?.('Devolución registrada en caja.', 'success');
		} catch (error) {
			showNotify?.(error?.message || 'No se pudo registrar la devolución.', 'error');
		} finally {
			setRefunding(false);
		}
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
                                            <CheckCircle2 size={16} aria-hidden />
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
                            <Button variant="default"
                                type="button"
                                className="table-session-receipt__icon-btn"
                                onClick={onClose}
                                aria-label="Cerrar detalle"
                            >
                                <X size={18} strokeWidth={1.75} />
                            </Button>
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
                                                            <MessageCircle size={16} className="order-detail-wa-glyph" aria-hidden />
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
                                        <Bike size={18} aria-hidden />
                                    ) : fulfillmentKind === 'retiro' ? (
                                        <ShoppingBag size={18} aria-hidden />
                                    ) : (
                                        <UtensilsCrossed size={18} aria-hidden />
                                    )}
                                    {fulfillmentLabel}
                                </div>
                                {canMarkPaid ? (
                                    <Button variant="default"
                                        type="button"
                                        className="table-session-receipt__cta order-detail-mark-paid-btn"
                                        onClick={() => onMarkPaid(liveOrder)}
                                    >
                                        <Banknote size={16} aria-hidden />
                                        Marcar pagado
                                    </Button>
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
                                            const lifecycleLine = orderLineById.get(String(item.line_id ?? item.lineId ?? ''));
                                            const pendingQuantity = lifecycleLine
                                                ? Math.max(
                                                    0,
                                                    Number(lifecycleLine.quantity_ordered)
                                                        - Number(lifecycleLine.quantity_preparing)
                                                        - Number(lifecycleLine.quantity_prepared)
                                                        - Number(lifecycleLine.quantity_served),
                                                )
                                                : 0;
                                            const lineBusy = transitioningLineId === lifecycleLine?.id;
                                            return (
                                                <li key={`${item.id ?? idx}-${idx}`} className="table-session-receipt__item">
                                                    <div className="table-session-receipt__item-main">
                                                        <span className="table-session-receipt__item-name">
                                                            {item.quantity}x {item.name}
                                                        </span>
                                                        {itemNote ? (
                                                            <span className="table-session-receipt__item-note">{itemNote}</span>
                                                        ) : null}
                                                        {lifecycleLine ? (
                                                            <div className="order-line-lifecycle" aria-label={`Preparación de ${item.name}`}>
                                                                <span className={`order-line-lifecycle__status is-${lifecycleLine.status}`}>
                                                                    {lifecycleLine.status === 'preparing'
                                                                        ? 'Preparando'
                                                                        : lifecycleLine.status === 'ready'
                                                                            ? 'Listo'
                                                                            : lifecycleLine.status === 'served'
                                                                                ? 'Servido'
                                                                                : lifecycleLine.status === 'voided'
                                                                                    ? 'Anulado'
                                                                                    : lifecycleLine.status === 'legacy_unknown'
                                                                                        ? 'Estado heredado'
                                                                                        : 'Pendiente'}
                                                                </span>
                                                                <span className="order-line-lifecycle__counts">
                                                                    Pte. {pendingQuantity}
                                                                    {' · '}Prep. {Number(lifecycleLine.quantity_preparing) || 0}
                                                                    {' · '}Listo {Number(lifecycleLine.quantity_prepared) || 0}
                                                                    {' · '}Servido {Number(lifecycleLine.quantity_served) || 0}
                                                                </span>
                                                                <div className="order-line-lifecycle__actions">
                                                                    {pendingQuantity > 0 ? (
                                                                        <Button
                                                                            type="button"
                                                                            variant="outline"
                                                                            size="sm"
                                                                            disabled={lineBusy}
                                                                            onClick={() => transitionOrderLine(lifecycleLine, 'preparing')}
                                                                        >
                                                                            {lineBusy ? <Loader2 size={14} className="animate-spin" /> : <ChefHat size={14} />}
                                                                            Preparar 1
                                                                        </Button>
                                                                    ) : null}
                                                                    {Number(lifecycleLine.quantity_preparing) > 0 ? (
                                                                        <Button
                                                                            type="button"
                                                                            variant="outline"
                                                                            size="sm"
                                                                            disabled={lineBusy}
                                                                            onClick={() => transitionOrderLine(lifecycleLine, 'ready')}
                                                                        >
                                                                            <CheckCircle2 size={14} />
                                                                            Marcar 1 listo
                                                                        </Button>
                                                                    ) : null}
                                                                    {Number(lifecycleLine.quantity_prepared) > 0 ? (
                                                                        <Button
                                                                            type="button"
                                                                            variant="outline"
                                                                            size="sm"
                                                                            disabled={lineBusy}
                                                                            onClick={() => transitionOrderLine(lifecycleLine, 'served')}
                                                                        >
                                                                            <UtensilsCrossed size={14} />
                                                                            Servir 1
                                                                        </Button>
                                                                    ) : null}
                                                                </div>
                                                            </div>
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
										{liveOrder.manual_order_mode ? 'La conversión usa la tasa histórica guardada en cada línea de pago.' : 'Equivalente en Bs. con tasa actual; este pedido histórico no guardó la tasa usada.'}
                                    </p>
                                ) : null}
                            </section>

                            {isLegacyGlobalKitchenNote(liveOrder) ? (
                                <section className="table-session-receipt__section">
                                    <h3 className="table-session-receipt__section-title">Nota</h3>
                                    <p className="order-detail-receipt-note">{String(liveOrder.note).trim()}</p>
                                </section>
                            ) : null}

							{highlightReceipt && (hasReceiptFile || liveOrder.payment_evidence_status === 'uploaded') ? (
                                <section className={`table-session-receipt__section${highlightReceipt ? ' table-session-receipt__section--receipt-highlight' : ''}`}>
									<Button variant="default" type="button"
										onClick={() => { setReceiptModalOrder?.(liveOrder); onClose?.(); }}
                                        className="table-session-receipt__link"
                                    >
                                        <ImageIcon size={16} aria-hidden />
                                        {paymentMethodRequiresReceipt(liveOrder.payment_method_specific)
                                            ? 'Ver comprobante de pago (requerido)'
                                            : 'Ver comprobante de pago'}
									</Button>
                                </section>
							) : highlightReceipt ? (
                                <section className="table-session-receipt__section table-session-receipt__section--receipt-highlight">
                                    <p className="order-detail-muted">
										{liveOrder.payment_evidence_status === 'failed' ? 'El comprobante falló y está pendiente de reintento.' : 'Este método admite comprobante; aún no está persistido.'}
                                    </p>
                                </section>
                            ) : null}

							{canRefund ? (
								<details className="table-session-receipt__section">
									<summary className="cursor-pointer font-semibold">Registrar devolución autorizada</summary>
									<div className="mt-3 grid gap-3">
										<label className="grid gap-1 text-sm">
											<span>Línea de pago</span>
											<select className="rounded-lg border border-gc-border bg-gc-card p-2" value={refundForm.paymentLineId}
												onChange={(event) => setRefundForm((current) => ({ ...current, paymentLineId: event.target.value }))}>
												{paymentLedger.filter((line) => line.refundableMinor > 0).map((line) => (
													<option key={line.id} value={line.id}>{line.method_id} · disponible {formatMinor(line.refundableMinor, { currency: liveOrder.currency })}</option>
												))}
											</select>
										</label>
										<label className="grid gap-1 text-sm"><span>Monto</span><input className="rounded-lg border border-gc-border bg-gc-card p-2" inputMode="decimal" value={refundForm.amount} onChange={(event) => setRefundForm((current) => ({ ...current, amount: event.target.value }))} /></label>
										<label className="grid gap-1 text-sm"><span>Motivo</span><textarea className="rounded-lg border border-gc-border bg-gc-card p-2" maxLength={300} value={refundForm.reason} onChange={(event) => setRefundForm((current) => ({ ...current, reason: event.target.value }))} /></label>
										<Button variant="destructive" type="button" disabled={refunding} onClick={() => void handleRefund()}>{refunding ? 'Registrando…' : 'Confirmar devolución'}</Button>
									</div>
								</details>
							) : null}
                        </div>

                        <footer className="table-session-receipt__foot order-detail-receipt__foot">
                            <div className="order-detail-receipt-actions">
                                <Button variant="default"
                                    type="button"
                                    className="order-detail-receipt-action"
                                    onClick={() => {
                                        printOrderTicket(liveOrder, branch?.name, logoUrl ?? null, ticketPrintOpts('kitchen'));
                                    }}
                                >
                                    <ChefHat size={16} aria-hidden />
                                    Ticket cocina
                                </Button>
                                <Button variant="default"
                                    type="button"
                                    className="order-detail-receipt-action"
                                    onClick={() => {
                                        printOrderTicket(liveOrder, branch?.name, logoUrl ?? null, ticketPrintOpts('cashier'));
                                    }}
                                >
                                    <Banknote size={16} aria-hidden />
                                    Ticket caja
                                </Button>
                                <Button variant="default"
                                    type="button"
                                    className="order-detail-receipt-action"
                                    onClick={() => void handleCopyShare()}
                                >
                                    <Copy size={16} aria-hidden />
                                    Copiar
                                </Button>
                                {whatsAppHref ? (
                                    <a
                                        href={whatsAppHref}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="order-detail-receipt-action order-detail-receipt-action--whatsapp"
                                    >
                                        <MessageCircle size={18} className="order-detail-wa-glyph order-detail-wa-glyph--btn" aria-hidden />
                                        WhatsApp
                                    </a>
                                ) : null}
                                {isDelivery ? (
                                    <Button variant="default"
                                        type="button"
                                        className="order-detail-receipt-action"
                                        onClick={() => void handleDeliveryWhatsApp()}
                                    >
                                        <Send size={16} aria-hidden />
                                        Envío
                                    </Button>
                                ) : null}
								{highlightReceipt && setReceiptModalOrder ? (
                                    <Button variant="default"
                                        type="button"
                                        className="order-detail-receipt-action"
                                        onClick={() => {
                                            setReceiptModalOrder(liveOrder);
                                            onClose?.();
                                        }}
                                    >
                                        <ImageIcon size={16} aria-hidden />
                                        Comprobante
                                    </Button>
                                ) : null}
                            </div>
                            <Button variant="default" type="button" className="table-session-receipt__cta" onClick={onClose}>
                                Cerrar
                            </Button>
                        </footer>
                    </div>
                </div>
            </div>
        </div>
    );

    return createPortal(modal, document.body);
};

export default OrderDetailModal;
