import { resolveSafeLogoUrl } from './thermalUtils';
import { buildTicketHtml } from './ticketHtml';

function schedulePrintAfterLoad(printWindow, hasLogo) {
	const runPrint = () => {
		printWindow.print();
		printWindow.close();
	};
	if (hasLogo) {
		const img = printWindow.document.querySelector('.c-logo');
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
}

/**
 * @param {Record<string, unknown>} order
 * @param {string} [branchName]
 * @param {string | null} [logoUrl]
 * @param {{
 *   variant?: import('./thermalUtils').TicketVariant;
 *   branchAddress?: string | null;
 *   ticketFooterLine?: string | null;
 *   orderChannel?: string | null;
 *   companyName?: string | null;
 * }} [options]
 */
export const printOrderTicket = (order, branchName = 'NOMBRE DEL LOCAL', logoUrl = null, options = {}) => {
	const variant = options.variant === 'kitchen' ? 'kitchen' : 'cashier';
	const previewWindowWidth = 520;
	const printWindow = window.open('', '', `width=${previewWindowWidth},height=700`);
	if (!printWindow) {
		return;
	}

	const html = buildTicketHtml(order, branchName, logoUrl, variant, options);
	const hasLogo = variant === 'cashier' && Boolean(resolveSafeLogoUrl(logoUrl));

	printWindow.document.write(html);
	printWindow.document.close();
	schedulePrintAfterLoad(printWindow, hasLogo);
};
