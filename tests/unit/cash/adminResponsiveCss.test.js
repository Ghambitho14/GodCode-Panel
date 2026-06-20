import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const layoutCss = readFileSync(
	resolve("src/modules/cash/styles/AdminLayout.css"),
	"utf8",
);
const kanbanCss = readFileSync(
	resolve("src/modules/cash/styles/AdminKanban.css"),
	"utf8",
);

describe("admin responsive CSS contracts", () => {
	it("shows kanban mobile tabs at tablet breakpoint (<=1024px)", () => {
		expect(kanbanCss).toMatch(
			/@media\s*\(max-width:\s*1024px\)\s*\{[\s\S]*?\.admin-layout\s+\.mobile-tabs\s*\{[\s\S]*?display:\s*grid/,
		);
	});

	it("defines mobile orders header grid in AdminLayout", () => {
		expect(layoutCss).toMatch(
			/\.header-actions--mobile-toolbar\s+\.header-actions-orders-row\s*\{[\s\S]*?display:\s*grid/,
		);
		expect(layoutCss).toMatch(
			/\.header-action-orders-manual\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1/,
		);
	});

	it("anchors pause confirm dialog to the left on mobile toolbar", () => {
		expect(layoutCss).toMatch(
			/\.header-actions-orders-row\s+\.order-intake-pause__confirm\s*\{[\s\S]*?left:\s*0/,
		);
	});

	it("uses shell pivot at 1024px for mobile toolbar grid", () => {
		expect(layoutCss).toMatch(
			/@media\s*\(max-width:\s*1024px\)\s*\{[\s\S]*?\.header-actions\.header-actions--mobile-toolbar\s*\{[\s\S]*?display:\s*grid/,
		);
	});
});
