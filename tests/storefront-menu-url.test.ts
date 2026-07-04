import { describe, expect, it } from "vitest";
import { resolveStorefrontMenuUrl } from "@/shared/utils/storefront-menu-url";

describe("resolveStorefrontMenuUrl", () => {
	it("prioriza URL explícita", () => {
		expect(resolveStorefrontMenuUrl({
			explicitUrl: "https://demo.godcode.me/menu",
			publicSlug: "otro",
		})).toBe("https://demo.godcode.me/menu");
	});

	it("lee URL desde integration_settings.menu", () => {
		expect(resolveStorefrontMenuUrl({
			integrationSettings: {
				menu: { publicUrl: "https://tienda.ejemplo.cl" },
			},
		})).toBe("https://tienda.ejemplo.cl/");
	});

	it("arma subdominio godcode desde public_slug", () => {
		expect(resolveStorefrontMenuUrl({
			publicSlug: "mi-local",
		})).toBe("https://mi-local.godcode.me");
	});
});
