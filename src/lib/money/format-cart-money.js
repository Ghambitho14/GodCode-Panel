import { safeNumber } from '@/shared/utils/numberSafe';
import { fractionDigitsForCurrency, localeForCurrency, normalizeCurrencyCode } from '@/shared/utils/money';

/**
 * @param {unknown} amount
 * @param {unknown} currency
 * @returns {string}
 */
export function formatCartMoney(amount, currency) {
	const code = normalizeCurrencyCode(currency);
	const locale = localeForCurrency(code);
	const fractionDigits = fractionDigitsForCurrency(code);
	const value = safeNumber(amount, 0);

	if (code === 'VES') {
		const formatted = value.toLocaleString(locale, {
			minimumFractionDigits: fractionDigits,
			maximumFractionDigits: fractionDigits,
		});
		return `Bs. ${formatted}`;
	}

	try {
		return new Intl.NumberFormat(locale, {
			style: 'currency',
			currency: code,
			maximumFractionDigits: fractionDigits,
			minimumFractionDigits: fractionDigits,
		}).format(value);
	} catch {
		return `$${value.toLocaleString(locale)}`;
	}
}

/**
 * Monto plano para copiar al portapapeles (bolívares sin símbolo).
 *
 * @param {unknown} amount
 * @param {unknown} [locale]
 * @returns {string}
 */
export function formatCartAmountPlain(amount, locale = localeForCurrency('VES')) {
	const value = safeNumber(amount, 0);
	const fractionDigits = fractionDigitsForCurrency('VES');
	return value.toLocaleString(locale, {
		minimumFractionDigits: fractionDigits,
		maximumFractionDigits: fractionDigits,
	});
}
