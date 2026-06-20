import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("mesas view CSS smoke", () => {
	it("AdminTables.css defines tables grid", () => {
		const css = readFileSync(
			resolve(process.cwd(), "src/modules/cash/styles/AdminTables.css"),
			"utf8",
		);
		expect(css).toMatch(/\.tables-grid/);
	});

	it("AdminMenuOptions.css defines orders view switch in branch options", () => {
		const css = readFileSync(
			resolve(process.cwd(), "src/modules/cash/styles/AdminMenuOptions.css"),
			"utf8",
		);
		expect(css).toMatch(/\.orders-view-switch/);
		expect(css).toMatch(/admin-menu-options-orders-view/);
	});

	it("AdminKanban.css still defines kanban board", () => {
		const css = readFileSync(
			resolve(process.cwd(), "src/modules/cash/styles/AdminKanban.css"),
			"utf8",
		);
		expect(css).toMatch(/\.kanban-board/);
	});
});
