// @vitest-environment node
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { readAddonManifests } from "../../vite/addons-manifest-plugin";

function addon(root: string, folder: string, manifest: unknown, withIndex = true) {
	const dir = join(root, folder);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "manifest.json"), typeof manifest === "string" ? manifest : JSON.stringify(manifest));
	if (withIndex) writeFileSync(join(dir, "index.tsx"), "export default {};");
}

describe("addons-manifest.json", () => {
	it("publica solo los extras completos y bien nombrados", () => {
		const root = mkdtempSync(join(tmpdir(), "addons-"));
		addon(root, "libro-caja", { id: "libro-caja", label: " Libro de caja ", description: "Cuaderno" });
		addon(root, "cuadre", { id: "cuadre", label: "Cuadre" });
		addon(root, "_plantilla", { id: "_plantilla", label: "Plantilla" });
		addon(root, "otro-id", { id: "distinto", label: "X" });
		addon(root, "sin-index", { id: "sin-index", label: "X" }, false);
		addon(root, "roto", "{no es json");
		writeFileSync(join(root, "README.md"), "#");

		expect(readAddonManifests(root)).toEqual([
			{ id: "cuadre", label: "Cuadre", description: null },
			{ id: "libro-caja", label: "Libro de caja", description: "Cuaderno" },
		]);
	});

	it("sin carpeta, lista vacía", () => {
		expect(readAddonManifests(join(tmpdir(), "no-existe-addons-xyz"))).toEqual([]);
	});

	it("el panel real publica la plantilla Excel", () => {
		expect(readAddonManifests(join(__dirname, "../../src/addons")).map((a) => a.id)).toContain("plantilla-excel");
	});
});
