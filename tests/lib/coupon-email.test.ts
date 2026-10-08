// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
	type CompanyForEmail,
	type CompanySenderRow,
	couponCodePrefix,
	effectiveCustomDomain,
	generateCouponCode,
	parseCouponDraft,
	renderCouponEmail,
	resolveMenuUrl,
	resolveSender,
} from "../../supabase/functions/_shared/coupon-email.ts";

const NOW = new Date("2026-10-04T12:00:00Z");

const company = (patch: Partial<CompanyForEmail> = {}): CompanyForEmail => ({
	id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
	name: "Oishi Sushi",
	email: "hola@oishisushi.shop",
	public_slug: "oishi-sushi",
	custom_domain: null,
	subscription_status: "active",
	subscription_ends_at: null,
	currency: "CLP",
	theme_config: { displayName: "", primaryColor: "#d83600" },
	...patch,
});

const verifiedSender: CompanySenderRow = {
	api_key_sealed: "sk:v1:xxx",
	api_key_last4: "abcd",
	from_email: "cupones@oishisushi.shop",
	from_name: "Oishi Sushi",
	reply_to: "local@oishisushi.shop",
	verified_at: "2026-10-01T00:00:00Z",
	last_error: null,
};

describe("resolveSender", () => {
	it("sin dominio propio sale por GodCode con el nombre de la empresa y responde a la empresa", () => {
		const sender = resolveSender(company(), null, "cupones@godcode.me", NOW);
		expect(sender).toEqual({
			mode: "godcode",
			from: '"Oishi Sushi" <cupones@godcode.me>',
			replyTo: "hola@oishisushi.shop",
			sealedApiKey: null,
		});
	});

	it("con dominio propio y Resend verificado sale por el Resend de la empresa", () => {
		const sender = resolveSender(company({ custom_domain: "oishisushi.shop" }), verifiedSender, "cupones@godcode.me", NOW);
		expect(sender.mode).toBe("own");
		expect(sender.from).toBe('"Oishi Sushi" <cupones@oishisushi.shop>');
		expect(sender.replyTo).toBe("local@oishisushi.shop");
		expect(sender.sealedApiKey).toBe("sk:v1:xxx");
	});

	it("con dominio propio pero sin Resend configurado o sin verificar, vuelve a GodCode", () => {
		const withDomain = company({ custom_domain: "oishisushi.shop" });
		expect(resolveSender(withDomain, null, "cupones@godcode.me", NOW).mode).toBe("godcode");
		expect(resolveSender(withDomain, { ...verifiedSender, verified_at: null }, "cupones@godcode.me", NOW).mode).toBe(
			"godcode",
		);
	});

	it("un dominio propio de una suscripción vencida o suspendida no cuenta", () => {
		const vencida = company({ custom_domain: "oishisushi.shop", subscription_ends_at: "2026-10-01T00:00:00Z" });
		const suspendida = company({ custom_domain: "oishisushi.shop", subscription_status: "suspended" });
		const cancelada = company({
			custom_domain: "oishisushi.shop",
			subscription_status: "cancelled",
			subscription_ends_at: "2026-11-01T00:00:00Z",
		});
		expect(resolveSender(vencida, verifiedSender, "cupones@godcode.me", NOW).mode).toBe("godcode");
		expect(resolveSender(suspendida, verifiedSender, "cupones@godcode.me", NOW).mode).toBe("godcode");
		// Cancelada pero aún dentro del período pagado: sigue viva.
		expect(effectiveCustomDomain(cancelada, NOW)).toBe("oishisushi.shop");
	});

	it("limpia comillas y saltos del nombre para que no rompan el encabezado", () => {
		const sender = resolveSender(
			company({ theme_config: { displayName: 'Oishi "Sushi"\r\nBcc: x@y.z' } }),
			null,
			"cupones@godcode.me",
			NOW,
		);
		expect(sender.from).toBe('"Oishi Sushi Bcc: x@y.z" <cupones@godcode.me>');
	});
});

describe("resolveMenuUrl", () => {
	it("usa el dominio propio vigente o el subdominio de GodCode", () => {
		expect(resolveMenuUrl(company({ custom_domain: "oishisushi.shop" }), "https://www.godcode.me", NOW)).toBe(
			"https://oishisushi.shop",
		);
		expect(resolveMenuUrl(company(), "https://www.godcode.me/", NOW)).toBe("https://www.godcode.me/oishi-sushi");
		expect(resolveMenuUrl(company({ public_slug: null }), "https://www.godcode.me", NOW)).toBeNull();
	});
});

describe("generateCouponCode", () => {
	it("prefijo del negocio y 6 caracteres sin letras que se confunden", () => {
		const code = generateCouponCode(company(), (n) => new Uint8Array(n).map((_, i) => i * 37));
		expect(code).toMatch(/^OISHI-[A-HJKMNP-Z2-9]{6}$/);
		expect(couponCodePrefix({ public_slug: "ñandú-café", name: null })).toBe("NANDU");
		expect(couponCodePrefix({ public_slug: "", name: "123" })).toBe("CUPON");
	});
});

describe("parseCouponDraft", () => {
	const base = { discountType: "percent", discountValue: 15, minOrderSubtotal: 10000, validUntil: "2026-10-20T03:00:00Z" };

	it("acepta un cupón válido", () => {
		expect(parseCouponDraft(base, NOW)).toEqual({
			discountType: "percent",
			discountValue: 15,
			minOrderSubtotal: 10000,
			validUntil: "2026-10-20T03:00:00.000Z",
			message: "",
		});
	});

	it("rechaza valores que el cupón no puede tener", () => {
		expect(parseCouponDraft({ ...base, discountValue: 0 }, NOW)).toHaveProperty("error");
		expect(parseCouponDraft({ ...base, discountValue: 120 }, NOW)).toHaveProperty("error");
		expect(parseCouponDraft({ ...base, discountType: "gratis" }, NOW)).toHaveProperty("error");
		expect(parseCouponDraft({ ...base, validUntil: "2026-10-01T00:00:00Z" }, NOW)).toHaveProperty("error");
		expect(parseCouponDraft({ ...base, message: "x".repeat(501) }, NOW)).toHaveProperty("error");
	});
});

describe("renderCouponEmail", () => {
	const draft = {
		discountType: "fixed_amount" as const,
		discountValue: 3000,
		minOrderSubtotal: 15000,
		validUntil: "2026-10-20T03:00:00.000Z",
		message: "¡Gracias por volver! <b>no es html</b>",
	};
	const rendered = renderCouponEmail({
		companyName: "Oishi Sushi",
		primaryColor: "#d83600",
		currency: "CLP",
		code: "OISHI-7KQ2MX",
		draft,
		menuUrl: "https://www.godcode.me/oishi-sushi",
		unsubscribeUrl: "https://www.godcode.me/api/email/unsubscribe?a=1&c=2&s=3",
	});

	it("asunto con la empresa y el descuento", () => {
		expect(rendered.subject).toBe("Oishi Sushi: tienes un cupón de $3.000 de descuento");
	});

	it("trae el código, las condiciones, el botón al menú y la baja", () => {
		for (const part of [rendered.html, rendered.text]) {
			expect(part).toContain("OISHI-7KQ2MX");
			expect(part).toContain("$15.000");
			expect(part).toContain("20 de octubre de 2026");
			expect(part).toContain("https://www.godcode.me/oishi-sushi");
		}
		expect(rendered.html).toContain('href="https://www.godcode.me/api/email/unsubscribe?a=1&amp;c=2&amp;s=3"');
		expect(rendered.text).toContain("No quiero recibir más cupones: https://www.godcode.me/api/email/unsubscribe?a=1&c=2&s=3");
	});

	it("escapa el mensaje del negocio", () => {
		expect(rendered.html).toContain("&lt;b&gt;no es html&lt;/b&gt;");
		expect(rendered.html).not.toContain("<b>no es html</b>");
	});

	it("una URL que no es http no termina en un href", () => {
		const bad = renderCouponEmail({
			companyName: "X",
			primaryColor: "red",
			currency: "CLP",
			code: "X-AAAAAA",
			draft: { ...draft, message: "" },
			menuUrl: "javascript:alert(1)",
			unsubscribeUrl: "javascript:alert(1)",
		});
		expect(bad.html).not.toContain("javascript:");
		expect(bad.html).not.toContain("Ir al menú");
	});
});
