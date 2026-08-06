import { isVenezuelaCountry, resolveEffectiveCountry } from '@/lib/geo/tenant-locale';
import { fetchBcvRate } from '@/lib/money/bcv-rate';
import { resolveTicketExchangeRate } from '@/lib/money/order-amount';
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
 * @param {Window} printWindow
 * @param {string} html
 */
function writePrintHtml(printWindow, html) {
	printWindow.document.open();
	printWindow.document.write(html);
	printWindow.document.close();
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
 *   branch?: object | null;
 *   company?: object | null;
 *   exchangeRate?: unknown;
 * }} [options]
 */
export const printOrderTicket = (order, branchName = 'NOMBRE DEL LOCAL', logoUrl = null, options = {}) => {
	const variant = options.variant === 'kitchen' ? 'kitchen' : 'cashier';
	const previewWindowWidth = 520;
	const printWindow = window.open('', '', `width=${previewWindowWidth},height=700`);
	if (!printWindow) {
		return false;
	}

	const hasLogo = variant === 'cashier' && Boolean(resolveSafeLogoUrl(logoUrl));

	const finish = (printOptions) => {
		const html = buildTicketHtml(order, branchName, logoUrl, variant, printOptions);
		writePrintHtml(printWindow, html);
		schedulePrintAfterLoad(printWindow, hasLogo);
	};

	const resolvedRate = resolveTicketExchangeRate({
		branch: options.branch ?? null,
		company: options.company ?? null,
		exchangeRate: options.exchangeRate,
	});
	const country = resolveEffectiveCountry(options.branch, options.company);
	const needsBcvFetch = variant === 'cashier'
		&& isVenezuelaCountry(country)
		&& resolvedRate == null;

	if (needsBcvFetch) {
		writePrintHtml(
			printWindow,
			'<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Ticket</title></head>'
			+ '<body style="font-family:system-ui,sans-serif;padding:16px;font-size:14px">'
			+ 'Preparando ticket…</body></html>',
		);
		void fetchBcvRate()
			.then((bcvRate) => {
				finish({
					...options,
					exchangeRate: bcvRate ?? options.exchangeRate ?? null,
				});
			})
			.catch(() => {
				finish(options);
			});
		return true;
	}

	finish({
		...options,
		exchangeRate: resolvedRate ?? options.exchangeRate ?? null,
	});
	return true;
};
