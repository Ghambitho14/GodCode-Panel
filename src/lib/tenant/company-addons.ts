import { addonTabId, getAddonModule } from "@/addons/registry";
import type { AddonModule } from "@/addons/types";

/**
 * Extras (addons) de la empresa. Se compran en GodCode (/cuenta › Plan y extras) o los
 * activa el equipo; cada uno puede desbloquear pestañas del panel (`addons.unlocks_tabs`).
 *
 * Un extra vale mientras está `active` y no venció (`expires_at`). El vencimiento se mira
 * aquí, al cargar el panel: no hace falta un job que lo apague.
 */

export type CompanyAddonInfo = {
	id: string;
	name: string;
	description: string | null;
	unlocks_tabs: string[] | null;
	panel_module?: string | null;
};

export type CompanyAddonRow = {
	id: string;
	status: string | null;
	expires_at: string | null;
	addon: CompanyAddonInfo | CompanyAddonInfo[] | null;
};

export type ActiveCompanyAddon = {
	id: string;
	name: string;
	description: string | null;
	expiresAt: string | null;
	unlocksTabs: string[];
	/** Carpeta en `src/addons/` que abre (`addons.panel_module`); `null` si es un servicio sin pantalla. */
	panelModule: string | null;
};

export const COMPANY_ADDONS_SELECT = "id, status, expires_at, addon:addons(id, name, description, unlocks_tabs, panel_module)";

/** Los extras vigentes, en el orden en que llegan. */
export function activeCompanyAddons(rows: CompanyAddonRow[] | null | undefined, now: Date = new Date()): ActiveCompanyAddon[] {
	if (!Array.isArray(rows)) return [];
	const out: ActiveCompanyAddon[] = [];
	for (const row of rows) {
		if (String(row?.status ?? "").toLowerCase() !== "active") continue;
		if (row.expires_at) {
			const ends = new Date(row.expires_at).getTime();
			if (Number.isNaN(ends) || ends <= now.getTime()) continue;
		}
		const addon = Array.isArray(row.addon) ? row.addon[0] : row.addon;
		if (!addon) continue;
		out.push({
			id: row.id,
			name: addon.name,
			description: addon.description ?? null,
			expiresAt: row.expires_at,
			unlocksTabs: Array.isArray(addon.unlocks_tabs) ? addon.unlocks_tabs.filter((tab) => typeof tab === "string") : [],
			panelModule: typeof addon.panel_module === "string" && addon.panel_module ? addon.panel_module : null,
		});
	}
	return out;
}

/**
 * Suma a las pestañas de la empresa las que desbloquean sus extras vigentes.
 * `null`/`undefined` significa «todas»: así se queda (un extra no puede quitar pestañas).
 */
export function mergeAddonPanelAccess(
	panelAccess: string[] | null | undefined,
	addons: ActiveCompanyAddon[],
	normalizeTabId: (tabId: string) => string = (tabId) => tabId,
): string[] | null | undefined {
	if (!Array.isArray(panelAccess)) return panelAccess;
	const unlocked = addons.flatMap((addon) => addon.unlocksTabs);
	if (unlocked.length === 0) return panelAccess;
	const seen = new Set(panelAccess.map(normalizeTabId));
	const merged = [...panelAccess];
	for (const tab of unlocked) {
		const key = normalizeTabId(tab);
		if (seen.has(key)) continue;
		seen.add(key);
		merged.push(tab);
	}
	return merged;
}

export type AddonDynamicModule = {
	id: string;
	tabId: string;
	label: string;
	description: string;
	navGroup: "root" | "sales" | "menu";
	navOrder: number;
	allowedRoles: string[];
	isActive: boolean;
};

const DEFAULT_ADDON_ROLES = ["admin", "ceo"];

/**
 * Una pestaña del menú por cada extra vigente que abre un módulo de `src/addons/`. Si el
 * panel desplegado no trae esa carpeta (extra activado antes de publicar su código), no
 * aparece. El nombre del menú es el del extra en el catálogo.
 */
export function addonDynamicModules(
	addons: ActiveCompanyAddon[],
	resolve: (id: string) => AddonModule | null = getAddonModule,
): AddonDynamicModule[] {
	const out: AddonDynamicModule[] = [];
	const seen = new Set<string>();
	for (const addon of addons) {
		if (!addon.panelModule || seen.has(addon.panelModule)) continue;
		const module = resolve(addon.panelModule);
		if (!module) {
			console.warn(`[addons] «${addon.name}» abre el módulo «${addon.panelModule}», que este panel no trae.`);
			continue;
		}
		seen.add(addon.panelModule);
		out.push({
			id: `addon-${addon.id}`,
			tabId: addonTabId(addon.panelModule),
			label: addon.name || module.label,
			description: addon.description ?? module.description ?? "",
			navGroup: module.navGroup ?? "root",
			navOrder: 90,
			allowedRoles: module.allowedRoles ?? DEFAULT_ADDON_ROLES,
			isActive: true,
		});
	}
	return out;
}
