import {
	ADMIN_PANEL_TAB_IDS,
	DEFAULT_ROLE_NAV_PERMISSIONS,
	normalizePanelUserRole,
	normalizeStoredNavTabId,
} from "@/shared/constants/admin-panel-tabs";
import { SALES_TAB_IDS } from "@/lib/tenant/menu-settings";

export type TabAccessDenialReason =
	| "role"
	| "panel_access"
	| "menu_catalog"
	| "menu_whatsapp_only";

export interface TabAccessMenuCapabilities {
	hideSalesTabs: boolean;
	showOnlineOrdersQueue: boolean;
}

export interface TabAccessDynamicModule {
	tabId: string;
	isActive: boolean;
	allowedRoles?: string[];
}

export interface TabAccessContext {
	tabId: string;
	userRole: string | null | undefined;
	normalizedPanelAccess: string[] | null;
	menuCapabilities: TabAccessMenuCapabilities;
	dynamicModules?: TabAccessDynamicModule[];
}

function getMenuRestrictedTabs(menuCapabilities: TabAccessMenuCapabilities): Set<string> {
	const hidden = new Set<string>();
	if (menuCapabilities.hideSalesTabs) {
		hidden.add("orders");
		for (const tab of SALES_TAB_IDS) hidden.add(tab);
	} else if (!menuCapabilities.showOnlineOrdersQueue) {
		hidden.add("orders");
	}
	return hidden;
}

function isDynamicModuleAccessible(
	tabId: string,
	roleKey: string,
	dynamicModules: TabAccessDynamicModule[] | undefined,
): boolean | null {
	const module = dynamicModules?.find((entry) => entry.tabId === tabId && entry.isActive);
	if (!module) return null;
	if (!roleKey) return false;
	if (!Array.isArray(module.allowedRoles) || module.allowedRoles.length === 0) return true;
	return module.allowedRoles.map((role) => String(role).toLowerCase()).includes(roleKey);
}

export function resolveTabAccessDenialReason(ctx: TabAccessContext): TabAccessDenialReason | null {
	const tabId = normalizeStoredNavTabId(ctx.tabId);
	const roleKey = normalizePanelUserRole(ctx.userRole) ?? "";
	const companyAllowedTabs = new Set(ctx.normalizedPanelAccess ?? ADMIN_PANEL_TAB_IDS);
	const menuRestrictedTabs = getMenuRestrictedTabs(ctx.menuCapabilities);

	const dynamicAccess = isDynamicModuleAccessible(tabId, roleKey, ctx.dynamicModules);
	if (dynamicAccess === true) return null;
	if (dynamicAccess === false) return "role";

	const roleAllowedTabs = new Set(
		roleKey
			? (DEFAULT_ROLE_NAV_PERMISSIONS[roleKey] ?? DEFAULT_ROLE_NAV_PERMISSIONS.cashier)
			: [...companyAllowedTabs].filter((tab) => !menuRestrictedTabs.has(tab)),
	);

	const isAccessible =
		roleAllowedTabs.has(tabId) &&
		companyAllowedTabs.has(tabId) &&
		!menuRestrictedTabs.has(tabId);

	if (isAccessible) return null;

	if (menuRestrictedTabs.has(tabId)) {
		if (ctx.menuCapabilities.hideSalesTabs) return "menu_catalog";
		if (tabId === "orders" && !ctx.menuCapabilities.showOnlineOrdersQueue) {
			return "menu_whatsapp_only";
		}
		return "menu_catalog";
	}

	if (!companyAllowedTabs.has(tabId)) return "panel_access";
	if (!roleAllowedTabs.has(tabId)) return "role";

	return "role";
}

export function getTabAccessDenialMessage(reason: TabAccessDenialReason): string {
	switch (reason) {
		case "menu_catalog":
			return "Menú en modo catálogo. Esa sección no está disponible.";
		case "menu_whatsapp_only":
			return "Pedidos del menú en modo solo WhatsApp. La cola online no está disponible.";
		case "panel_access":
			return "Esta sección no está habilitada para tu local.";
		case "role":
		default:
			return "Necesitás un rol diferente para acceder a esta sección.";
	}
}

export function getTabAccessDenialMessageForTab(ctx: TabAccessContext): string {
	const reason = resolveTabAccessDenialReason(ctx);
	if (!reason) return "";
	return getTabAccessDenialMessage(reason);
}

export function resolveSidebarRestrictedHint(
	tabIds: string[],
	ctx: Omit<TabAccessContext, "tabId">,
): string {
	let hasRoleRestriction = false;
	let hasNonRoleRestriction = false;

	for (const tabId of tabIds) {
		const reason = resolveTabAccessDenialReason({ ...ctx, tabId });
		if (!reason) continue;
		if (reason === "role") hasRoleRestriction = true;
		else hasNonRoleRestriction = true;
	}

	if (hasNonRoleRestriction) {
		return "Algunas secciones están desactivadas o no habilitadas para tu local.";
	}
	if (hasRoleRestriction) {
		return "Las opciones en gris requieren un rol diferente.";
	}
	return "";
}
