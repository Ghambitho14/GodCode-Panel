/**
 * @param {unknown} n
 * @param {number} [fallback=0]
 * @returns {number}
 */
export function safeNumber(n, fallback = 0) {
	const x = Number(n);
	return Number.isFinite(x) ? x : fallback;
}

import { formatMoneyPlain } from '@/shared/utils/money';

/**
 * Entero/formateo sin símbolo (solo separadores miles), para tablas.
 * @param {unknown} value
 * @param {string} [locale='es-CL']
 * @returns {string}
 */
export function formatMoneyCl(value, locale = 'es-CL') {
	return formatMoneyPlain(value, locale);
}
