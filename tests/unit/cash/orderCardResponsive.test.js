import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const kanbanCss = readFileSync(
	resolve("src/modules/cash/styles/AdminKanban.css"),
	"utf8",
);
const orderCardCss = readFileSync(
	resolve("src/modules/cash/styles/OrderCard.css"),
	"utf8",
);

describe("order card responsive CSS contracts", () => {
	it("uses flex kanban board at tablet breakpoint (<=1024px)", () => {
		expect(kanbanCss).toMatch(
			/@media\s*\(max-width:\s*1024px\)\s*\{[\s\S]*?\.admin-layout\s+\.kanban-board\s*\{[\s\S]*?display:\s*flex/,
		);
	});

	it("allows order card header tools to wrap at <=1024px", () => {
		expect(kanbanCss).toMatch(
			/@media\s*\(max-width:\s*1024px\)\s*\{[\s\S]*?\.order-card-header-tools\s*\{[\s\S]*?flex-wrap:\s*wrap/,
		);
	});

	it("stacks card actions on narrow phones (<=480px)", () => {
		expect(orderCardCss).toMatch(
			/@media\s*\(max-width:\s*480px\)\s*\{[\s\S]*?\.card-actions\s*\{[\s\S]*?grid-template-columns:\s*1fr\s+1fr/,
		);
	});

	it("wraps card totals on narrow cards (<=520px)", () => {
		expect(orderCardCss).toMatch(
			/@media\s*\(max-width:\s*520px\)\s*\{[\s\S]*?\.card-total-amounts\s*\{[\s\S]*?flex-wrap:\s*wrap/,
		);
	});

	it("uses bottom-sheet order detail panels at <=1024px", () => {
		expect(orderCardCss).toMatch(
			/@media\s*\(max-width:\s*1024px\)\s*\{[\s\S]*?\.order-detail-panel--receipt\s*\{[\s\S]*?border-bottom-left-radius:\s*0/,
		);
	});

	it("relaxes fixed grid tile height on mobile (<=1024px)", () => {
		expect(orderCardCss).toMatch(
			/@media\s*\(max-width:\s*1024px\)\s*\{[\s\S]*?\.kanban-card\.kanban-card--grid-tile:not\(\.kanban-card--expanded\)\s*\{[\s\S]*?height:\s*auto/,
		);
	});

	it("uses container queries for grid tile card sizing", () => {
		expect(orderCardCss).toMatch(/container-type:\s*inline-size/);
		expect(orderCardCss).toMatch(/@container\s+order-card-grid/);
	});

	it("tunes focus-desktop grid columns for narrow desktop viewports", () => {
		expect(kanbanCss).toMatch(
			/@media\s*\(min-width:\s*1025px\)\s*and\s*\(max-width:\s*1320px\)\s*\{[\s\S]*?kanban-board--focus-desktop[\s\S]*?minmax\(280px,\s*1fr\)/,
		);
	});
});
