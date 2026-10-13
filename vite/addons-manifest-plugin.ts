import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";

/**
 * Publica `/addons-manifest.json`: la lista de extras a medida que hay en `src/addons/`
 * (uno por carpeta con `manifest.json` e `index.tsx`; las que empiezan con `_` no cuentan).
 * El super admin de GodCode la lee para mostrar en «Gestionar empresa › Extras» los extras que
 * existen en el panel, aunque todavía no estén en el catálogo.
 */

export type PublishedAddon = { id: string; label: string; description: string | null };

const MODULE_ID = /^[a-z0-9][a-z0-9-]{1,48}$/;

export function readAddonManifests(addonsDir: string): PublishedAddon[] {
	if (!existsSync(addonsDir)) return [];
	const out: PublishedAddon[] = [];
	for (const entry of readdirSync(addonsDir, { withFileTypes: true })) {
		if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
		const dir = join(addonsDir, entry.name);
		const manifestPath = join(dir, "manifest.json");
		if (!existsSync(manifestPath) || !existsSync(join(dir, "index.tsx"))) continue;
		try {
			const raw = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
			if (raw.id !== entry.name || !MODULE_ID.test(entry.name) || typeof raw.label !== "string") continue;
			out.push({
				id: entry.name,
				label: raw.label.trim() || entry.name,
				description: typeof raw.description === "string" && raw.description.trim() ? raw.description.trim() : null,
			});
		} catch {
			// Un manifest roto no tumba el resto.
		}
	}
	return out.sort((a, b) => a.id.localeCompare(b.id));
}

export function addonsManifestPlugin(root: string): Plugin {
	const addonsDir = join(root, "src", "addons");
	const body = () => JSON.stringify({ addons: readAddonManifests(addonsDir) });
	return {
		name: "godcode-addons-manifest",
		configureServer(server) {
			server.middlewares.use("/addons-manifest.json", (_req, res) => {
				res.setHeader("Content-Type", "application/json; charset=utf-8");
				res.setHeader("Cache-Control", "no-store");
				res.end(body());
			});
		},
		generateBundle() {
			this.emitFile({ type: "asset", fileName: "addons-manifest.json", source: body() });
		},
	};
}
