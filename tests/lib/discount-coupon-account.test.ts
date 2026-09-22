import { beforeEach, describe, expect, it, vi } from "vitest";

const accountsHolder: { current: Array<{ id: string; clientId: string | null; isActive: boolean }> } = {
	current: [],
};

vi.mock("@/modules/cash/services/menuAccountsService", () => ({
	fetchMenuClientAccountsCached: vi.fn(async () => ({ ok: true, accounts: accountsHolder.current, error: null })),
}));

import { buildCouponPreview } from "@/lib/discount-coupon";

const cuponDeCuenta = {
	id: "cupon-1",
	company_id: "company-a",
	code: "ANA10",
	discount_type: "percent",
	discount_value: 10,
	scope: "client_only",
	restricted_account_id: "cuenta-ana",
	restricted_client_id: null,
	min_order_subtotal: 0,
	max_redemptions: null,
	redemptions_count: 0,
	max_redemptions_per_client: 1,
	valid_from: null,
	valid_until: null,
	is_active: true,
};

/** PostgREST falso: cada `from(tabla)` resuelve lo que diga `results[tabla]`. */
function fakeSupabase(results: Record<string, unknown>) {
	const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
	const from = (table: string) => {
		const chain: Record<string, unknown> = {};
		for (const method of ["select", "eq", "neq", "maybeSingle"]) {
			chain[method] = (...args: unknown[]) => {
				calls.push({ table, method, args });
				return chain;
			};
		}
		chain.then = (resolve: (value: unknown) => unknown) => resolve(results[table]);
		return chain;
	};
	return { client: { from } as never, calls };
}

function preview(supabase: never, opts: { clientId?: string | null; clientPhone?: string } = {}) {
	return buildCouponPreview({
		supabase,
		companyId: "company-a",
		rawCode: "ana10",
		itemsSubtotal: 100,
		clientPhone: opts.clientPhone ?? "",
		clientId: opts.clientId,
	});
}

/**
 * La caja valida el cupón de una cuenta igual que la base: por la ficha que respalda
 * la cuenta. El teléfono escrito en el formulario no lo abre.
 */
describe("vista previa en caja de un cupón atado a una cuenta", () => {
	beforeEach(() => {
		accountsHolder.current = [{ id: "cuenta-ana", clientId: "ficha-ana", isActive: true }];
	});

	it("no se abre con solo un teléfono", async () => {
		const { client } = fakeSupabase({ discount_coupons: { data: [cuponDeCuenta], error: null } });
		await expect(preview(client, { clientPhone: "+56912345678" })).resolves.toEqual({
			ok: false,
			key: "coupon_wrong_account",
		});
	});

	it("rechaza la ficha de otro cliente", async () => {
		const { client } = fakeSupabase({ discount_coupons: { data: [cuponDeCuenta], error: null } });
		await expect(preview(client, { clientId: "ficha-otra" })).resolves.toMatchObject({
			ok: false,
			key: "coupon_wrong_account",
		});
	});

	it("rechaza si la cuenta dueña está desactivada", async () => {
		accountsHolder.current = [{ id: "cuenta-ana", clientId: "ficha-ana", isActive: false }];
		const { client } = fakeSupabase({ discount_coupons: { data: [cuponDeCuenta], error: null } });
		await expect(preview(client, { clientId: "ficha-ana" })).resolves.toMatchObject({ ok: false });
	});

	it("acepta la ficha de la cuenta dueña y cuenta sus usos por pedidos", async () => {
		const { client, calls } = fakeSupabase({
			discount_coupons: { data: [cuponDeCuenta], error: null },
			orders: { count: 0, error: null },
		});
		await expect(preview(client, { clientId: "ficha-ana" })).resolves.toMatchObject({ ok: true, discount: 10 });
		expect(calls).toContainEqual({ table: "orders", method: "eq", args: ["client_id", "ficha-ana"] });
		expect(calls).toContainEqual({ table: "orders", method: "neq", args: ["status", "cancelled"] });
		expect(calls.some((c) => c.table === "clients")).toBe(false);
	});

	it("respeta el límite de usos de la cuenta", async () => {
		const { client } = fakeSupabase({
			discount_coupons: { data: [cuponDeCuenta], error: null },
			orders: { count: 1, error: null },
		});
		await expect(preview(client, { clientId: "ficha-ana" })).resolves.toEqual({
			ok: false,
			key: "coupon_usage_exhausted_account",
		});
	});
});
