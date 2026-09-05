/**
 * @param {unknown} n
 * @param {number} [fallback=0]
 * @returns {number}
 */
export function safeNumber(n, fallback = 0) {
	const x = Number(n);
	return Number.isFinite(x) ? x : fallback;
}
