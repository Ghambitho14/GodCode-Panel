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

describe("resolveStorefrontMenuUrl — saneo de URLs", () => {
	const payloads = [
		"javascript:alert(1)",
		"JaVaScRiPt:alert(1)",
		"  javascript:alert(1)  ",
		"data:text/html,<script>alert(1)</script>",
		"vbscript:msgbox(1)",
	];

	it.each(payloads)("descarta %j como URL explícita", (payload) => {
		expect(resolveStorefrontMenuUrl({ explicitUrl: payload })).toBeNull();
	});

	it.each(payloads)("descarta %j dentro de integration_settings.menu", (payload) => {
		expect(resolveStorefrontMenuUrl({
			integrationSettings: { menu: { publicUrl: payload } },
		})).toBeNull();
	});

	it.each(payloads)("descarta %j como dominio personalizado", (payload) => {
		expect(resolveStorefrontMenuUrl({ customDomain: payload })).toBeNull();
	});

	it("no cae al slug tras descartar un payload: devuelve null, no una URL a medias", () => {
		// El guard del consumidor es `{url ? … : null}`, así que null hace
		// desaparecer el enlace en vez de renderizar algo peligroso.
		expect(resolveStorefrontMenuUrl({ explicitUrl: "javascript:alert(1)" })).toBeNull();
	});

	it("descarta un esquema que solo empieza como http", () => {
		expect(resolveStorefrontMenuUrl({ customDomain: "httpx://evil.test" })).toBeNull();
	});

	it("una ruta relativa sigue resolviéndose contra el storefront", () => {
		expect(resolveStorefrontMenuUrl({ explicitUrl: "/mi-local" }))
			.toBe("https://www.godcode.me/mi-local");
	});

	it("`//evil.com` no escapa del origen del storefront", () => {
		expect(resolveStorefrontMenuUrl({ explicitUrl: "//evil.com" }))
			.toBe("https://www.godcode.me//evil.com");
	});

	it("un dominio con puerto no se confunde con un esquema", () => {
		expect(resolveStorefrontMenuUrl({ customDomain: "mitienda.com:8080" }))
			.toBe("https://mitienda.com:8080");
	});

	it("control positivo: una URL legítima sí pasa", () => {
		expect(resolveStorefrontMenuUrl({ explicitUrl: "https://demo.godcode.me/menu" }))
			.toBe("https://demo.godcode.me/menu");
	});
});
