import { isVenezuelaCountry } from '@/lib/geo/tenant-locale';
import { formatCartAmountPlain, formatCartMoney } from '@/lib/money/format-cart-money';

const BOLIVARES_METHODS = new Set([
	'pago_movil',
	'transferencia_bancaria',
	'efectivo',
	'tarjeta',
]);

const USD_METHODS = new Set([
	'zelle',
	'paypal',
	'stripe',
	'mercadopago',
]);

/**
 * @param {unknown} methodKey
 * @returns {string}
 */
function normalizeMethodKey(methodKey) {
	return String(methodKey ?? '').trim().toLowerCase();
}

/**
 * @param {unknown} methodKey
 * @returns {boolean}
 */
export function paymentMethodUsesBolivaresInVenezuela(methodKey) {
	const key = normalizeMethodKey(methodKey);
	if (!key) return false;
	if (BOLIVARES_METHODS.has(key)) return true;
	if (USD_METHODS.has(key)) return false;
	return false;
}

/**
 * @param {unknown} methodKey
 * @returns {boolean}
 */
export function paymentMethodUsesUsdInVenezuela(methodKey) {
	const key = normalizeMethodKey(methodKey);
	if (!key) return true;
	if (USD_METHODS.has(key)) return true;
	if (BOLIVARES_METHODS.has(key)) return false;
	return true;
}

/**
 * @param {unknown} exchangeRate
 * @returns {number | null}
 */
export function parseExchangeRate(exchangeRate) {
	if (exchangeRate == null || exchangeRate === '') return null;
	const n = Number(exchangeRate);
	if (!Number.isFinite(n) || n <= 0) return null;
	return n;
}

/**
 * @param {unknown} usdTotal
 * @param {unknown} exchangeRate
 * @returns {number | null}
 */
export function convertUsdToVes(usdTotal, exchangeRate) {
	const rate = parseExchangeRate(exchangeRate);
	if (rate == null) return null;
	const usd = Number(usdTotal);
	if (!Number.isFinite(usd)) return null;
	return usd * rate;
}

/**
 * @param {{
 *   methodKey?: unknown;
 *   grandTotal?: unknown;
 *   currency?: unknown;
 *   exchangeRate?: unknown;
 *   country?: unknown;
 * }} opts
 * @returns {string}
 */
export function resolvePaymentAmountDisplay(opts = {}) {
	const country = opts.country;
	const methodKey = opts.methodKey;
	const grandTotal = opts.grandTotal ?? 0;
	const exchangeRate = opts.exchangeRate;
	const currency = opts.currency ?? 'USD';

	if (!isVenezuelaCountry(country)) {
		return formatCartMoney(grandTotal, currency);
	}

	const usdLabel = formatCartMoney(grandTotal, 'USD');
	const vesAmount = convertUsdToVes(grandTotal, exchangeRate);

	if (paymentMethodUsesBolivaresInVenezuela(methodKey) && vesAmount != null) {
		const vesLabel = formatCartMoney(vesAmount, 'VES');
		return `${usdLabel} / ${vesLabel}`;
	}

	return usdLabel;
}

/**
 * @param {{
 *   methodKey?: unknown;
 *   grandTotal?: unknown;
 *   currency?: unknown;
 *   exchangeRate?: unknown;
 *   country?: unknown;
 * }} opts
 * @returns {string}
 */
export function resolvePaymentAmountCopyValue(opts = {}) {
	const country = opts.country;
	const methodKey = opts.methodKey;
	const grandTotal = opts.grandTotal ?? 0;
	const exchangeRate = opts.exchangeRate;

	if (!isVenezuelaCountry(country)) {
		return formatCartMoney(grandTotal, opts.currency ?? 'CLP');
	}

	const vesAmount = convertUsdToVes(grandTotal, exchangeRate);
	if (paymentMethodUsesBolivaresInVenezuela(methodKey) && vesAmount != null) {
		return formatCartAmountPlain(vesAmount);
	}

	return formatCartMoney(grandTotal, 'USD');
}

/**
 * @param {{
 *   methodKey?: unknown;
 *   grandTotal?: unknown;
 *   currency?: unknown;
 *   exchangeRate?: unknown;
 *   country?: unknown;
 * }} opts
 * @returns {string}
 */
export function resolvePaymentAmountMessageValue(opts = {}) {
	const country = opts.country;
	const methodKey = opts.methodKey;
	const grandTotal = opts.grandTotal ?? 0;
	const exchangeRate = opts.exchangeRate;

	if (!isVenezuelaCountry(country)) {
		return formatCartMoney(grandTotal, opts.currency ?? 'CLP');
	}

	const usdLabel = formatCartMoney(grandTotal, 'USD');
	const vesAmount = convertUsdToVes(grandTotal, exchangeRate);

	if (paymentMethodUsesBolivaresInVenezuela(methodKey) && vesAmount != null) {
		const vesLabel = formatCartMoney(vesAmount, 'VES');
		return `${vesLabel} (${usdLabel})`;
	}

	return usdLabel;
}

export { isVenezuelaCountry };
