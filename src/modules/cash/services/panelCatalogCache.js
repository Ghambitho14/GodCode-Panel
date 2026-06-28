/** TTL por defecto: catálogo de empresa (categories + products). */
export const COMPANY_CATALOG_MAX_AGE_MS = 5 * 60_000;

/** TTL por defecto: overlay por sucursal (prices, product_branch, category_branch). */
export const BRANCH_OVERLAY_MAX_AGE_MS = 3 * 60_000;

const STORAGE_PREFIX = 'gc:panel:';

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

function storageKey(key) {
	return STORAGE_PREFIX + key;
}

function readSession(key) {
	try {
		const raw = sessionStorage.getItem(storageKey(key));
		return raw ? JSON.parse(raw) : null;
	} catch {
		return null;
	}
}

/** @param {string} key @param {{ data: unknown, fetchedAt: number }} entry */
function writeSession(key, entry) {
	try {
		sessionStorage.setItem(storageKey(key), JSON.stringify(entry));
	} catch {
		// QuotaExceededError: no persistir, RAM sigue OK
	}
}

function removeSession(key) {
	try {
		sessionStorage.removeItem(storageKey(key));
	} catch {
		// ignore
	}
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

		const sessionHit = readSession(key);
		if (isFresh(sessionHit, maxAgeMs)) {
			entries.set(key, sessionHit);
			return /** @type {T} */ (sessionHit.data);
		}
	}

	const pending = inFlight.get(key);
	if (pending) {
		return /** @type {Promise<T>} */ (pending);
	}

	const promise = (async () => {
		try {
			const data = await fetcher();
			const entry = { data, fetchedAt: Date.now() };
			entries.set(key, entry);
			writeSession(key, entry);
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
	const key = companyKey(companyId);
	entries.delete(key);
	inFlight.delete(key);
	removeSession(key);
}

/** @param {string | null | undefined} branchId */
export function invalidateBranchOverlay(branchId) {
	if (!branchId || branchId === 'all') return;
	const key = branchKey(branchId);
	entries.delete(key);
	inFlight.delete(key);
	removeSession(key);
}

export function clearPanelSessionStorage() {
	try {
		const keysToRemove = [];
		for (let i = 0; i < sessionStorage.length; i += 1) {
			const k = sessionStorage.key(i);
			if (k && k.startsWith(STORAGE_PREFIX)) {
				keysToRemove.push(k);
			}
		}
		keysToRemove.forEach((k) => sessionStorage.removeItem(k));
	} catch {
		// ignore
	}
}

export function invalidateAll() {
	entries.clear();
	inFlight.clear();
	clearPanelSessionStorage();
}

/** Solo para tests. */
export function resetPanelCatalogCacheForTests() {
	invalidateAll();
}

/** Solo para tests: simula F5 (RAM vacía, sessionStorage intacto). */
export function clearRamPanelCatalogCacheForTests() {
	entries.clear();
	inFlight.clear();
}
