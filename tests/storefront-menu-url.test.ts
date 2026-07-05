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

	it("arma URL con path desde public_slug", () => {
		expect(resolveStorefrontMenuUrl({
			publicSlug: "mi-local",
		})).toBe("https://www.godcode.me/mi-local");
	});

	it("normaliza slugs con espacios a kebab-case", () => {
		expect(resolveStorefrontMenuUrl({
			publicSlug: "la parada",
		})).toBe("https://www.godcode.me/la-parada");
	});

	it("usa dominio personalizado desde prop customDomain", () => {
		expect(resolveStorefrontMenuUrl({
			publicSlug: "mi-local",
			customDomain: "cichisushi.shop",
		})).toBe("https://cichisushi.shop");
	});

	it("usa dominio personalizado desde integration_settings", () => {
		expect(resolveStorefrontMenuUrl({
			publicSlug: "mi-local",
			integrationSettings: {
				customDomain: "mitienda.com",
			},
		})).toBe("https://mitienda.com");
	});

	it("soporta custom_domain con protocolo", () => {
		expect(resolveStorefrontMenuUrl({
			integrationSettings: {
				custom_domain: "https://menu.mitienda.cl",
			},
		})).toBe("https://menu.mitienda.cl");
	});
});
