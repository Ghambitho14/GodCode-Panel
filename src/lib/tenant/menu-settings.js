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
 * Qué producto trae el plan (`plans.features.product_mode`, lo guarda el super admin):
 * - `full`: menú digital y panel completos (también si falta la clave).
 * - `menu_only`: solo menú digital. Los pedidos van al WhatsApp del dueño y el panel queda
 *   en catálogo (productos, categorías, bebidas, extras, cambios) y banners.
 * - `panel_only`: panel completo sin menú público.
 * @typedef {'full' | 'menu_only' | 'panel_only'} PlanProductMode
 */

const PLAN_PRODUCT_MODES = new Set(['full', 'menu_only', 'panel_only']);

/** Pestañas del panel con «solo menú digital». */
export const MENU_ONLY_PANEL_TABS = [
	'categories',
	'products',
	'menu_beverages',
	'menu_extras',
	'menu_modifiers',
	'menu_carousel',
];

/**
 * @param {unknown} planFeatures
 * @returns {PlanProductMode}
 */
export function resolvePlanProductMode(planFeatures) {
	if (!planFeatures || typeof planFeatures !== 'object' || Array.isArray(planFeatures)) return 'full';
	const value = /** @type {Record<string, unknown>} */ (planFeatures).product_mode;
	return typeof value === 'string' && PLAN_PRODUCT_MODES.has(value)
		? /** @type {PlanProductMode} */ (value)
		: 'full';
}

/**
 * Pestañas que el plan deja ver. Con «solo menú digital» se recorta a catálogo y banners
 * aunque `theme_config.panelAccess` (copia del plan) esté desactualizado.
 * @param {PlanProductMode} mode
 * @param {string[] | null | undefined} panelAccess `null`/`undefined` = todas.
 * @param {(tabId: string) => string} [normalizeTabId]
 * @returns {string[] | null | undefined}
 */
export function applyPlanProductModeToPanelAccess(mode, panelAccess, normalizeTabId = (tabId) => tabId) {
	if (mode !== 'menu_only') return panelAccess;
	if (!Array.isArray(panelAccess) || panelAccess.length === 0) return [...MENU_ONLY_PANEL_TABS];
	const allowed = new Set(MENU_ONLY_PANEL_TABS);
	const kept = panelAccess.filter((tab) => allowed.has(normalizeTabId(tab)));
	return kept.length > 0 ? kept : [...MENU_ONLY_PANEL_TABS];
}

/**
 * @typedef {{
 *   menuSettings: CompanyMenuSettings;
 *   planProductMode: PlanProductMode;
 *   hasPublicMenu: boolean;
 *   showMenuOnlyBanner: boolean;
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
	const planProductMode = resolvePlanProductMode(planFeatures);
	// «Solo menú digital»: no hay panel que reciba pedidos, todo llega por WhatsApp.
	const effectiveSettings = planProductMode === 'menu_only'
		? { ...menuSettings, orderChannel: /** @type {OrderChannelMode} */ ('whatsapp_only') }
		: menuSettings;
	const onlineOrderingEnabled = resolveOnlineOrderingEnabled(planFeatures, effectiveSettings);
	const { cartEnabled, orderChannel } = effectiveSettings;

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
		menuSettings: effectiveSettings,
		planProductMode,
		hasPublicMenu: planProductMode !== 'panel_only',
		showMenuOnlyBanner: planProductMode === 'menu_only',
		onlineOrderingEnabled,
		receivesMenuCheckoutInPanel,
		menuCheckoutUsesWhatsApp,
		menuCheckoutRequiresOpenShift,
		showOnlineOrdersQueue: receivesMenuCheckoutInPanel,
		showCatalogOnlyBanner: !cartEnabled || !onlineOrderingEnabled,
		showWhatsAppOnlyBanner: planProductMode !== 'menu_only'
			&& cartEnabled && onlineOrderingEnabled && orderChannel === 'whatsapp_only',
		showPanelOnlyBanner: cartEnabled && onlineOrderingEnabled && orderChannel === 'panel_only',
		hideSalesTabs: !cartEnabled || !onlineOrderingEnabled,
	};
}
