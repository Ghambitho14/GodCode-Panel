import { normalizeCurrencyCode } from '@/shared/utils/money';

/**
 * @param {unknown} country
 * @returns {boolean}
 */
export function isVenezuelaCountry(country) {
	const c = String(country ?? '').trim().toLowerCase();
	return c === 've' || c === 'venezuela';
}

/**
 * @param {{ country?: string | null } | null | undefined} branch
 * @param {{ country?: string | null } | null | undefined} company
 * @returns {string}
 */
export function resolveEffectiveCountry(branch, company) {
	const branchCountry = branch?.country;
	if (branchCountry != null && String(branchCountry).trim()) {
		return String(branchCountry).trim();
	}
	const companyCountry = company?.country;
	if (companyCountry != null && String(companyCountry).trim()) {
		return String(companyCountry).trim();
	}
	return 'CL';
}

/**
 * Moneda efectiva para catálogo y montos contables del panel.
 * En Venezuela los precios del menú y `orders.total` usan USD.
 *
 * @param {{ currency?: string | null; country?: string | null } | null | undefined} branch
 * @param {{ currency?: string | null; country?: string | null } | null | undefined} company
 * @returns {string}
 */
export function resolveEffectiveCurrency(branch, company) {
	const country = resolveEffectiveCountry(branch, company);
	if (isVenezuelaCountry(country)) return 'USD';
	const branchCurrency = branch?.currency;
	if (branchCurrency != null && String(branchCurrency).trim()) {
		return normalizeCurrencyCode(branchCurrency);
	}
	const companyCurrency = company?.currency;
	if (companyCurrency != null && String(companyCurrency).trim()) {
		return normalizeCurrencyCode(companyCurrency);
	}
	return 'CLP';
}
