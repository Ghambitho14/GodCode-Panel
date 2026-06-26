import { describe, expect, it, vi } from "vitest";
import { fetchAllPaginated } from "@/shared/utils/fetchAllPaginated";

function makeQuery(pages) {
	let call = 0;
	return {
		range: vi.fn((from, to) => {
			const page = pages[call] ?? [];
			call += 1;
			return Promise.resolve({ data: page, error: null });
		}),
	};
}

describe("fetchAllPaginated", () => {
	it("fetches a single page when rows fit", async () => {
		const query = makeQuery([[{ id: 1 }, { id: 2 }]]);
		const rows = await fetchAllPaginated(query, { pageSize: 500 });
		expect(rows).toEqual([{ id: 1 }, { id: 2 }]);
		expect(query.range).toHaveBeenCalledTimes(1);
		expect(query.range).toHaveBeenCalledWith(0, 499);
	});

	it("paginates until a short page", async () => {
		const pageSize = 2;
		const query = makeQuery([
			[{ id: 1 }, { id: 2 }],
			[{ id: 3 }],
		]);
		const rows = await fetchAllPaginated(query, { pageSize });
		expect(rows).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
		expect(query.range).toHaveBeenCalledTimes(2);
		expect(query.range).toHaveBeenNthCalledWith(1, 0, 1);
		expect(query.range).toHaveBeenNthCalledWith(2, 2, 3);
	});

	it("returns empty array when first page is empty", async () => {
		const query = makeQuery([[]]);
		const rows = await fetchAllPaginated(query);
		expect(rows).toEqual([]);
		expect(query.range).toHaveBeenCalledTimes(1);
	});
});
