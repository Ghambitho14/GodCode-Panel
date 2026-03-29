import { formatCurrency } from '../../shared/utils/formatters';

/**
 * Impresión térmica desde el navegador: usar mm + pt evita que el preview
 * escale todo “a lo pequeño” (texto borroso). 80 = rollo 80mm (común en cocina);
 * 58 = rollo 58mm (reducir ancho útil).
 */
const THERMAL_PAPER_MM = 80;
const CONTENT_MM = THERMAL_PAPER_MM <= 58 ? 48 : 72;

export const printOrderTicket = (order, branchName = 'NOMBRE DEL LOCAL', logoUrl = null) => {
	const escapeHtml = (value) =>
		String(value)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');

	// Solo HTTPS (y http en desarrollo) para evitar data:/blob: y posibles abusos
	const safeLogoUrl = (() => {
		if (!logoUrl) return '';
		try {
			const parsed = new URL(logoUrl, window.location.origin);
			if (parsed.protocol === 'https:') return parsed.href;
			if (process.env.NODE_ENV !== 'production' && parsed.protocol === 'http:') return parsed.href;
			return '';
		} catch {
			return '';
		}
	})();

	// Ventana más ancha que el ticket: el motor renderiza mejor antes de mandar a la impresora
	const previewWindowWidth = 520;
	const logoMaxWidthMm = CONTENT_MM <= 50 ? 40 : 58;
	const logoMaxHeightMm = 14;

	const printWindow = window.open('', '', `width=${previewWindowWidth},height=700`);
	if (!printWindow) {
		return;
	}

	const itemsHtml = (order.items || []).map(item => {
		const price = (item.has_discount && item.discount_price > 0)
			? Number(item.discount_price)
			: Number(item.price);

		const subtotal = price * (item.quantity || 1);
		const safeQuantity = Number(item.quantity) || 1;
		const safeName = escapeHtml(item.name || '');
		const safeDescription = item.description ? escapeHtml(item.description) : '';

		return `
		<div class="item">
			<div class="row">
				<span class="qty">${safeQuantity}</span>
				<span class="name">${safeName}</span>
				<span class="price">${formatCurrency(subtotal)}</span>
			</div>
			${safeDescription ? `<div class="note">(${safeDescription})</div>` : ''}
		</div>
	`;
	}).join('');

	const safeBranchName = escapeHtml(branchName || 'NOMBRE DEL LOCAL');
	const safeOrderId = escapeHtml(String(order.id || 'PRE').slice(-4));
	const safeClientName = escapeHtml(order.client_name || 'Mostrador');
	const safeOrderNote = order.note ? escapeHtml(order.note) : '';

	const html = `
		<html>
		<head>
			<meta charset="utf-8" />
			<title>Comanda #${safeOrderId}</title>
			<style>
				@page {
					size: ${THERMAL_PAPER_MM}mm auto;
					margin: 2mm;
				}
				html {
					-webkit-text-size-adjust: 100%;
					text-size-adjust: 100%;
				}
				body {
					font-family: 'Courier New', 'Liberation Mono', Consolas, monospace;
					font-size: 12pt;
					line-height: 1.25;
					width: ${CONTENT_MM}mm;
					max-width: ${CONTENT_MM}mm;
					margin: 0 auto;
					padding: 2mm 1mm;
					color: #000;
					background: #fff;
					box-sizing: border-box;
					-webkit-print-color-adjust: exact;
					print-color-adjust: exact;
					-webkit-font-smoothing: antialiased;
				}
				.header {
					text-align: center;
					margin-bottom: 4mm;
					border-bottom: 1px dashed #000;
					padding-bottom: 3mm;
				}
				.logo {
					max-width: ${logoMaxWidthMm}mm;
					max-height: ${logoMaxHeightMm}mm;
					width: auto;
					height: auto;
					display: block;
					margin: 0 auto 2mm;
					object-fit: contain;
					image-rendering: auto;
					filter: contrast(1.15);
				}
				.title {
					font-size: 15pt;
					font-weight: bold;
					margin: 0;
					text-transform: uppercase;
					letter-spacing: 0.02em;
				}
				.info {
					font-size: 10pt;
					margin: 0;
				}
				.items { margin-top: 3mm; }
				.item { margin-bottom: 2mm; page-break-inside: avoid; }
				.row {
					display: flex;
					justify-content: space-between;
					align-items: flex-start;
					gap: 2mm;
					font-size: 12pt;
				}
				.qty {
					font-weight: bold;
					margin-right: 2mm;
					min-width: 1.8em;
					flex-shrink: 0;
				}
				.name {
					flex: 1;
					font-weight: 700;
					word-break: break-word;
				}
				.price {
					margin-left: 2mm;
					white-space: nowrap;
					font-size: 11pt;
					flex-shrink: 0;
				}
				.note {
					font-size: 10pt;
					font-style: italic;
					margin-left: 5mm;
					margin-top: 0.5mm;
				}
				.total {
					border-top: 1px dashed #000;
					margin-top: 4mm;
					padding-top: 3mm;
					text-align: right;
					font-size: 14pt;
					font-weight: bold;
				}
				.order-note {
					margin-top: 4mm;
					font-size: 11pt;
					font-weight: bold;
					border: 1px solid #000;
					padding: 2mm;
					text-align: center;
				}
				.footer {
					text-align: center;
					margin-top: 4mm;
					font-size: 10pt;
				}
				@media print {
					body {
						margin: 0;
						padding: 1mm;
						-webkit-font-smoothing: none;
						font-smooth: never;
					}
				}
			</style>
		</head>
		<body>
			<div class="header">
				${safeLogoUrl ? `<img src="${safeLogoUrl}" class="logo" />` : ''}
				<h1 class="title">${safeBranchName}</h1>
				<div style="display: flex; justify-content: space-between; margin-top: 2px;">
					<span class="info">${new Date().toLocaleDateString('es-CL')} ${new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</span>
					<span class="info">#${safeOrderId}</span>
				</div>
				<p class="info" style="text-align: left; margin-top: 2px; font-weight: 600;">Cli: ${safeClientName}</p>
			</div>
			<div class="items">${itemsHtml}</div>
			<div class="total">TOTAL: ${formatCurrency(order.total || 0)}</div>
			${safeOrderNote ? `<div class="order-note">NOTA: ${safeOrderNote}</div>` : ''}
			<div class="footer"><p>*** COMANDA ***</p></div>
		</body>
		</html>
	`;

	printWindow.document.write(html);
	printWindow.document.close();

	// Esperar a que el logo cargue antes de imprimir (impresoras térmicas capturan el documento al imprimir)
	const runPrint = () => {
		printWindow.print();
		printWindow.close();
	};
	if (safeLogoUrl) {
		const img = printWindow.document.querySelector('.logo');
		if (img) {
			if (img.complete && img.naturalWidth > 0) {
				setTimeout(runPrint, 100);
			} else {
				const timeout = setTimeout(runPrint, 2000);
				img.onload = () => {
					clearTimeout(timeout);
					setTimeout(runPrint, 150);
				};
				img.onerror = () => {
					clearTimeout(timeout);
					setTimeout(runPrint, 150);
				};
			}
		} else {
			setTimeout(runPrint, 400);
		}
	} else {
		setTimeout(runPrint, 300);
	}
};