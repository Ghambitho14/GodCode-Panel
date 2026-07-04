/** Constantes y helpers compartidos para impresión térmica. */

export const THERMAL_PAPER_MM = 80;
export const CONTENT_MM = THERMAL_PAPER_MM <= 58 ? 48 : 72;

/** @typedef {'kitchen' | 'cashier'} TicketVariant */

export function escapeHtml(value) {
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

export function resolveSafeLogoUrl(logoUrl) {
	if (!logoUrl) return '';
	try {
		const parsed = new URL(logoUrl, window.location.origin);
		if (parsed.protocol === 'https:') return parsed.href;
		if (import.meta.env.DEV && parsed.protocol === 'http:') return parsed.href;
		return '';
	} catch {
		return '';
	}
}
