import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Base falsa: una fila (o ninguna) y si el guardado falla. */
const db = vi.hoisted(() => ({
	row: null as { data: unknown; updated_at: string } | null,
	failSave: false,
	saves: [] as unknown[],
}));

vi.mock("@/integrations/supabase", () => {
	const chain = {
		select: () => chain,
		eq: () => chain,
		maybeSingle: async () => ({ data: db.row, error: null }),
		upsert: (row: { data: unknown }) => {
			db.saves.push(row.data);
			return {
				select: () => ({
					single: async () =>
						db.failSave
							? { data: null, error: { message: "sin conexión" } }
							: { data: { updated_at: "2026-10-13T06:00:00Z" }, error: null },
				}),
			};
		},
	};
	return { supabase: { from: () => chain } };
});

import { useAddonData } from "@/addons/useAddonData";

// Con Node 26 el `localStorage` de jsdom llega vacío (Node trae el suyo, apagado sin
// --localstorage-file): uno en memoria basta para el hook.
function memoryStorage(): Storage {
	const items = new Map<string, string>();
	return {
		get length() {
			return items.size;
		},
		clear: () => items.clear(),
		getItem: (key) => items.get(key) ?? null,
		key: (index) => [...items.keys()][index] ?? null,
		removeItem: (key) => void items.delete(key),
		setItem: (key, value) => void items.set(key, String(value)),
	};
}
Object.defineProperty(window, "localStorage", { configurable: true, value: memoryStorage() });

const LOCAL_KEY = "test:addon";
const revive = (raw: unknown) => (typeof raw === "number" ? raw : 0);

function setup() {
	return renderHook(() =>
		useAddonData({ addon: "plantilla-excel", dataKey: "b1", companyId: "c1", revive, localKey: LOCAL_KEY, delayMs: 10 }),
	);
}

describe("useAddonData", () => {
	beforeEach(() => {
		db.row = { data: 5, updated_at: "2026-10-13T05:00:00Z" };
		db.failSave = false;
		db.saves = [];
		window.localStorage.clear();
	});
	afterEach(cleanup);

	it("abre lo de la base y sube cada cambio", async () => {
		const { result } = setup();
		await waitFor(() => expect(result.current.data).toBe(5));
		expect(result.current.status).toBe("saved");

		act(() => result.current.setData((n) => n + 1));
		expect(result.current.data).toBe(6);
		await waitFor(() => expect(db.saves).toEqual([6]));
		await waitFor(() => expect(result.current.status).toBe("saved"));
		expect(JSON.parse(window.localStorage.getItem(LOCAL_KEY) ?? "null")).toMatchObject({ data: 6, dirty: false });
	});

	it("si no puede subir, queda en el navegador como pendiente", async () => {
		db.failSave = true;
		const { result } = setup();
		await waitFor(() => expect(result.current.data).toBe(5));

		act(() => result.current.setData(9));
		await waitFor(() => expect(result.current.status).toBe("offline"));
		expect(JSON.parse(window.localStorage.getItem(LOCAL_KEY) ?? "null")).toMatchObject({ data: 9, dirty: true });
	});

	it("sube lo que quedó en el navegador si es más nuevo que la base", async () => {
		window.localStorage.setItem(LOCAL_KEY, JSON.stringify({ v: 2, data: 7, dirty: true, at: "2026-10-13T05:30:00Z" }));
		const { result } = setup();
		await waitFor(() => expect(result.current.data).toBe(7));
		await waitFor(() => expect(db.saves).toEqual([7]));
	});
});
