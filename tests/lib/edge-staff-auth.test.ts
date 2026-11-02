// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * `_shared/staff-auth.ts` y `_shared/cors.ts` corren en Deno. Aquí se simula
 * `Deno.env` y el cliente de Supabase para probar las reglas: quién entra, por
 * qué fila de `users` y qué CORS se responde.
 */

type Row = { company_id: string | null; role: string | null; is_active: boolean | null };

const state: {
	user: { id: string; email: string } | null;
	byAuth: Row | null;
	byEmail: Row[];
	emailLookups: number;
} = { user: null, byAuth: null, byEmail: [], emailLookups: 0 };

function fakeQuery(column: string) {
	if (column === "auth_user_id") {
		return { limit: () => ({ maybeSingle: async () => ({ data: state.byAuth, error: null }) }) };
	}
	state.emailLookups += 1;
	return Promise.resolve({ data: state.byEmail, error: null });
}

vi.mock("npm:@supabase/supabase-js@2.45.0", () => ({
	createClient: () => ({
		auth: {
			getUser: async () =>
				state.user ? { data: { user: state.user }, error: null } : { data: { user: null }, error: { message: "jwt" } },
		},
		from: () => ({ select: () => ({ eq: (column: string) => fakeQuery(column) }) }),
	}),
}));

const env: Record<string, string> = {
	SUPABASE_URL: "http://supabase.test",
	SUPABASE_ANON_KEY: "anon",
	SUPABASE_SERVICE_ROLE_KEY: "service",
};

beforeEach(() => {
	vi.stubGlobal("Deno", { env: { get: (name: string) => env[name] } });
	state.user = { id: "auth-1", email: "caja@local.test" };
	state.byAuth = null;
	state.byEmail = [];
	state.emailLookups = 0;
	vi.spyOn(console, "warn").mockImplementation(() => undefined);
	vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	delete env.PANEL_ALLOWED_ORIGINS;
});

const ROLES = new Set(["admin", "ceo", "cashier", "staff"]);
const base = { roles: ROLES, forbiddenMessage: "Sin permiso" };

async function resolve(options: Partial<Parameters<typeof import("../../supabase/functions/_shared/staff-auth.ts").resolveStaff>[1]> = {}) {
	const { resolveStaff } = await import("../../supabase/functions/_shared/staff-auth.ts");
	return resolveStaff("Bearer jwt", { ...base, ...options });
}

describe("resolveStaff", () => {
	it("sin Authorization es 401", async () => {
		const { resolveStaff } = await import("../../supabase/functions/_shared/staff-auth.ts");
		expect(await resolveStaff(null, base)).toEqual({ error: "No autenticado", status: 401 });
	});

	it("un JWT que Auth rechaza es 401", async () => {
		state.user = null;
		expect(await resolve()).toEqual({ error: "No autenticado", status: 401 });
	});

	it("resuelve por auth_user_id", async () => {
		state.byAuth = { company_id: "c1", role: "Cashier", is_active: true };
		const ctx = await resolve();
		expect(ctx).toMatchObject({ companyId: "c1", role: "cashier", authUserId: "auth-1" });
	});

	it("un usuario desactivado no entra", async () => {
		state.byAuth = { company_id: "c1", role: "admin", is_active: false };
		expect(await resolve()).toEqual({ error: "Sin permiso", status: 403 });
	});

	it("un rol fuera de la lista no entra", async () => {
		state.byAuth = { company_id: "c1", role: "cliente", is_active: true };
		expect(await resolve()).toEqual({ error: "Sin permiso", status: 403 });
	});

	it("sin allowEmailFallback no busca por email (datos personales)", async () => {
		state.byEmail = [{ company_id: "c1", role: "admin", is_active: true }];
		expect(await resolve()).toEqual({ error: "Sin permiso", status: 403 });
		expect(state.emailLookups).toBe(0);
	});

	it("con allowEmailFallback usa la única fila activa por email", async () => {
		state.byEmail = [
			{ company_id: "c1", role: "cashier", is_active: true },
			{ company_id: "c2", role: "cashier", is_active: false },
		];
		const ctx = await resolve({ allowEmailFallback: true });
		expect(ctx).toMatchObject({ companyId: "c1", role: "cashier" });
	});

	it("con varias empresas por email no adivina", async () => {
		state.byEmail = [
			{ company_id: "c1", role: "cashier", is_active: true },
			{ company_id: "c2", role: "admin", is_active: true },
		];
		expect(await resolve({ allowEmailFallback: true })).toEqual({ error: "Sin permiso", status: 403 });
	});

	it("extraRoleCheck deja pasar roles con permiso propio", async () => {
		state.byAuth = { company_id: "c1", role: "supervisor", is_active: true };
		const ctx = await resolve({ extraRoleCheck: async (role) => role === "supervisor" });
		expect(ctx).toMatchObject({ companyId: "c1", role: "supervisor" });
	});
});

describe("CORS de las Edge Functions", () => {
	const request = (origin?: string, method = "POST") =>
		new Request("http://fn.test/", { method, headers: origin ? { Origin: origin } : {} });

	it("devuelve el origen del panel, no *", async () => {
		const { corsHeadersFor } = await import("../../supabase/functions/_shared/cors.ts");
		const headers = corsHeadersFor(request("https://godcode-panel.me"), "POST, OPTIONS");
		expect(headers["Access-Control-Allow-Origin"]).toBe("https://godcode-panel.me");
		expect(headers.Vary).toBe("Origin");
	});

	it("a un origen desconocido no le da Allow-Origin", async () => {
		const { corsHeadersFor } = await import("../../supabase/functions/_shared/cors.ts");
		const headers = corsHeadersFor(request("https://evil.test"), "POST, OPTIONS");
		expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
	});

	it("PANEL_ALLOWED_ORIGINS reemplaza la lista", async () => {
		env.PANEL_ALLOWED_ORIGINS = "https://otro.test";
		const { corsHeadersFor } = await import("../../supabase/functions/_shared/cors.ts");
		expect(corsHeadersFor(request("https://otro.test"), "POST")["Access-Control-Allow-Origin"]).toBe("https://otro.test");
		expect(corsHeadersFor(request("https://godcode-panel.me"), "POST")["Access-Control-Allow-Origin"]).toBeUndefined();
	});

	it("withCors responde el preflight y agrega CORS a la respuesta", async () => {
		const { withCors } = await import("../../supabase/functions/_shared/cors.ts");
		const handler = withCors("POST, OPTIONS", async () => new Response("{}", { status: 201 }));
		const preflight = await handler(request("https://godcode-panel.me", "OPTIONS"));
		expect(preflight.status).toBe(204);
		const res = await handler(request("https://godcode-panel.me"));
		expect(res.status).toBe(201);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://godcode-panel.me");
	});
});
