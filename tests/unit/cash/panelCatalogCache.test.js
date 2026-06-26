import { afterEach, describe, expect, it, vi } from "vitest";
import {
	BRANCH_OVERLAY_MAX_AGE_MS,
	COMPANY_CATALOG_MAX_AGE_MS,
	getBranchOverlay,
	getCompanyCatalog,
	invalidateAll,
	invalidateBranchOverlay,
	invalidateCompanyCatalog,
	resetPanelCatalogCacheForTests,
} from "@/modules/cash/services/panelCatalogCache";

describe("panelCatalogCache", () => {
	afterEach(() => {
		resetPanelCatalogCacheForTests();
		vi.useRealTimers();
	});

	it("returns cached company catalog within TTL", async () => {
		const fetcher = vi.fn().mockResolvedValue({ categories: [1], products: [2] });

		const first = await getCompanyCatalog("co-1", fetcher);
		const second = await getCompanyCatalog("co-1", fetcher);

		expect(first).toEqual({ categories: [1], products: [2] });
		expect(second).toEqual(first);
		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	it("refetches company catalog after TTL expires", async () => {
		vi.useFakeTimers();
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce({ categories: [1], products: [2] })
			.mockResolvedValueOnce({ categories: [3], products: [4] });

		await getCompanyCatalog("co-1", fetcher);
		vi.advanceTimersByTime(COMPANY_CATALOG_MAX_AGE_MS + 1);
		const next = await getCompanyCatalog("co-1", fetcher);

		expect(next).toEqual({ categories: [3], products: [4] });
		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it("deduplicates concurrent company fetches (single-flight)", async () => {
		let resolveFetch;
		const fetcher = vi.fn(
			() =>
				new Promise((resolve) => {
					resolveFetch = resolve;
				}),
		);

		const p1 = getCompanyCatalog("co-1", fetcher);
		const p2 = getCompanyCatalog("co-1", fetcher);
		expect(fetcher).toHaveBeenCalledTimes(1);

		resolveFetch({ categories: [], products: [] });
		const [a, b] = await Promise.all([p1, p2]);
		expect(a).toBe(b);
	});

	it("invalidates company catalog on demand", async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce({ categories: [1], products: [] })
			.mockResolvedValueOnce({ categories: [2], products: [] });

		await getCompanyCatalog("co-1", fetcher);
		invalidateCompanyCatalog("co-1");
		const next = await getCompanyCatalog("co-1", fetcher);

		expect(next).toEqual({ categories: [2], products: [] });
		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it("caches branch overlay separately with branch TTL", async () => {
		vi.useFakeTimers();
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce({ prices: [1] })
			.mockResolvedValueOnce({ prices: [2] });

		await getBranchOverlay("br-1", fetcher);
		vi.advanceTimersByTime(BRANCH_OVERLAY_MAX_AGE_MS + 1);
		const next = await getBranchOverlay("br-1", fetcher);

		expect(next).toEqual({ prices: [2] });
		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it("invalidateBranchOverlay clears only that branch", async () => {
		const companyFetcher = vi.fn().mockResolvedValue({ categories: [], products: [] });
		const branchFetcher = vi
			.fn()
			.mockResolvedValueOnce({ prices: [1] })
			.mockResolvedValueOnce({ prices: [2] });

		await getCompanyCatalog("co-1", companyFetcher);
		await getBranchOverlay("br-1", branchFetcher);
		invalidateBranchOverlay("br-1");
		await getBranchOverlay("br-1", branchFetcher);
		const companyAgain = await getCompanyCatalog("co-1", companyFetcher);

		expect(companyAgain).toEqual({ categories: [], products: [] });
		expect(companyFetcher).toHaveBeenCalledTimes(1);
		expect(branchFetcher).toHaveBeenCalledTimes(2);
	});

	it("invalidateAll clears every entry", async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce({ categories: [1], products: [] })
			.mockResolvedValueOnce({ categories: [2], products: [] });

		await getCompanyCatalog("co-1", fetcher);
		invalidateAll();
		await getCompanyCatalog("co-1", fetcher);

		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it("force option bypasses cache", async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce({ categories: [1], products: [] })
			.mockResolvedValueOnce({ categories: [2], products: [] });

		await getCompanyCatalog("co-1", fetcher);
		await getCompanyCatalog("co-1", fetcher, { force: true });

		expect(fetcher).toHaveBeenCalledTimes(2);
	});
});
