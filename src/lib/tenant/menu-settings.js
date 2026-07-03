/** @typedef {'both' | 'whatsapp_only' | 'panel_only'} OrderChannelMode */

/** @typedef {{ cartEnabled: boolean; orderChannel: OrderChannelMode }} CompanyMenuSettings */

const ORDER_CHANNELS = new Set(['both', 'whatsapp_only', 'panel_only']);

/**
 * @param {unknown} raw
 * @returns {CompanyMenuSettings}
 */
export function extractMenuSettingsFromIntegration(raw) {
	const defaults = { cartEnabled: true, orderChannel: 'both' };
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaults;

	const root = /** @type {Record<string, unknown>} */ (raw);
	const menu = root.menu;
	if (!menu || typeof menu !== 'object' || Array.isArray(menu)) return defaults;

	const m = /** @type {Record<string, unknown>} */ (menu);
	const cartEnabled = m.cartEnabled !== false && m.cart_enabled !== false;
	const channelRaw = String(m.orderChannel ?? m.order_channel ?? 'both').trim();
	const orderChannel = ORDER_CHANNELS.has(channelRaw)
		? /** @type {OrderChannelMode} */ (channelRaw)
		: 'both';

	return { cartEnabled, orderChannel };
}

/**
 * @param {unknown} planFeatures
 * @param {CompanyMenuSettings} menuSettings
 * @returns {boolean}
 */
export function resolveOnlineOrderingEnabled(planFeatures, menuSettings) {
	if (!menuSettings.cartEnabled) return false;
	if (!planFeatures) return true;

	if (Array.isArray(planFeatures)) {
		return planFeatures.includes('online_ordering');
	}

	if (typeof planFeatures === 'object' && !Array.isArray(planFeatures)) {
		const f = /** @type {Record<string, unknown>} */ (planFeatures);
		if (f.online_ordering === false) return false;
		if (f.onlineOrdering === false) return false;
	}

	return true;
}

/**
 * @param {OrderChannelMode | string} orderChannel
 * @returns {boolean}
 */
export function shouldPersistOrderToPanel(orderChannel) {
	return orderChannel !== 'whatsapp_only';
}

/**
 * @param {OrderChannelMode | string} orderChannel
 * @returns {boolean}
 */
export function shouldOpenWhatsAppOnCheckout(orderChannel) {
	return orderChannel === 'both' || orderChannel === 'whatsapp_only';
}

/**
 * @param {OrderChannelMode | string} orderChannel
 * @returns {boolean}
 */
export function requiresOpenShiftForCheckout(orderChannel) {
	return orderChannel === 'both' || orderChannel === 'panel_only';
}

export const SALES_TAB_IDS = ['caja', 'analytics', 'local_expenses'];

/**
 * @typedef {{
 *   menuSettings: CompanyMenuSettings;
 *   onlineOrderingEnabled: boolean;
 *   receivesMenuCheckoutInPanel: boolean;
 *   menuCheckoutUsesWhatsApp: boolean;
 *   menuCheckoutRequiresOpenShift: boolean;
 *   showOnlineOrdersQueue: boolean;
 *   showWhatsAppOnlyBanner: boolean;
 *   showCatalogOnlyBanner: boolean;
 *   showPanelOnlyBanner: boolean;
 *   hideSalesTabs: boolean;
 * }} TenantPanelOrderCapabilities
 */

/**
 * @param {CompanyMenuSettings} menuSettings
 * @param {unknown} [planFeatures]
 * @returns {TenantPanelOrderCapabilities}
 */
export function resolvePanelCapabilities(menuSettings, planFeatures) {
	const onlineOrderingEnabled = resolveOnlineOrderingEnabled(planFeatures, menuSettings);
	const { cartEnabled, orderChannel } = menuSettings;

	const receivesMenuCheckoutInPanel = cartEnabled
		&& onlineOrderingEnabled
		&& shouldPersistOrderToPanel(orderChannel);
	const menuCheckoutUsesWhatsApp = cartEnabled
		&& onlineOrderingEnabled
		&& shouldOpenWhatsAppOnCheckout(orderChannel);
	const menuCheckoutRequiresOpenShift = cartEnabled
		&& onlineOrderingEnabled
		&& requiresOpenShiftForCheckout(orderChannel);

	return {
		menuSettings,
		onlineOrderingEnabled,
		receivesMenuCheckoutInPanel,
		menuCheckoutUsesWhatsApp,
		menuCheckoutRequiresOpenShift,
		showOnlineOrdersQueue: receivesMenuCheckoutInPanel,
		showCatalogOnlyBanner: !cartEnabled || !onlineOrderingEnabled,
		showWhatsAppOnlyBanner: cartEnabled && onlineOrderingEnabled && orderChannel === 'whatsapp_only',
		showPanelOnlyBanner: cartEnabled && onlineOrderingEnabled && orderChannel === 'panel_only',
		hideSalesTabs: !cartEnabled || !onlineOrderingEnabled,
	};
}
