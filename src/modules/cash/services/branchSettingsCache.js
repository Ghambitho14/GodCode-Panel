/** TTL: `delivery_settings` JSONB por sucursal (RAM only — no sessionStorage). */
export const BRANCH_SETTINGS_MAX_AGE_MS = 3 * 60_000;

/** @type {Map<string, { data: unknown, fetchedAt: number }>} */
const entries = new Map();

/** @type {Map<string, Promise<unknown>>} */
const inFlight = new Map();

function branchSettingsKey(branchId) {
	return `branch-settings:${String(branchId)}`;
}

function isFresh(entry, maxAgeMs) {
	if (!entry) return false;
	return Date.now() - entry.fetchedAt < maxAgeMs;
}

/**
 * @template T
 * @param {string | null | undefined} branchId
 * @param {() => Promise<T>} fetcher
 * @param {{ maxAgeMs?: number, force?: boolean }} [options]
 * @returns {Promise<T>}
 */
export function getBranchSettings(branchId, fetcher, options = {}) {
	if (!branchId || branchId === 'all') return fetcher();

	const key = branchSettingsKey(branchId);
	const maxAgeMs = options.maxAgeMs ?? BRANCH_SETTINGS_MAX_AGE_MS;
	const force = Boolean(options.force);

	if (!force) {
		const hit = entries.get(key);
		if (isFresh(hit, maxAgeMs)) {
			return /** @type {Promise<T>} */ (Promise.resolve(hit.data));
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

/** @param {string | null | undefined} branchId */
export function invalidateBranchSettings(branchId) {
	if (!branchId || branchId === 'all') return;
	const key = branchSettingsKey(branchId);
	entries.delete(key);
	inFlight.delete(key);
}

export function invalidateAllBranchSettings() {
	entries.clear();
	inFlight.clear();
}

/** Solo para tests. */
export function resetBranchSettingsCacheForTests() {
	invalidateAllBranchSettings();
}
