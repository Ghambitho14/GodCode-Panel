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

	it("defines grouped toolbar row with branch selector on mobile", () => {
		expect(layoutCss).toMatch(
			/\.header-actions\s+\.header-actions-toolbar-row\s*\{[\s\S]*?display:\s*inline-flex/,
		);
		expect(layoutCss).toMatch(
			/\.header-actions--mobile-toolbar\s+\.header-actions-toolbar-row\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1/,
		);
		expect(layoutCss).toMatch(
			/\.header-actions--mobile-toolbar\s+\.header-action-branch\s*\{[\s\S]*?grid-column:\s*2[\s\S]*?grid-row:\s*2/,
		);
		expect(layoutCss).toMatch(
			/\.header-actions--mobile-toolbar\s+\.header-actions-toolbar-row\s+\.admin-notification-center__popover\s*\{[\s\S]*?left:\s*0/,
		);
	});

	it("uses 3-row orders header on mobile (toolbar, clock+branch, orders)", () => {
		expect(layoutCss).toMatch(
			/\.header-actions--mobile-toolbar\s+\.header-actions-orders-row\s*\{[\s\S]*?grid-row:\s*3/,
		);
		expect(layoutCss).toMatch(
			/\.header-actions--mobile-toolbar:has\(\.header-actions-orders-row\)\s+\.header-action-shortcuts\s*\{[\s\S]*?display:\s*none/,
		);
		expect(layoutCss).toMatch(
			/\.header-actions--mobile-toolbar\s+\.header-action-clock[\s\S]*?\{[\s\S]*?grid-row:\s*2/,
		);
	});

	it("stacks orders row below toolbar on narrow desktop (1025-1280px)", () => {
		expect(layoutCss).toMatch(
			/@media\s*\(min-width:\s*1025px\)\s*and\s*\(max-width:\s*1280px\)\s*\{[\s\S]*?\.header-actions:has\(\.header-actions-orders-row\)\s+\.header-actions-orders-row\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1[\s\S]*?grid-row:\s*2/,
		);
	});

	it("hides clock date on very narrow mobile (<=520px)", () => {
		expect(layoutCss).toMatch(
			/@media\s*\(max-width:\s*520px\)\s*\{[\s\S]*?\.admin-header-clock__date\s*\{[\s\S]*?display:\s*none/,
		);
	});

	it("uses flex kanban board at tablet breakpoint (<=1024px)", () => {
		expect(kanbanCss).toMatch(
			/@media\s*\(max-width:\s*1024px\)\s*\{[\s\S]*?\.kanban-board\s*\{[\s\S]*?display:\s*flex/,
		);
	});
});
