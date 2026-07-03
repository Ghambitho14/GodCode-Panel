const BCV_URL = 'https://ve.dolarapi.com/v1/dolares/oficial';
const CACHE_TTL_MS = 5 * 60 * 1000;

/** @type {{ rate: number | null; fetchedAt: number }} */
let cache = { rate: null, fetchedAt: 0 };

/**
 * @returns {number | null}
 */
export function getCachedBcvRate() {
	if (!cache.rate || Date.now() - cache.fetchedAt > CACHE_TTL_MS) return null;
	return cache.rate;
}

/**
 * Tasa BCV en vivo (promedio). Solo referencia en panel; el menú hace su propio fetch.
 *
 * @returns {Promise<number | null>}
 */
export async function fetchBcvRate() {
	const cached = getCachedBcvRate();
	if (cached != null) return cached;

	try {
		const res = await fetch(BCV_URL, { signal: AbortSignal.timeout(8000) });
		if (!res.ok) return null;
		const data = await res.json();
		const promedio = Number(data?.promedio);
		if (!Number.isFinite(promedio) || promedio <= 0) return null;
		cache = { rate: promedio, fetchedAt: Date.now() };
		return promedio;
	} catch {
		return null;
	}
}
