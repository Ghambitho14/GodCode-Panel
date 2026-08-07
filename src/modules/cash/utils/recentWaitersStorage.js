const MAX_RECENT_WAITERS = 8;

function storageKey(companyId, branchId) {
	if (!companyId || !branchId || branchId === 'all') return null;
	return `godcode-panel:${companyId}:recentWaiters:${branchId}`;
}

function normalizeWaiterName(name) {
	return String(name ?? '').trim().replace(/\s+/g, ' ');
}

/**
 * Meseros recientes por sucursal (localStorage) para selección rápida al Abrir mesa.
 */
export function listRecentWaiters(companyId, branchId) {
	const key = storageKey(companyId, branchId);
	if (!key || typeof window === 'undefined') return [];
	try {
		const raw = window.localStorage.getItem(key);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed
			.map((entry) => normalizeWaiterName(typeof entry === 'string' ? entry : entry?.name))
			.filter((name) => name.length >= 2)
			.slice(0, MAX_RECENT_WAITERS);
	} catch {
		return [];
	}
}

export function rememberWaiter(companyId, branchId, name) {
	const key = storageKey(companyId, branchId);
	const normalized = normalizeWaiterName(name);
	if (!key || typeof window === 'undefined' || normalized.length < 2) return listRecentWaiters(companyId, branchId);

	const previous = listRecentWaiters(companyId, branchId);
	const next = [
		normalized,
		...previous.filter((item) => item.toLowerCase() !== normalized.toLowerCase()),
	].slice(0, MAX_RECENT_WAITERS);

	try {
		window.localStorage.setItem(key, JSON.stringify(next));
	} catch {
		/* ignore quota / private mode */
	}
	return next;
}
