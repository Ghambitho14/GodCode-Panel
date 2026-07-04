import { parseLocalOrderChannels, parseOrdersViewMode } from '@/lib/delivery-settings';

export const DEFAULT_LOCAL_ORDER_CHANNELS = { mesa: true, retiro: true, delivery: true };

function branchStorageKey(companyId) {
	return companyId ? `godcode-panel:${companyId}:branchId` : null;
}

function ordersPanelSettingsCacheKey(companyId, branchId) {
	if (!companyId || !branchId || branchId === 'all') return null;
	return `godcode-panel:${companyId}:ordersPanel:${branchId}`;
}

export function readStoredBranchId(companyId) {
	const key = branchStorageKey(companyId);
	if (!key || typeof window === 'undefined') return null;
	try {
		const bid = localStorage.getItem(key);
		return bid && bid !== 'all' ? bid : null;
	} catch {
		return null;
	}
}

export function readOrdersPanelSettingsCache(companyId, branchId) {
	const key = ordersPanelSettingsCacheKey(companyId, branchId);
	if (!key || typeof window === 'undefined') return null;
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		return {
			ordersViewMode: parseOrdersViewMode(parsed?.ordersViewMode),
			localOrderChannels: parseLocalOrderChannels(parsed?.localOrderChannels ?? parsed),
		};
	} catch {
		return null;
	}
}

export function writeOrdersPanelSettingsCache(companyId, branchId, settings) {
	const key = ordersPanelSettingsCacheKey(companyId, branchId);
	if (!key || typeof window === 'undefined') return;
	try {
		localStorage.setItem(key, JSON.stringify({
			ordersViewMode: settings.ordersViewMode,
			localOrderChannels: settings.localOrderChannels,
		}));
	} catch {
		/* ignore quota / private mode */
	}
}

export function readInitialOrdersPanelSettings(companyId) {
	const branchId = readStoredBranchId(companyId);
	const cached = branchId ? readOrdersPanelSettingsCache(companyId, branchId) : null;
	return {
		branchId,
		cached,
		ordersViewMode: cached?.ordersViewMode ?? 'mesas',
		localOrderChannels: cached?.localOrderChannels ?? { ...DEFAULT_LOCAL_ORDER_CHANNELS },
		ready: Boolean(cached),
	};
}
