/** TTL por defecto: catálogo de empresa (categories + products). */
export const COMPANY_CATALOG_MAX_AGE_MS = 5 * 60_000;

/** TTL por defecto: overlay por sucursal (prices, product_branch, category_branch). */
export const BRANCH_OVERLAY_MAX_AGE_MS = 3 * 60_000;

/** @type {Map<string, { data: unknown, fetchedAt: number }>} */
const entries = new Map();

/** @type {Map<string, Promise<unknown>>} */
const inFlight = new Map();

function companyKey(companyId) {
	return `company:${String(companyId)}`;
}

function branchKey(branchId) {
	return `branch:${String(branchId)}`;
}

function isFresh(entry, maxAgeMs) {
	if (!entry) return false;
	return Date.now() - entry.fetchedAt < maxAgeMs;
}

/**
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} fetcher
 * @param {{ maxAgeMs?: number, force?: boolean }} [options]
 * @returns {Promise<T>}
 */
async function getCached(key, fetcher, options = {}) {
	const maxAgeMs = options.maxAgeMs ?? COMPANY_CATALOG_MAX_AGE_MS;
	const force = Boolean(options.force);

	if (!force) {
		const hit = entries.get(key);
		if (isFresh(hit, maxAgeMs)) {
			return /** @type {T} */ (hit.data);
		}
	}

	const pending = inFlight.get(key);
	if (pending) {
		return /** @type {Promise<T>} */ (pending);
	}

	const promise = (async () => {
		try {
			const data = await fetcher();
			entries.set(key, { data, fetchedAt: Date.now() });
			return data;
		} finally {
			inFlight.delete(key);
		}
	})();

	inFlight.set(key, promise);
	return promise;
}

/**
 * @template T
 * @param {string | null | undefined} companyId
 * @param {() => Promise<T>} fetcher
 * @param {{ maxAgeMs?: number, force?: boolean }} [options]
 */
export function getCompanyCatalog(companyId, fetcher, options) {
	if (!companyId) return fetcher();
	return getCached(companyKey(companyId), fetcher, {
		maxAgeMs: options?.maxAgeMs ?? COMPANY_CATALOG_MAX_AGE_MS,
		force: options?.force,
	});
}

/**
 * @template T
 * @param {string | null | undefined} branchId
 * @param {() => Promise<T>} fetcher
 * @param {{ maxAgeMs?: number, force?: boolean }} [options]
 */
export function getBranchOverlay(branchId, fetcher, options) {
	if (!branchId || branchId === 'all') return fetcher();
	return getCached(branchKey(branchId), fetcher, {
		maxAgeMs: options?.maxAgeMs ?? BRANCH_OVERLAY_MAX_AGE_MS,
		force: options?.force,
	});
}

/** @param {string | null | undefined} companyId */
export function invalidateCompanyCatalog(companyId) {
	if (!companyId) return;
	entries.delete(companyKey(companyId));
	inFlight.delete(companyKey(companyId));
}

/** @param {string | null | undefined} branchId */
export function invalidateBranchOverlay(branchId) {
	if (!branchId || branchId === 'all') return;
	entries.delete(branchKey(branchId));
	inFlight.delete(branchKey(branchId));
}

export function invalidateAll() {
	entries.clear();
	inFlight.clear();
}

/** Solo para tests. */
export function resetPanelCatalogCacheForTests() {
	invalidateAll();
}
