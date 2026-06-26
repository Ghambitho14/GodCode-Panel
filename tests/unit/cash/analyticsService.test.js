import { beforeEach, describe, expect, it, vi } from "vitest";

const callGuardedRpcMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/modules/cash/admin/utils/rpcGuard", () => ({
	callGuardedRpc: (...args) => callGuardedRpcMock(...args),
}));

vi.mock("@/integrations/supabase", () => ({
	supabase: {
		from: (...args) => fromMock(...args),
	},
	TABLES: {
		orders: "orders",
	},
}));

import { fetchTopProducts, fetchOrderWithItems } from "@/modules/cash/services/analyticsService";

describe("analyticsService", () => {
	beforeEach(() => {
		callGuardedRpcMock.mockReset();
		fromMock.mockReset();
	});

	it("fetchTopProducts maps RPC rows", async () => {
		callGuardedRpcMock.mockResolvedValue({
			data: [
				{ name: "Pizza", qty: 10, revenue: 120 },
				{ name: "Empanada", qty: 5, revenue: 25 },
			],
			error: null,
			notGranted: false,
		});

		const rows = await fetchTopProducts({
			companyId: "co-1",
			branchId: "br-1",
			startIso: "2026-01-01T00:00:00.000Z",
			endIso: "2026-02-01T00:00:00.000Z",
			limit: 5,
		});

		expect(callGuardedRpcMock).toHaveBeenCalledWith(
			"admin_analytics_top_products",
			{
				p_company_id: "co-1",
				p_branch_id: "br-1",
				p_start: "2026-01-01T00:00:00.000Z",
				p_end: "2026-02-01T00:00:00.000Z",
				p_limit: 5,
			},
			expect.objectContaining({ label: "Top productos" }),
		);
		expect(rows).toEqual([
			{ name: "Pizza", qty: 10, revenue: 120 },
			{ name: "Empanada", qty: 5, revenue: 25 },
		]);
	});

	it("fetchTopProducts returns empty on notGranted", async () => {
		callGuardedRpcMock.mockResolvedValue({
			data: null,
			error: null,
			notGranted: true,
		});

		const rows = await fetchTopProducts({ companyId: "co-1" });
		expect(rows).toEqual([]);
	});

	it("fetchOrderWithItems returns sanitized order", async () => {
		const chain = {
			select: vi.fn(() => chain),
			eq: vi.fn(() => chain),
			maybeSingle: vi.fn(() =>
				Promise.resolve({
					data: {
						id: "ord-1",
						company_id: "co-1",
						items: [{ name: "Pizza", quantity: 1, price: 10 }],
						total: 10,
					},
					error: null,
				}),
			),
		};
		fromMock.mockReturnValue(chain);

		const order = await fetchOrderWithItems({ orderId: "ord-1", companyId: "co-1" });
		expect(order?.id).toBe("ord-1");
		expect(Array.isArray(order?.items)).toBe(true);
		expect(order?.items).toHaveLength(1);
	});
});
