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

	it("AdminTables.css portals table session modal above admin chrome", () => {
		const css = readFileSync(
			resolve(process.cwd(), "src/modules/cash/styles/AdminTables.css"),
			"utf8",
		);
		expect(css).toMatch(/\.table-session-modal-portal/);
		expect(css).toMatch(/z-index:\s*10050/);
		expect(css).toMatch(/background:\s*rgba\(15,\s*23,\s*42,\s*0\.58\)/);
	});

	it("AdminTables.css styles close-table checkout modal", () => {
		const css = readFileSync(
			resolve(process.cwd(), "src/modules/cash/styles/AdminTables.css"),
			"utf8",
		);
		expect(css).toMatch(/\.close-table-modal__body/);
		expect(css).toMatch(/\.close-table-modal__actions/);
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
