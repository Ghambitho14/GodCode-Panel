import { describe, expect, it } from "vitest";
import {
	CATEGORIES_PANEL_SELECT,
	CLIENTS_PANEL_SELECT,
	PRODUCT_BRANCH_SELECT,
	PRODUCT_PRICES_BRANCH_SELECT,
	PRODUCTS_PANEL_SELECT,
} from "@/modules/cash/services/panelCatalogSelects";

describe("panelCatalogSelects", () => {
	const allSelects = [
		CATEGORIES_PANEL_SELECT,
		PRODUCTS_PANEL_SELECT,
		PRODUCT_PRICES_BRANCH_SELECT,
		PRODUCT_BRANCH_SELECT,
		CLIENTS_PANEL_SELECT,
	];

	it("no select constant uses wildcard star", () => {
		for (const sel of allSelects) {
			expect(sel).not.toMatch(/\*/);
		}
	});
});
