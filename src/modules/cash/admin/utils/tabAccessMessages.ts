import {
	ADMIN_PANEL_TAB_IDS,
	DEFAULT_ROLE_NAV_PERMISSIONS,
	normalizePanelUserRole,
	normalizeStoredNavTabId,
} from "@/shared/constants/admin-panel-tabs";
import { MENU_ONLY_PANEL_TABS, SALES_TAB_IDS } from "@/lib/tenant/menu-settings";

export type TabAccessDenialReason =
	| "role"
	| "panel_access"
	| "menu_catalog"
	| "menu_whatsapp_only"
	| "menu_only_plan";

export interface TabAccessMenuCapabilities {
	hideSalesTabs: boolean;
	showOnlineOrdersQueue: boolean;
	/** `plans.features.product_mode`; con «solo menú digital» todo rol ve el catálogo. */
	planProductMode?: string | null;
}

/**
 * Pestañas que el rol puede ver, antes de cruzarlas con `panelAccess` y el canal del menú.
 * Con «solo menú digital» no hay caja que operar: todo rol, cajero incluido, ve el
 * catálogo (si no, el cajero se quedaba sin ninguna pestaña).
 */
export function resolveRoleAllowedTabIds(roleKey: string, planProductMode?: string | null): string[] {
	if (planProductMode === "menu_only") return [...MENU_ONLY_PANEL_TABS];
	const fallback = DEFAULT_ROLE_NAV_PERMISSIONS[roleKey] ?? DEFAULT_ROLE_NAV_PERMISSIONS.cashier;
	return Array.isArray(fallback) ? [...fallback] : [...DEFAULT_ROLE_NAV_PERMISSIONS.cashier];
}

/** Texto del área principal cuando el usuario no tiene ninguna pestaña accesible. */
export function getNoAccessibleTabsMessage(planProductMode?: string | null): { title: string; text: string } {
	if (planProductMode === "menu_only") {
		return { title: "Tu plan no incluye caja", text: "Carga tu menú desde el panel CEO." };
	}
	return {
		title: "No tienes secciones habilitadas",
		text: "Pide a un administrador que habilite tu acceso a este panel.",
	};
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

/**
 * Pestañas fijas que ve el usuario (las de `AdminProvider`): las de su rol dentro de
 * `panelAccess` y sin las que oculta el canal del menú. Sin rol todavía, las del local.
 * Usa las mismas reglas que `resolveTabAccessDenialReason`.
 */
export function resolveAllowedPanelTabIds(ctx: Omit<TabAccessContext, "tabId" | "dynamicModules">): string[] {
	const roleKey = normalizePanelUserRole(ctx.userRole) ?? "";
	const companyAllowedTabs = new Set<string>(ctx.normalizedPanelAccess ?? ADMIN_PANEL_TAB_IDS);
	const menuRestrictedTabs = getMenuRestrictedTabs(ctx.menuCapabilities);
	const candidates = roleKey
		? resolveRoleAllowedTabIds(roleKey, ctx.menuCapabilities.planProductMode)
		: [...companyAllowedTabs];
	return candidates.filter((tab) => companyAllowedTabs.has(tab) && !menuRestrictedTabs.has(tab));
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

	const planProductMode = ctx.menuCapabilities.planProductMode ?? null;
	const roleAllowedTabs = new Set(
		roleKey
			? resolveRoleAllowedTabIds(roleKey, planProductMode)
			: [...companyAllowedTabs].filter((tab) => !menuRestrictedTabs.has(tab)),
	);

	const isAccessible =
		roleAllowedTabs.has(tabId) &&
		companyAllowedTabs.has(tabId) &&
		!menuRestrictedTabs.has(tabId);

	if (isAccessible) return null;

	// Fuera del catálogo con «solo menú»: es cosa del plan, no del rol ni del local.
	if (planProductMode === "menu_only" && !MENU_ONLY_PANEL_TABS.includes(tabId)) {
		return "menu_only_plan";
	}

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
		case "menu_only_plan":
			return "Tu plan es solo menú digital. Esta sección no está incluida.";
		case "panel_access":
			return "Esta sección no está habilitada para tu local.";
		case "role":
		default:
			return "Necesitas un rol diferente para acceder a esta sección.";
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
