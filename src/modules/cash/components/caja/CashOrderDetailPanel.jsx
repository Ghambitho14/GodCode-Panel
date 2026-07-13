import React, { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
	X, KeyRound, MapPin, Send, ExternalLink, ChefHat, Banknote, Phone,
} from 'lucide-react';
import { supabase, TABLES } from '@/integrations/supabase';
import { useOrderMoney } from '@/modules/cash/hooks/useOrderMoney';
import { getFormStrategy } from '@/lib/geo/country-forms';
import { useLockBodyScroll } from '@/shared/hooks/useLockBodyScroll';
import {
	isOrderDelivery,
	deliveryAddressLines,
	buildOrderDeliveryDriverPack,
	shareDeliveryPackViaWhatsApp,
	sanitizeOrder,
	getOrderFulfillmentKind,
	getOrderFulfillmentDisplayLabel,
	resolveOrderClientPhoneForDisplay,
	isLegacyGlobalKitchenNote,
	resolveItemKitchenNote,
	ORDERS_PANEL_SELECT,
} from '@/shared/utils/orderUtils';
import { printOrderTicket } from '@/modules/cash/admin/utils/receiptPrinting';
import { buildWhatsAppUrl, normalizePhoneDigits, WhatsAppGlyph } from '@/shared/utils/phoneWhatsApp';
import OrderDetailMetaCards from '../OrderDetailMetaCards';
import '@/modules/cash/styles/OrderCard.css';
import './CashOrderDetailPanel.css';
import { Button } from "@/components/ui/button";

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

/** Separa prefijo [Sucursal: …] del cuerpo de la nota del pedido. */
function splitOrderNote(note) {
	const text = String(note ?? '').trim();
	if (!text) return { branchLine: null, body: '' };
	const match = text.match(/^\[Sucursal:\s*([^\]]+)\]\s*\n?(.*)$/s);
	if (match) {
		return { branchLine: match[1].trim(), body: match[2].trim() };
	}
	return { branchLine: null, body: text };
}

export default function CashOrderDetailPanel({
	order,
	onClose,
	branch = null,
	showNotify,
	logoUrl = null,
	companyName = null,
	companyProfile = null,
}) {
	const orderMoney = useOrderMoney();
	const { formatMoney: fmt, formatOrderAmount } = orderMoney;
	const formStrategy = useMemo(
		() => getFormStrategy(branch?.country ?? companyProfile?.country),
		[branch?.country, companyProfile?.country],
	);
	const idLabel = formStrategy.idName;
	const [liveOrder, setLiveOrder] = useState(order);
	const [refreshingOrder, setRefreshingOrder] = useState(false);

	useLockBodyScroll(Boolean(order));

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
				/* conservar snapshot del movimiento */
			} finally {
				if (!cancelled) setRefreshingOrder(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [order?.id]);

    useEffect(() => {
        const onEsc = (e) => {
            if (e.key === 'Escape') onClose();
        };
        if (order) window.addEventListener('keydown', onEsc);
        return () => window.removeEventListener('keydown', onEsc);
    }, [order, onClose]);

    const shareLocale = useMemo(() => ({
        branch,
        company: companyProfile,
        exchangeRate: orderMoney.exchangeRate,
    }), [branch, companyProfile, orderMoney.exchangeRate]);

    if (!order || typeof document === 'undefined') return null;

    const displayOrder = liveOrder ?? order;
	const items = parseItems(displayOrder.items);
	const isDelivery = isOrderDelivery(displayOrder);
	const addrLines = deliveryAddressLines(displayOrder.delivery_address);
	const addrObj =
		displayOrder.delivery_address && typeof displayOrder.delivery_address === 'object' && !Array.isArray(displayOrder.delivery_address)
			? displayOrder.delivery_address
			: null;
	const mapsUrl = addrObj?.maps_url ? String(addrObj.maps_url).trim() : '';
	const handoff =
		displayOrder.handoff_code != null && String(displayOrder.handoff_code).trim() !== ''
			? String(displayOrder.handoff_code).trim()
			: '';
	const addressRows = structuredAddressRows(addrObj, addrLines);
	const { branchLine: noteBranchLine, body: noteBodyRaw } = splitOrderNote(displayOrder.note);
	const noteBody = isLegacyGlobalKitchenNote(displayOrder) ? noteBodyRaw : '';
	const hasNote = Boolean(noteBranchLine || noteBody);
	const clientPhone = resolveOrderClientPhoneForDisplay(displayOrder);
	const whatsAppHref = clientPhone ? buildWhatsAppUrl(clientPhone) : null;
	const telDigits = clientPhone ? normalizePhoneDigits(clientPhone) : '';
	const telHref = telDigits
		? `tel:+${telDigits.startsWith('56') ? telDigits : `56${telDigits}`}`
		: null;
	const fulfillmentKind = getOrderFulfillmentKind(displayOrder);
	const fulfillmentLabel = getOrderFulfillmentDisplayLabel(displayOrder);
	const sessionNumber = displayOrder.shift_sequence ?? null;

    const ticketPrintOpts = (variant) => ({
        variant,
        branchAddress: branch?.address ?? null,
        companyName: companyName ?? null,
        branch,
        company: companyProfile,
        exchangeRate: orderMoney.exchangeRate,
    });

    const handleDeliveryWhatsApp = async () => {
		const text = buildOrderDeliveryDriverPack(
			displayOrder,
			branch?.name ?? null,
			branch?.address ?? null,
			shareLocale,
		);
		await shareDeliveryPackViaWhatsApp(text, {
			onError: (msg) => showNotify?.(msg, 'error'),
		});
	};

	const panel = (
		<div
			className="admin-layout order-detail-overlay cash-order-detail-overlay"
			onClick={onClose}
			role="presentation"
		>
			<div
				className="order-detail-panel cash-order-detail-drawer"
				onClick={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-labelledby="cash-order-detail-title"
			>
				<div className="order-detail-head">
					<div className="order-detail-head-text">
						<p className="order-detail-eyebrow">Detalle del pedido</p>
						<h2 id="cash-order-detail-title" className="order-detail-title">
							Pedido #{String(displayOrder.id).slice(-4)}
						</h2>
						{sessionNumber != null ? (
							<p className="order-detail-subtitle">
								{fulfillmentLabel} #{sessionNumber}
							</p>
						) : null}
					</div>
					<Button variant="default"
						type="button"
						className="order-detail-close"
						onClick={onClose}
						aria-label="Cerrar"
					>
						<X size={22} strokeWidth={2} />
					</Button>
				</div>

				<div className="order-detail-body">
					<OrderDetailMetaCards
						order={displayOrder}
						branch={branch}
						fmt={fmt}
						idLabel={idLabel}
						phoneVariant="cash"
						statusExtra={
							refreshingOrder ? (
								<span className="order-detail-muted cash-order-detail-status-sync">
									{' '}
									· actualizando…
								</span>
							) : null
						}
					/>

					{handoff ? (
						<div className="order-detail-section order-detail-handoff-block">
							<span className="order-detail-label">Código de verificación</span>
							<div className="order-detail-handoff-code">
								<KeyRound size={18} className="order-detail-handoff-icon" aria-hidden />
								<span className="order-detail-handoff-digits">{handoff}</span>
							</div>
							<p className="order-detail-handoff-hint order-detail-muted">
								Pedir este código al cliente al entregar.
							</p>
						</div>
					) : null}

					{isDelivery && addressRows.length > 0 ? (
						<div className="order-detail-section order-detail-block order-detail-block--address">
							<span className="order-detail-label">Dirección de envío</span>
							<dl className="order-detail-address-grid">
								{addressRows.map((row) => (
									<div key={row.key} className="order-detail-address-row">
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
									className="order-detail-ticket-btn order-detail-maps-link"
								>
									<MapPin size={18} aria-hidden />
									Abrir en mapas
									<ExternalLink size={14} aria-hidden className="order-detail-link-icon" />
								</a>
							) : null}
						</div>
					) : null}

					<div className="order-detail-section order-detail-products">
						<span className="order-detail-label">Productos ({items.length})</span>
						<ul className="order-detail-items">
							{items.map((item, i) => {
								const q = Number(item.quantity) || 1;
								const unit =
									Number(
										item.has_discount && item.discount_price != null
											? item.discount_price
											: item.price,
									) || 0;
								const itemNote = resolveItemKitchenNote(item, displayOrder.note) ?? '';
								return (
									<li key={`${item.id ?? i}-${i}`} className="order-detail-item-row">
										<div className="order-detail-item-main">
											<span className="order-detail-item-qty">{q}x</span>
											<span className="order-detail-item-name">{item.name || 'Producto'}</span>
										</div>
										<span className="order-detail-item-price">{fmt(q * unit)}</span>
										{itemNote ? (
											<div className="order-detail-item-desc order-detail-item-note">
												Nota: {itemNote}
											</div>
										) : null}
									</li>
								);
							})}
						</ul>
					</div>

					{hasNote ? (
						<div className="order-detail-section">
							<span className="order-detail-label">Nota del pedido</span>
							{noteBranchLine ? (
								<p className="order-detail-muted cash-order-detail-note-branch">
									Sucursal: {noteBranchLine}
								</p>
							) : null}
							{noteBody ? <p className="order-detail-note">{noteBody}</p> : null}
						</div>
					) : null}

					<div className="order-detail-section">
						<span className="order-detail-label">Acciones</span>
						<div className="order-detail-ticket-actions">
							<Button variant="default"
								type="button"
								className="order-detail-ticket-btn order-detail-ticket-btn--primary"
								onClick={() => {
									printOrderTicket(displayOrder, branch?.name, logoUrl ?? null, ticketPrintOpts('kitchen'));
								}}
							>
								<ChefHat size={18} aria-hidden />
								Ticket cocina
							</Button>
							<Button variant="default"
								type="button"
								className="order-detail-ticket-btn"
								onClick={() => {
									printOrderTicket(displayOrder, branch?.name, logoUrl ?? null, ticketPrintOpts('cashier'));
								}}
							>
								<Banknote size={18} aria-hidden />
								Ticket caja
							</Button>
							{telHref ? (
								<a href={telHref} className="order-detail-ticket-btn">
									<Phone size={18} aria-hidden />
									Llamar cliente
								</a>
							) : null}
							{whatsAppHref ? (
								<a
									href={whatsAppHref}
									target="_blank"
									rel="noopener noreferrer"
									className="order-detail-ticket-btn"
								>
									<WhatsAppGlyph className="cash-order-detail-wa-glyph cash-order-detail-wa-glyph--btn" />
									WhatsApp cliente
								</a>
							) : null}
							{isDelivery && mapsUrl ? (
								<a
									href={mapsUrl}
									target="_blank"
									rel="noopener noreferrer"
									className="order-detail-ticket-btn"
								>
									<MapPin size={18} aria-hidden />
									Abrir en mapas
								</a>
							) : null}
							{isDelivery ? (
								<Button variant="default"
									type="button"
									className="order-detail-ticket-btn"
									onClick={() => void handleDeliveryWhatsApp()}
								>
									<Send size={18} aria-hidden />
									WhatsApp envío
								</Button>
							) : null}
						</div>
					</div>
				</div>

				<div className="order-detail-foot cash-order-detail-foot">
					<div className="order-detail-total-row cash-order-detail-total-row">
						<span className="order-detail-label order-detail-label--inline">Total</span>
						<span className="order-detail-total">
							{formatOrderAmount({
								amountUsd: displayOrder.total || 0,
								order: displayOrder,
								paymentMethod: displayOrder.payment_method_specific,
							})}
						</span>
					</div>
					<Button variant="default" type="button" className="admin-btn primary order-detail-done" onClick={onClose}>
						Cerrar
					</Button>
				</div>
			</div>
		</div>
	);

	return createPortal(panel, document.body);
}
