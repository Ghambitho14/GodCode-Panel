import type { DatabaseCompanyTheme } from "./company-theme-types";

/**
 * Claves opcionales en `companies.theme_config` para el panel admin (gestor SaaS).
 * - `enabledAdminModuleTabIds`: si es un array no vacío, solo esos `tab_id` de `saas_admin_modules` se muestran.
 * - Sin clave o array vacío: todos los módulos activos del catálogo (comportamiento anterior).
 */
export type AdminPanelThemeExtensions = {
	tabLabels?: Record<string, string>;
	enabledAdminModuleTabIds?: string[] | null;
	/** Resultado parseado: inyectar tickets si falta en BD (`enableSupportTab !== false` en theme). */
	injectTicketsModuleIfMissing?: boolean;
	/** Por defecto true. Si false, no se registran atajos de teclado globales del panel. */
	adminShortcutsEnabled?: boolean;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

export function parseAdminPanelThemeExtensions(
	theme: DatabaseCompanyTheme | Record<string, unknown> | null | undefined,
): AdminPanelThemeExtensions {
	if (!isPlainObject(theme)) {
		return { adminShortcutsEnabled: true, injectTicketsModuleIfMissing: true };
	}
	const tabLabelsRaw = theme.tabLabels;
	let tabLabels: Record<string, string> | undefined;
	if (isPlainObject(tabLabelsRaw)) {
		tabLabels = {};
		for (const [k, v] of Object.entries(tabLabelsRaw)) {
			if (typeof v === "string" && v.trim()) {
				tabLabels[String(k).trim()] = v.trim();
			}
		}
		if (Object.keys(tabLabels).length === 0) {
			tabLabels = undefined;
		}
	}

	let enabledAdminModuleTabIds: string[] | null = null;
	const rawList = theme.enabledAdminModuleTabIds;
	if (Array.isArray(rawList) && rawList.length > 0) {
		enabledAdminModuleTabIds = rawList.filter((x): x is string => typeof x === "string" && x.length > 0);
	}

	const injectTicketsModuleIfMissing = theme.enableSupportTab !== false;
	const adminShortcutsEnabled =
		theme.adminShortcutsEnabled === undefined ? true : Boolean(theme.adminShortcutsEnabled);

	return {
		tabLabels,
		enabledAdminModuleTabIds,
		injectTicketsModuleIfMissing,
		adminShortcutsEnabled,
	};
}

export function filterDynamicAdminModules<T extends { tabId: string }>(
	modules: T[],
	enabledIds: string[] | null,
): T[] {
	if (!enabledIds || enabledIds.length === 0) {
		return modules;
	}
	const allow = new Set(enabledIds);
	return modules.filter((m) => allow.has(m.tabId));
}
