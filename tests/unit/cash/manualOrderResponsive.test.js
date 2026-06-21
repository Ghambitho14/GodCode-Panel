import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const manualOrderCss = readFileSync(
	resolve("src/modules/cash/styles/ManualOrderModal.css"),
	"utf8",
);
const responsiveJs = readFileSync(
	resolve("src/modules/cash/constants/responsive.js"),
	"utf8",
);

describe("manual order responsive CSS contracts", () => {
	it("exports shared admin mobile breakpoint at 1024px", () => {
		expect(responsiveJs).toMatch(/ADMIN_MOBILE_MAX\s*=\s*1024/);
		expect(responsiveJs).toMatch(/ADMIN_MOBILE_MQ/);
	});

	it("stacks checkout stage at <=1024px", () => {
		expect(manualOrderCss).toMatch(
			/@media\s*\(max-width:\s*1024px\)\s*\{[\s\S]*?\.manual-order-checkout-stage[\s\S]*?grid-template-columns:\s*1fr/,
		);
	});

	it("stacks order type toggle on narrow phones (<=480px)", () => {
		expect(manualOrderCss).toMatch(
			/@media\s*\(max-width:\s*480px\)\s*\{[\s\S]*?\.manual-order-order-type-toggle--triple\s*\{[\s\S]*?grid-template-columns:/,
		);
	});

	it("reduces payment methods columns on narrow phones", () => {
		expect(manualOrderCss).toMatch(
			/@media\s*\(max-width:\s*480px\)\s*\{[\s\S]*?\.manual-order-payment-methods\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*1fr\)/,
		);
		expect(manualOrderCss).toMatch(
			/@media\s*\(max-width:\s*360px\)\s*\{[\s\S]*?\.manual-order-payment-methods\s*\{[\s\S]*?grid-template-columns:\s*1fr/,
		);
	});

	it("removes fixed sidebar width in compact mobile mode", () => {
		expect(manualOrderCss).toMatch(
			/\.manual-order--mobile[\s\S]*?\.manual-order-sidebar\s*\{[\s\S]*?width:\s*100%/,
		);
	});
});
