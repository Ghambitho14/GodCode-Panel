import { describe, expect, it } from "vitest";

import {
	chooseInitial,
	loadAddonData,
	readLocalCopy,
	saveAddonData,
	type AddonDataClient,
} from "@/addons/addon-data";

const target = { companyId: "c1", addon: "plantilla-excel", key: "b1" };

/** Cliente falso: guarda las llamadas y responde lo que se le diga. */
function fakeClient(response: { data: unknown; error: { message: string } | null }) {
	const calls: Array<[string, ...unknown[]]> = [];
	const result = Promise.resolve(response);
	const client: AddonDataClient = {
		from: (table) => {
			calls.push(["from", table]);
			return {
				select: (columns) => {
					calls.push(["select", columns]);
					const eq3 = (column: string, value: string) => {
						calls.push(["eq", column, value]);
						return { maybeSingle: () => result };
					};
					const eq2 = (column: string, value: string) => {
						calls.push(["eq", column, value]);
						return { eq: eq3 };
					};
					return {
						eq: (column: string, value: string) => {
							calls.push(["eq", column, value]);
							return { eq: eq2 };
						},
					};
				},
				upsert: (row, options) => {
					calls.push(["upsert", row, options]);
					return {
						select: (columns) => {
							calls.push(["select", columns]);
							return { single: () => result };
						},
					};
				},
			};
		},
	};
	return { client, calls };
}

describe("addon_data en Supabase", () => {
	it("lee la fila de la empresa, el extra y la clave", async () => {
		const { client, calls } = fakeClient({ data: { data: { a: 1 }, updated_at: "2026-10-13T05:00:00Z" }, error: null });
		await expect(loadAddonData(client, target)).resolves.toEqual({ data: { a: 1 }, updatedAt: "2026-10-13T05:00:00Z" });
		expect(calls).toEqual([
			["from", "addon_data"],
			["select", "data, updated_at"],
			["eq", "company_id", "c1"],
			["eq", "addon", "plantilla-excel"],
			["eq", "key", "b1"],
		]);
	});

	it("sin fila devuelve null y un error se lanza", async () => {
		await expect(loadAddonData(fakeClient({ data: null, error: null }).client, target)).resolves.toBeNull();
		await expect(loadAddonData(fakeClient({ data: null, error: { message: "sin permiso" } }).client, target)).rejects.toThrow(
			"sin permiso",
		);
	});

	it("guarda con upsert por empresa, extra y clave", async () => {
		const { client, calls } = fakeClient({ data: { updated_at: "2026-10-13T05:01:00Z" }, error: null });
		await expect(saveAddonData(client, target, { hojas: [] })).resolves.toBe("2026-10-13T05:01:00Z");
		expect(calls[1]).toEqual([
			"upsert",
			{ company_id: "c1", addon: "plantilla-excel", key: "b1", data: { hojas: [] } },
			{ onConflict: "company_id,addon,key" },
		]);
	});
});

describe("copia en el navegador", () => {
	it("lo guardado antes de la base cuenta como cambios viejos sin subir", () => {
		expect(readLocalCopy(JSON.stringify({ version: 1, sheets: [] }))).toEqual({
			v: 2,
			data: { version: 1, sheets: [] },
			dirty: true,
			at: new Date(0).toISOString(),
		});
		expect(readLocalCopy("no es json")).toBeNull();
		expect(readLocalCopy(null)).toBeNull();
	});

	it("abre lo de la base salvo que el navegador tenga cambios sin subir más nuevos", () => {
		const remote = { data: "base", updatedAt: "2026-10-13T05:00:00Z" };
		const old = { v: 2 as const, data: "local", dirty: true, at: "2026-10-13T04:00:00Z" };
		const newer = { ...old, at: "2026-10-13T06:00:00Z" };

		expect(chooseInitial(null, remote)).toEqual({ data: "base", push: false });
		expect(chooseInitial(old, remote)).toEqual({ data: "base", push: false });
		expect(chooseInitial(newer, remote)).toEqual({ data: "local", push: true });
		expect(chooseInitial({ ...newer, dirty: false }, remote)).toEqual({ data: "base", push: false });
		// La base todavía no tiene nada: se sube lo del navegador (también lo de antes de la base).
		expect(chooseInitial(old, null)).toEqual({ data: "local", push: true });
		expect(chooseInitial(null, null)).toEqual({ data: null, push: false });
	});
});
