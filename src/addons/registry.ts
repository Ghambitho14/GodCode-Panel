import type { AddonModule } from "./types";

/**
 * Extras a medida del panel. Cada carpeta `src/addons/<modulo>/` con un `index.tsx` se
 * registra sola: agregar un extra no toca ningún otro archivo del panel. Las carpetas que
 * empiezan con `_` (plantillas) se ignoran.
 *
 * Una empresa ve el módulo cuando tiene activo un extra cuyo «Módulo del panel»
 * (`addons.panel_module`) es el nombre de la carpeta.
 */

const MODULE_ID = /^[a-z0-9][a-z0-9-]{1,48}$/;

export const ADDON_TAB_PREFIX = "module:addon-";

type ManifestImport = { default?: AddonModule };

export function buildAddonRegistry(files: Record<string, ManifestImport>): Map<string, AddonModule> {
	const registry = new Map<string, AddonModule>();
	for (const [path, mod] of Object.entries(files)) {
		const folder = path.split("/").slice(-2, -1)[0] ?? "";
		if (!folder || folder.startsWith("_")) continue;
		const manifest = mod?.default;
		if (!manifest || manifest.id !== folder || !MODULE_ID.test(folder) || !manifest.Component) {
			console.warn(`[addons] ${path}: el id del manifiesto tiene que ser «${folder}» y traer Component.`);
			continue;
		}
		registry.set(folder, manifest);
	}
	return registry;
}

const registry = buildAddonRegistry(
	import.meta.glob<ManifestImport>("./*/index.tsx", { eager: true }),
);

export function getAddonModule(id: string | null | undefined): AddonModule | null {
	return id ? registry.get(id) ?? null : null;
}

export function addonTabId(id: string): string {
	return `${ADDON_TAB_PREFIX}${id}`;
}

export function addonIdFromTab(tabId: string | null | undefined): string | null {
	return typeof tabId === "string" && tabId.startsWith(ADDON_TAB_PREFIX) ? tabId.slice(ADDON_TAB_PREFIX.length) : null;
}
