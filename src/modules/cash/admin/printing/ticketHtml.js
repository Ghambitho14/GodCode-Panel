import { CONTENT_MM, escapeHtml, resolveSafeLogoUrl } from './thermalUtils';
import { CASHIER_TICKET_DESIGN, resolveCashierTicketDesign, resolveTicketShowDeliveryCode } from './ticketDesigns';
import { isLegacyGlobalKitchenNote, isOrderDelivery } from '@/shared/utils/orderUtils';
import { createMoneyFormatter } from '@/shared/utils/money';
import {
	clientPhoneForTicket,
	clientReferenceLineHtml,
	companyOrderNumberForTicket,
	createFmtOrder,
	cssThermalBase,
	deliveryShipmentSectionHtml,
	formatOrderNumberForTicket,
	formatTicketDate,
	formatTicketDateTime,
	formatTicketDateTimeDash,
	formatTicketTime,
	orderChannelForTicket,
	plainItemNote,
	stripInternalNoteHints,
	summarizeAmounts,
	ticketPaymentStatusLabel,
	whereLabelForClientTicket,
	whereLabelForKitchenTicket,
} from './ticketFormatters';

/**
 * @param {Record<string, unknown>} order
 * @param {string} branchName
 * @param {string | null} logoUrl
 * @param {import('./thermalUtils').TicketVariant} variant
 * @param {{
 *   branchAddress?: string | null;
 *   ticketFooterLine?: string | null;
 *   orderChannel?: string | null;
 *   companyName?: string | null;
 *   branch?: object | null;
 *   company?: object | null;
 *   exchangeRate?: unknown;
 * }} [printOptions]
 */
export function buildTicketHtml(order, branchName, logoUrl, variant, printOptions = {}) {
	const fmt = createFmtOrder(printOptions);
	/* El ticket impreso es lo que se lleva el cliente: la fecha va en el formato
	   de su pais, no en el chileno que estaba fijado. Mismo origen que fmt. */
	const { locale } = createMoneyFormatter(printOptions.branch ?? null, printOptions.company ?? null);
	// El titulo grande del ticket cliente muestra el nombre de la EMPRESA
	// (companyName). La sucursal ya viaja en el prefijo `[Sucursal: X]` de
	// la nota; no queremos duplicarla. Si nadie pasa `companyName`, caemos al
	// `branchName` por compat con callers viejos.
	const companyNameRaw =
		printOptions.companyName != null ? String(printOptions.companyName).trim() : '';
	const headerName = companyNameRaw || branchName || 'NOMBRE DEL LOCAL';
	const safeBranchName = escapeHtml(headerName);
	const safeOrderId = escapeHtml(formatOrderNumberForTicket(order));
	const safeClientName = escapeHtml(order.client_name || 'Mostrador');
	// Misma limpieza que el ticket de cocina: descartamos los prefijos
	// `[Sucursal: ...]` y `[Envío: $...]` para que el cliente solo vea la nota
	// real escrita por el cajero. La sucursal aparece en el h1 y el envio en
	// la fila de totales.
	const safeOrderNote = isLegacyGlobalKitchenNote(order) && order.note
		? escapeHtml(stripInternalNoteHints(order.note))
		: '';
	const logoMaxWidthMm = CONTENT_MM <= 50 ? 40 : 56;
	const logoMaxHeightMm = 13;
	const safeLogoUrl = variant === 'cashier' ? resolveSafeLogoUrl(logoUrl) : '';
	const showDeliveryCode = resolveTicketShowDeliveryCode(printOptions);
	// La comanda de cocina sigue el diseño elegido para el ticket de caja.
	const design = resolveCashierTicketDesign(printOptions);

	// Comanda «Clásica»: centrada, con banda punteada y letra de máquina.
	if (variant === 'kitchen' && design === CASHIER_TICKET_DESIGN.classic) {
		// Banda: #n - COCINA - MESA|RETIRO|DELIVERY - WEB|PDV
		const fulfillmentEsc = escapeHtml(whereLabelForKitchenTicket(order));
		const channelEsc = escapeHtml(orderChannelForTicket(order, printOptions.orderChannel));
		const orderBandLine = `#${safeOrderId} - COCINA - ${fulfillmentEsc} - ${channelEsc}`;
		const refLineHtml = clientReferenceLineHtml(order, { showDeliveryCode });
		const dateDash = escapeHtml(formatTicketDateTimeDash(order, locale));
		const safeKitchenNote = isLegacyGlobalKitchenNote(order) && order.note
			? escapeHtml(stripInternalNoteHints(order.note))
			: '';

		const itemsKitchen = (order.items || []).map((item) => {
			const safeQuantity = Number(item.quantity) || 1;
			const safeName = escapeHtml(String(item.name || '').toUpperCase());
			let extrasHtml = '';
			if (Array.isArray(item.extras) && item.extras.length > 0) {
				extrasHtml = item.extras.map((extra) => {
					const extraQty = Number(extra.quantity) || 1;
					const extraName = escapeHtml(String(extra.name || 'Extra').toUpperCase());
					if (extra.kind === 'change') return `<div class="k-extra">* ${extraName}${extraQty > 1 ? ` (X${extraQty})` : ''}</div>`;
					return `<div class="k-extra">+ ${extraQty}x ${extraName}</div>`;
				}).join('');
			}
			const noteRaw = plainItemNote(item, order);
			const itemNoteHtml = noteRaw
				? `<div class="k-item-note">--&gt; Nota: ${escapeHtml(noteRaw)}</div>`
				: '';
			return `
		<div class="k-item">
			<div class="k-line">X${safeQuantity} ${safeName}</div>
			${extrasHtml ? `<div class="k-extras-wrap">${extrasHtml}</div>` : ''}
			${itemNoteHtml}
		</div>`;
		}).join('');

		const footerRaw = printOptions.ticketFooterLine != null ? String(printOptions.ticketFooterLine).trim() : '';
		const footerKitchen = footerRaw || 'panel administrativo GodCode';
		const footerHtml = escapeHtml(footerKitchen);

		return `
		<html>
		<head>
			<meta charset="utf-8" />
			<title>Comanda cocina #${safeOrderId}</title>
			<style>
				${cssThermalBase(CONTENT_MM)}
				.k-band {
					text-align: center;
					padding: 2.5mm 0 3mm;
					border-top: 1px dashed #000;
					border-bottom: 1px dashed #000;
				}
				.k-band-time {
					font-size: 10pt;
					margin: 0 0 2.5mm;
				}
				.k-band-order {
					font-size: 12.5pt;
					margin: 0 0 2mm;
					letter-spacing: 0.02em;
				}
				.k-band-ref {
					font-size: 10pt;
					margin: 0;
					letter-spacing: 0.04em;
				}
				.k-list {
					margin-top: 0;
					padding-top: 2mm;
				}
				.k-item {
					padding: 2.5mm 0;
					border-bottom: 1px dashed #000;
					page-break-inside: avoid;
					color: #000;
				}
				.k-item:last-child { border-bottom: none; }
				.k-line {
					font-size: 11.5pt;
					word-break: break-word;
					text-transform: uppercase;
					letter-spacing: 0.03em;
					line-height: 1.3;
					color: #000;
				}
				.k-extras-wrap {
					margin-top: 1.5mm;
					margin-left: 1mm;
					padding-left: 2mm;
					border-left: 2px dashed #000;
					color: #000;
				}
				.k-extra {
					font-size: 9pt;
					margin: 0.8mm 0;
					word-break: break-word;
					text-transform: uppercase;
					line-height: 1.3;
				}
				.k-item-note {
					margin-top: 1.5mm;
					margin-left: 5mm;
					padding-left: 0;
					font-size: 9pt;
					font-weight: 700;
					line-height: 1.35;
					word-break: break-word;
				}
				.k-note {
					margin-top: 4mm;
					font-size: 10pt;
					border: 2px solid #000;
					padding: 2.5mm;
					text-align: center;
					line-height: 1.35;
				}
				.k-foot-block {
					margin-top: 4mm;
					text-align: center;
				}
				.k-rule-tight {
					margin: 0.6mm 0 !important;
					border-top: 1px dashed #000 !important;
				}
				.k-brand-foot {
					font-size: 9pt;
					margin: 2mm 0 0;
					line-height: 1.4;
				}
			</style>
		</head>
		<body>
			<div class="k-band">
				<p class="k-band-time">${dateDash}</p>
				<p class="k-band-order">${orderBandLine}</p>
				<p class="k-band-ref">${refLineHtml}</p>
			</div>
			<div class="k-list">${itemsKitchen}</div>
			${safeKitchenNote ? `<hr class="rule-dots" /><div class="k-note">NOTA: ${safeKitchenNote}</div>` : ''}
			<div class="k-foot-block">
				<hr class="rule-dots k-rule-tight" />
				<hr class="rule-dots k-rule-tight" />
				<p class="k-brand-foot">${footerHtml}</p>
			</div>
		</body>
		</html>`;
	}

	// Diseño «Clásico» (el de siempre): centrado, bandas punteadas, letra de máquina.
	if (design === CASHIER_TICKET_DESIGN.classic) {
		const dateTimeLine = escapeHtml(formatTicketDateTime(order, locale));
		const rawAddr = printOptions.branchAddress != null ? String(printOptions.branchAddress).trim() : '';
		const addrParts = rawAddr ? rawAddr.split(/\n|,/).map((s) => s.trim()).filter(Boolean) : [];
		const addressHtml = addrParts.length
			? addrParts.map((line) => `<p class="c-address">${escapeHtml(line)}</p>`).join('')
			: '';

		const whereLblEsc = escapeHtml(whereLabelForClientTicket(order));
		const channelEsc = escapeHtml(orderChannelForTicket(order, printOptions.orderChannel));
		const orderBandLine = `#${safeOrderId} - ${whereLblEsc} - ${channelEsc}`;
		const refLineHtml = clientReferenceLineHtml(order, { showDeliveryCode });
		const { itemsSubtotal, deliveryFee, grandTotal, discountTotal } = summarizeAmounts(order);
		const payStatusEsc = escapeHtml(ticketPaymentStatusLabel(order));

		const footerRaw = printOptions.ticketFooterLine != null ? String(printOptions.ticketFooterLine).trim() : '';
		const footerLine = footerRaw || 'panel administrativo GodCode';
		const footerHtml = escapeHtml(footerLine);
		const clientPhoneRaw = clientPhoneForTicket(order);
		const clientPhoneHtml = clientPhoneRaw
			? `<p class="c-client-phone">Tel: ${escapeHtml(clientPhoneRaw)}</p>`
			: '';

		const itemsHtml = (order.items || []).map((item) => {
			const price = (item.has_discount && item.discount_price > 0)
				? Number(item.discount_price)
				: Number(item.price);

			const lineTotal = price * (item.quantity || 1);
			const safeQuantity = Number(item.quantity) || 1;
			const safeName = escapeHtml(String(item.name || '').toUpperCase());
			const leftCol = `X${safeQuantity} ${safeName}`;

			let extrasHtml = '';
			if (Array.isArray(item.extras) && item.extras.length > 0) {
				extrasHtml = item.extras.map((extra) => {
					const extraQty = Number(extra.quantity) || 1;
					const extraPrice = Number(extra.price) || 0;
					const extraLineTotal = extraPrice * extraQty * safeQuantity;
					const extraName = escapeHtml(String(extra.name || 'Extra').toUpperCase());
					return `
				<div class="c-item c-item-extra">
					<div class="c-row">
						<span class="c-line-text">${extra.kind === 'change' ? `* ${extraName}${extraQty > 1 ? ` (X${extraQty})` : ''}` : `+ ${extraQty}x ${extraName}`}</span>
						<span class="c-price">${fmt(order, extraLineTotal)}</span>
					</div>
				</div>
				`;
				}).join('');
			}

			// Comentario por item: tambien aparece en el ticket de caja para que el
			// cliente vea que su pedido especial quedo registrado. Se rendea con
			// "NOTA: ..." debajo del nombre, sin borde fuerte (no es para cocina).
			const noteRaw = plainItemNote(item, order);
			const itemNoteHtml = noteRaw
				? `<div class="c-item-note">NOTA: ${escapeHtml(noteRaw.toUpperCase())}</div>`
				: '';

			return `
			<div class="c-item">
				<div class="c-row">
					<span class="c-line-text">${leftCol}</span>
					<span class="c-price">${fmt(order, lineTotal)}</span>
				</div>
				${itemNoteHtml}
			</div>
			${extrasHtml}
		`;
		}).join('');

		const deliveryFeeRow =
			isOrderDelivery(order) && deliveryFee > 0
				? `<div class="c-money-row"><span>Envío</span><span>${fmt(order, deliveryFee)}</span></div>`
				: isOrderDelivery(order)
					? `<div class="c-money-row"><span>Envío</span><span>GRATIS</span></div>`
					: '';

		const discountRow =
			discountTotal > 0
				? `<div class="c-money-row"><span>Descuento</span><span>−${fmt(order, discountTotal)}</span></div>`
				: '';

		return `
			<html>
			<head>
				<meta charset="utf-8" />
				<title>Ticket cliente #${safeOrderId}</title>
				<style>
					${cssThermalBase(CONTENT_MM)}
					.c-head {
						text-align: center;
						margin-bottom: 2mm;
						padding-bottom: 2mm;
					}
					.c-logo {
						max-width: ${logoMaxWidthMm}mm;
						max-height: ${logoMaxHeightMm}mm;
						width: auto;
						height: auto;
						display: block;
						margin: 0 auto 2mm;
						object-fit: contain;
						image-rendering: auto;
						filter: contrast(1.2);
					}
					.c-brand {
						font-size: 17pt;
						margin: 0 0 2mm;
						text-transform: uppercase;
						line-height: 1.15;
					}
					.c-address {
						font-size: 9pt;
						margin: 0 0 1.5mm;
						line-height: 1.35;
						text-transform: none;
					}
					.c-delivery-box {
						margin: 2mm 0 3mm;
						padding: 2.5mm 2mm;
						border: 2px dashed #000;
						text-align: center;
					}
					.c-delivery-heading {
						margin: 0 0 1.5mm;
						font-size: 11pt;
						font-weight: 800;
						letter-spacing: 0.05em;
						text-transform: uppercase;
					}
					.c-delivery-meta {
						margin: 1.5mm 0 0;
						font-size: 9pt;
						text-transform: none;
					}
					.c-delivery-line {
						margin: 0.9mm 0 0;
						font-size: 12pt;
						line-height: 1.3;
						word-break: break-word;
						text-transform: none;
					}
					.c-band {
						margin-top: 2mm;
						padding: 2.5mm 0;
						text-align: center;
						border-top: 1px dashed #000;
						border-bottom: 1px dashed #000;
					}
					.c-band-time {
						font-size: 10pt;
						margin: 0 0 2mm;
					}
					.c-band-order {
						font-size: 12.5pt;
						margin: 0 0 2mm;
						letter-spacing: 0.02em;
					}
					.c-band-ref {
						font-size: 10pt;
						margin: 0;
						letter-spacing: 0.04em;
					}
					.c-client-name {
						font-size: 11pt;
						margin: 3mm 0 0;
						text-align: center;
						text-transform: none;
					}
					.c-client-phone {
						font-size: 10pt;
						margin: 1mm 0 0;
						text-align: center;
						text-transform: none;
						letter-spacing: 0.02em;
					}
					.c-items {
						margin-top: 2mm;
						padding-top: 2mm;
						border-top: 1px dashed #000;
					}
					.c-item {
						margin-bottom: 2.5mm;
						padding-bottom: 2mm;
						border-bottom: 1px dashed #000;
						page-break-inside: avoid;
					}
					.c-item:last-child { border-bottom: none; }
					.c-row {
						display: flex;
						justify-content: space-between;
						align-items: flex-start;
						gap: 2mm;
						font-size: 10.5pt;
					}
					.c-line-text {
						flex: 1;
						word-break: break-word;
						text-transform: uppercase;
						letter-spacing: 0.02em;
						line-height: 1.3;
					}
					.c-price {
						flex-shrink: 0;
						font-size: 10.5pt;
						text-align: right;
						max-width: 48%;
						white-space: normal;
						line-height: 1.25;
					}
					.c-detail {
						font-size: 9.5pt;
						margin: 1.5mm 0 0 3mm;
						padding-left: 2mm;
						border-left: 3px solid #000;
						word-break: break-word;
						line-height: 1.35;
						text-transform: uppercase;
					}
					.c-item-extra {
						opacity: 0.85;
					}
					.c-item-extra .c-row {
						padding-left: 2mm;
						border-left: 2px dashed #000;
					}
					.c-item-extra .c-line-text {
						font-size: 9.5pt;
					}
					.c-item-note {
						margin-top: 1mm;
						padding-left: 2mm;
						font-size: 9pt;
						font-weight: 600;
						line-height: 1.25;
						word-break: break-word;
						text-transform: uppercase;
					}
					.c-money-block {
						margin-top: 2mm;
						padding-top: 2mm;
						border-top: 1px dashed #000;
					}
					.c-money-row {
						display: flex;
						justify-content: space-between;
						align-items: baseline;
						font-size: 10.5pt;
						margin: 0 0 1.5mm;
						gap: 2mm;
					}
					.c-money-row > span:last-child,
					.c-total-big > span:last-child {
						text-align: right;
						max-width: 62%;
						line-height: 1.25;
					}
					.c-total-big {
						display: flex;
						justify-content: space-between;
						align-items: baseline;
						margin-top: 2mm;
						padding-top: 2mm;
						border-top: 2px solid #000;
						font-size: 13pt;
						gap: 2mm;
					}
					.c-legal {
						font-size: 8.5pt;
						margin: 2.5mm 0 0;
						text-align: center;
						line-height: 1.35;
						text-transform: none;
					}
					.c-pay-block {
						margin-top: 3mm;
						padding-top: 2mm;
						border-top: 1px dashed #000;
					}
					.c-pay-row {
						font-size: 10pt;
						margin: 0 0 1.5mm;
					}
					.c-pay-strong {
						display: flex;
						justify-content: space-between;
						align-items: baseline;
						font-size: 11pt;
						margin-top: 2mm;
					}
					.c-pay-detail {
						font-size: 9.5pt;
						margin-top: 2mm;
						text-transform: none;
					}
					.c-note {
						margin-top: 3mm;
						font-size: 10pt;
						border: 2px solid #000;
						padding: 2.5mm;
						text-align: center;
						line-height: 1.35;
					}
					.c-foot {
						text-align: center;
						margin-top: 4mm;
						padding-top: 2mm;
						border-top: 1px dashed #000;
						font-size: 9pt;
						line-height: 1.4;
						text-transform: none;
					}
				</style>
			</head>
			<body>
				<div class="c-head">
					${safeLogoUrl ? `<img src="${safeLogoUrl}" class="c-logo" alt="" />` : ''}
					<h1 class="ticket-brand c-brand">${safeBranchName}</h1>
					${addressHtml}
				</div>
				<div class="c-band">
					<p class="c-band-time">${dateTimeLine}</p>
					<p class="c-band-order">${orderBandLine}</p>
					<p class="c-band-ref">${refLineHtml}</p>
				</div>
				${deliveryShipmentSectionHtml(order, fmt, { showDeliveryCode })}
				<p class="c-client-name">${safeClientName}</p>
				${clientPhoneHtml}
				<div class="c-items">${itemsHtml}</div>
				<div class="c-money-block">
					<div class="c-money-row"><span>Subtotal</span><span>${fmt(order, itemsSubtotal)}</span></div>
					${discountRow}
					${deliveryFeeRow}
					<div class="c-total-big"><span>Total</span><span>${fmt(order, grandTotal)}</span></div>
					<p class="c-legal">Este documento no tiene valor fiscal.</p>
				</div>
				<div class="c-pay-block">
					<p class="c-pay-row">Estado de pago: ${payStatusEsc}</p>
				</div>
				${safeOrderNote ? `<div class="c-note">NOTA: ${safeOrderNote}</div>` : ''}
				<div class="c-foot">${footerHtml}</div>
			</body>
			</html>
		`;
	}

	/* Diseño «Salón», para el ticket de caja (cliente) y la comanda de cocina:
	   caja con el número del turno + tipo/hora/canal, datos en dos columnas,
	   tabla Uds. / Descripción / Importe con los cambios bajo cada producto
	   y totales. La comanda va sin precios, pago ni totales, y con los
	   productos más grandes. */
	const kitchen = variant === 'kitchen';
	const rawAddr = printOptions.branchAddress != null ? String(printOptions.branchAddress).trim() : '';
	const addrParts = rawAddr ? rawAddr.split(/\n|,/).map((s) => s.trim()).filter(Boolean) : [];
	const addressHtml = addrParts.length
		? `<p class="c-address">${addrParts.map((line) => escapeHtml(line)).join(' · ')}</p>`
		: '';

	const whereTitleEsc = escapeHtml(whereLabelForKitchenTicket(order));
	const channelEsc = escapeHtml(orderChannelForTicket(order, printOptions.orderChannel));
	const timeEsc = escapeHtml(formatTicketTime(order, locale));
	const dateEsc = escapeHtml(formatTicketDate(order, locale));
	const companyNumberEsc = escapeHtml(companyOrderNumberForTicket(order));
	const tableRaw = order?.table_number != null ? String(order.table_number).trim() : '';
	const { itemsSubtotal, deliveryFee, grandTotal, discountTotal } = summarizeAmounts(order);
	const payStatusEsc = escapeHtml(ticketPaymentStatusLabel(order));

	const footerRaw = printOptions.ticketFooterLine != null ? String(printOptions.ticketFooterLine).trim() : '';
	const footerLine = footerRaw || 'panel administrativo GodCode';
	const footerHtml = escapeHtml(footerLine);
	const clientPhoneRaw = clientPhoneForTicket(order);
	// Papel de 58 mm: la caja del número y el título van más chicos para que quepan lado a lado.
	const narrow = CONTENT_MM <= 50;

	/** Fila etiqueta/valor que ocupa todo el ancho del bloque de datos. */
	const infoRow = (label, value) => `
				<span class="c-info-label">${label}</span>
				<span class="c-info-value c-info-wide">${value}</span>`;

	// A cocina no le sirven el teléfono, el pago ni la caja de envío (lleva el cargo).
	// El código de entrega sí va si corresponde, como en la línea CL- de la comanda clásica.
	const handoffRaw = order?.handoff_code != null ? String(order.handoff_code).trim() : '';
	const kitchenCodeRow = handoffRaw && (showDeliveryCode || !isOrderDelivery(order))
		? infoRow('Código.', escapeHtml(handoffRaw))
		: '';
	const infoRowsTail = kitchen
		? kitchenCodeRow
		: `${clientPhoneRaw ? infoRow('Tel.', escapeHtml(clientPhoneRaw)) : ''}
				${infoRow('Pago.', payStatusEsc)}`;

	const infoHtml = `
				<span class="c-info-label">Número.</span>
				<span class="c-info-value">${companyNumberEsc || '—'}</span>
				<span class="c-info-label">Fecha.</span>
				<span class="c-info-value">${dateEsc}</span>
				${infoRow('Cliente.', safeClientName)}
				${infoRowsTail}`;

	const itemsHtml = (order.items || []).map((item) => {
		const price = (item.has_discount && item.discount_price > 0)
			? Number(item.discount_price)
			: Number(item.price);
		const safeQuantity = Number(item.quantity) || 1;
		const lineTotal = price * safeQuantity;
		const safeName = escapeHtml(String(item.name || '').toUpperCase());

		// Cambios y extras como en el Clásico: raya vertical punteada, «* CAMBIO» o «+ 1x EXTRA».
		const modRows = (Array.isArray(item.extras) ? item.extras : []).map((extra) => {
			const extraQty = Number(extra.quantity) || 1;
			const extraLineTotal = (Number(extra.price) || 0) * extraQty * safeQuantity;
			const extraName = escapeHtml(String(extra.name || 'Extra').toUpperCase());
			const text = extra.kind === 'change'
				? `* ${extraName}${extraQty > 1 ? ` (X${extraQty})` : ''}`
				: `+ ${extraQty}x ${extraName}`;
			const priceHtml = kitchen
				? ''
				: `
					<span class="c-p">${extraLineTotal > 0 ? fmt(order, extraLineTotal) : ''}</span>`;
			return `
				<div class="c-mod">
					<span class="c-d">${text}</span>${priceHtml}
				</div>`;
		}).join('');
		const modsHtml = modRows ? `
			<div class="c-mods">${modRows}
			</div>` : '';

		// El comentario del ítem también va al cliente: confirma que el pedido especial quedó registrado.
		const noteRaw = plainItemNote(item, order);
		const noteHtml = noteRaw
			? `
			<div class="c-item-note">NOTA: ${escapeHtml(noteRaw.toUpperCase())}</div>`
			: '';

		return `
		<div class="c-item">
			<div class="c-row c-main">
				<span class="c-q">${safeQuantity}</span>
				<span class="c-d">${safeName}</span>${kitchen ? '' : `
				<span class="c-p">${fmt(order, lineTotal)}</span>`}
			</div>${modsHtml}${noteHtml}
		</div>`;
	}).join('');

	const deliveryFeeRow = isOrderDelivery(order)
		? `<div class="c-money-row"><span>Envío</span><span>${deliveryFee > 0 ? fmt(order, deliveryFee) : 'GRATIS'}</span></div>`
		: '';

	const discountRow =
		discountTotal > 0
			? `<div class="c-money-row"><span>Descuento</span><span>−${fmt(order, discountTotal)}</span></div>`
			: '';

	// La comanda lleva «COCINA» donde el ticket de caja lleva logo, empresa y dirección.
	const headHtml = kitchen
		? '<h1 class="ticket-brand c-brand">COCINA</h1>'
		: `${safeLogoUrl ? `<img src="${safeLogoUrl}" class="c-logo" alt="" />` : ''}
				<h1 class="ticket-brand c-brand">${safeBranchName}</h1>
				${addressHtml}`;

	const moneyHtml = kitchen
		? ''
		: `
				<div class="c-sec c-money">
					<div class="c-money-row"><span>Subtotal</span><span>${fmt(order, itemsSubtotal)}</span></div>
					${discountRow}
					${deliveryFeeRow}
					<div class="c-total-big"><span>TOTAL</span><span>${fmt(order, grandTotal)}</span></div>
				</div>`;

	// Comanda: sin columna de importe y con los productos más grandes, que se leen de lejos.
	const kitchenCss = kitchen
		? `
				.c-row {
					grid-template-columns: 8mm 1fr;
				}
				.c-main {
					font-size: 12pt;
				}
				.c-mod,
				.c-item-note {
					font-size: 10.5pt;
				}
				.c-foot {
					margin-top: 2mm;
				}`
		: '';

	return `
		<html>
		<head>
			<meta charset="utf-8" />
			<title>${kitchen ? 'Comanda cocina' : 'Ticket cliente'} #${safeOrderId}</title>
			<style>
				${cssThermalBase(CONTENT_MM)}
				body {
					font-family: Arial, 'Helvetica Neue', Helvetica, 'Liberation Sans', sans-serif;
				}
				.c-head {
					text-align: center;
					margin-bottom: 2.5mm;
				}
				.c-logo {
					max-width: ${logoMaxWidthMm}mm;
					max-height: ${logoMaxHeightMm}mm;
					width: auto;
					height: auto;
					display: block;
					margin: 0 auto 1.5mm;
					object-fit: contain;
					image-rendering: auto;
					filter: contrast(1.2);
				}
				.c-brand {
					font-size: 17pt;
					margin: 0;
					text-transform: uppercase;
				}
				.c-address {
					font-size: 9pt;
					margin: 1mm 0 0;
					line-height: 1.3;
				}
				.c-sheet {
					border: 1px solid #000;
				}
				/* Al imprimir el body va sin padding lateral y el recuadro caía justo en
				   el borde del área imprimible: la térmica recortaba la línea derecha. */
				@media print {
					.c-sheet {
						margin: 0 1mm;
					}
				}
				.c-sec + .c-sec {
					border-top: 1px solid #000;
				}
				.c-top {
					display: flex;
					align-items: stretch;
					gap: 2.5mm;
					padding: 2mm;
				}
				.c-num-box {
					flex: 0 0 38%;
					display: flex;
					align-items: center;
					justify-content: center;
					min-height: ${narrow ? 15 : 20}mm;
					border: 1px solid #000;
					font-size: ${narrow ? 18 : 26}pt;
					line-height: 1;
					word-break: break-all;
					text-align: center;
				}
				.c-top-info {
					flex: 1;
					min-width: 0;
					display: flex;
					flex-direction: column;
					justify-content: center;
					gap: 1mm;
				}
				.c-where {
					margin: 0 0 0.5mm;
					font-family: 'Arial Black', Arial, sans-serif;
					font-size: ${narrow ? 10.5 : 14}pt;
					letter-spacing: ${narrow ? 0.04 : 0.14}em;
					text-align: center;
					line-height: 1.1;
				}
				.c-kv {
					display: flex;
					justify-content: space-between;
					gap: 2mm;
					font-size: 10.5pt;
					line-height: 1.25;
				}
				.c-info {
					display: grid;
					grid-template-columns: auto 1fr auto auto;
					column-gap: 2mm;
					row-gap: 0.6mm;
					padding: 2mm;
					font-size: 10pt;
					line-height: 1.3;
				}
				.c-info-value {
					min-width: 0;
					word-break: break-word;
				}
				.c-info-wide {
					grid-column: 2 / -1;
				}
				.c-delivery-box {
					padding: 2mm;
					text-align: left;
				}
				.c-delivery-heading {
					margin: 0 0 1mm;
					font-size: 11pt;
					letter-spacing: 0.05em;
					text-transform: uppercase;
				}
				.c-delivery-line {
					margin: 0.8mm 0 0;
					font-size: 12.5pt;
					line-height: 1.3;
					word-break: break-word;
				}
				.c-delivery-meta {
					margin: 1.5mm 0 0;
					font-size: 10pt;
					line-height: 1.3;
				}
				.c-row {
					display: grid;
					grid-template-columns: 8mm 1fr auto;
					column-gap: 1.5mm;
					align-items: baseline;
				}
				.c-cols {
					padding: 1.2mm 2mm;
					font-size: 9pt;
				}
				.c-items {
					padding: 1mm 2mm 1.5mm;
				}
				.c-item {
					padding: 1.8mm 0;
					border-bottom: 1px dashed #000;
					page-break-inside: avoid;
				}
				.c-item:last-child {
					border-bottom: none;
				}
				.c-main {
					font-size: 10.5pt;
					line-height: 1.3;
				}
				.c-main .c-q {
					text-align: center;
				}
				/* Cambios bajo el nombre del producto, con la raya vertical punteada del Clásico. */
				.c-mods {
					margin-top: 1.5mm;
				}
				.c-mod {
					display: flex;
					justify-content: space-between;
					align-items: stretch;
					gap: 1.5mm;
					padding: 1.2mm 0 0.3mm;
					border-top: 1px dashed #000;
					font-size: 9.5pt;
					line-height: 1.3;
				}
				.c-mod .c-d {
					flex: 1;
					margin-left: 9.5mm;
					padding-left: 2mm;
					border-left: 2px dashed #000;
				}
				.c-item-note {
					margin: 1mm 0 0 9.5mm;
					font-size: 9.5pt;
					line-height: 1.3;
					word-break: break-word;
				}
				.c-d {
					min-width: 0;
					word-break: break-word;
				}
				.c-p {
					text-align: right;
					white-space: nowrap;
				}
				.c-money {
					padding: 1.5mm 2mm 2mm;
				}
				.c-money-row {
					display: flex;
					justify-content: space-between;
					gap: 2mm;
					font-size: 10.5pt;
					margin: 0 0 0.8mm;
				}
				.c-total-big {
					display: flex;
					justify-content: space-between;
					align-items: baseline;
					gap: 2mm;
					margin-top: 1.5mm;
					padding-top: 1.5mm;
					border-top: 1px solid #000;
					font-size: 14pt;
				}
				.c-note {
					padding: 2mm;
					font-size: 10pt;
					line-height: 1.35;
					text-align: center;
				}
				.c-legal,
				.c-foot {
					margin: 2mm 0 0;
					font-size: 8.5pt;
					line-height: 1.35;
					text-align: center;
				}
				.c-foot {
					margin-top: 0.8mm;
				}${kitchenCss}
			</style>
		</head>
		<body>
			<div class="c-head">
				${headHtml}
			</div>
			<div class="c-sheet">
				<div class="c-sec c-top">
					<div class="c-num-box">${safeOrderId}</div>
					<div class="c-top-info">
						<p class="c-where">${whereTitleEsc}</p>
						<div class="c-kv"><span>Hora:</span><span>${timeEsc}</span></div>
						${tableRaw ? `<div class="c-kv"><span>Mesa:</span><span>${escapeHtml(tableRaw)}</span></div>` : ''}
						<div class="c-kv"><span>Canal:</span><span>${channelEsc}</span></div>
					</div>
				</div>
				<div class="c-sec c-info">${infoHtml}
				</div>
				${!kitchen && isOrderDelivery(order) ? `<div class="c-sec">${deliveryShipmentSectionHtml(order, fmt, { showDeliveryCode })}</div>` : ''}
				<div class="c-sec c-row c-cols">
					<span class="c-q">Uds.</span>
					<span class="c-d">Descripción / Modificación</span>${kitchen ? '' : `
					<span class="c-p">Importe</span>`}
				</div>
				<div class="c-sec c-items">${itemsHtml}</div>${moneyHtml}
				${safeOrderNote ? `<div class="c-sec c-note">NOTA: ${safeOrderNote}</div>` : ''}
			</div>
			${kitchen ? '' : '<p class="c-legal">Este documento no tiene valor fiscal.</p>'}
			<p class="c-foot">${footerHtml}</p>
		</body>
		</html>
	`;
}
