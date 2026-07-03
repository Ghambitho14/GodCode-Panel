import { useCallback, useMemo } from 'react';
import { normalizeDeliverySettings } from '@/lib/delivery-settings';
import {
	isVenezuelaCountry,
	resolveEffectiveCountry,
	resolveEffectiveCurrency,
} from '@/lib/geo/tenant-locale';
import {
	parseExchangeRate,
	resolvePaymentAmountCopyValue,
	resolvePaymentAmountDisplay,
	resolvePaymentAmountMessageValue,
} from '@/lib/money/venezuela-payment-copy';
import { formatCartMoney } from '@/lib/money/format-cart-money';
import { getFormStrategy } from '@/lib/geo/country-forms';
import { createMoneyFormatter } from '@/shared/utils/money';

/**
 * @param {unknown} deliverySettingsRaw
 * @returns {number | null}
 */
export function extractExchangeRateFromDeliverySettings(deliverySettingsRaw) {
	if (!deliverySettingsRaw || typeof deliverySettingsRaw !== 'object') return null;
	const o = /** @type {Record<string, unknown>} */ (deliverySettingsRaw);
	return parseExchangeRate(o.exchangeRate ?? o.exchange_rate);
}

/**
 * @param {{
 *   amountUsd?: unknown;
 *   amount?: unknown;
 *   branch?: { country?: string | null; currency?: string | null; delivery_settings?: unknown } | null;
 *   company?: { country?: string | null; currency?: string | null } | null;
 *   paymentMethod?: unknown;
 *   exchangeRate?: unknown;
 *   context?: 'display' | 'copy' | 'whatsapp' | 'plain';
 *   order?: { payment_method_specific?: unknown; total?: unknown; currency?: unknown } | null;
 * }} opts
 * @returns {string}
 */
export function formatOrderAmount(opts = {}) {
	const branch = opts.branch ?? null;
	const company = opts.company ?? null;
	const order = opts.order ?? null;
	const country = resolveEffectiveCountry(branch, company);
	const paymentMethod = opts.paymentMethod ?? order?.payment_method_specific ?? null;
	const amountUsd = opts.amountUsd ?? opts.amount ?? order?.total ?? 0;
	const exchangeRate = opts.exchangeRate
		?? extractExchangeRateFromDeliverySettings(branch?.delivery_settings);
	const context = opts.context ?? 'display';
	const currency = resolveEffectiveCurrency(branch, company);

	if (!isVenezuelaCountry(country)) {
		const fmt = createMoneyFormatter({ currency });
		return fmt.formatMoney(amountUsd);
	}

	const baseOpts = {
		methodKey: paymentMethod,
		grandTotal: amountUsd,
		currency: 'USD',
		exchangeRate,
		country,
	};

	if (context === 'copy') return resolvePaymentAmountCopyValue(baseOpts);
	if (context === 'whatsapp') return resolvePaymentAmountMessageValue(baseOpts);
	if (context === 'plain') return formatCartMoney(amountUsd, 'USD');
	return resolvePaymentAmountDisplay(baseOpts);
}

/**
 * Monto de pedido para WhatsApp / texto compartido.
 *
 * @param {Record<string, unknown> | null | undefined} order
 * @param {{ country?: string | null; currency?: string | null; delivery_settings?: unknown } | null | undefined} branch
 * @param {{ country?: string | null; currency?: string | null } | null | undefined} company
 * @param {unknown} [exchangeRate]
 * @param {unknown} [amountUsd]
 * @returns {string}
 */
export function formatOrderAmountForShare(order, branch, company, exchangeRate, amountUsd) {
	const amount = amountUsd ?? order?.total ?? 0;
	return formatOrderAmount({
		order,
		branch,
		company,
		exchangeRate,
		amountUsd: amount,
		paymentMethod: order?.payment_method_specific,
		context: 'whatsapp',
	});
}

/**
 * @param {{
 *   branch?: { country?: string | null; currency?: string | null; delivery_settings?: unknown } | null;
 *   company?: { country?: string | null; currency?: string | null } | null;
 *   exchangeRate?: unknown;
 * }} [shareLocale]
 * @returns {string}
 */
export function shareIdLabelFromLocale(shareLocale = {}) {
	const country = resolveEffectiveCountry(shareLocale.branch, shareLocale.company);
	return getFormStrategy(country).idName;
}

/**
 * @param {{
 *   branch?: { country?: string | null; currency?: string | null; delivery_settings?: unknown } | null;
 *   company?: { country?: string | null; currency?: string | null } | null;
 * }} params
 */
export function createOrderMoneyFormatter(params = {}) {
	const branch = params.branch ?? null;
	const company = params.company ?? null;
	const country = resolveEffectiveCountry(branch, company);
	const currency = resolveEffectiveCurrency(branch, company);
	const exchangeRate = extractExchangeRateFromDeliverySettings(branch?.delivery_settings);
	const branchFormatter = createMoneyFormatter({ currency, country });

	return {
		currency,
		country,
		exchangeRate,
		isVenezuela: isVenezuelaCountry(country),
		formatMoney: (amount) => branchFormatter.formatMoney(amount),
		formatOrderAmount: (amountOrOpts, maybeOpts) => {
			if (typeof amountOrOpts === 'object' && amountOrOpts !== null) {
				return formatOrderAmount({ branch, company, exchangeRate, ...amountOrOpts });
			}
			return formatOrderAmount({
				branch,
				company,
				exchangeRate,
				amountUsd: amountOrOpts,
				...(maybeOpts ?? {}),
			});
		},
	};
}

/**
 * @param {{
 *   branch?: { country?: string | null; currency?: string | null; delivery_settings?: unknown } | null;
 *   company?: { country?: string | null; currency?: string | null } | null;
 * }} params
 */
export function useOrderMoney(params = {}) {
	const branch = params.branch ?? null;
	const company = params.company ?? null;

	return useMemo(() => createOrderMoneyFormatter({ branch, company }), [branch, company]);
}

/**
 * @param {unknown} raw
 * @returns {number | null}
 */
export function resolveExchangeRateForBranch(raw) {
	const normalized = normalizeDeliverySettings(raw);
	return normalized.exchangeRate ?? null;
}
