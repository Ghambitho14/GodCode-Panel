/**
 * Lógica pura de los correos de cupones (Edge Function `coupon-emails`).
 *
 * Sin imports de Deno ni de Node: se prueba en vitest (`tests/lib/coupon-email.test.ts`).
 * - `resolveSender`: con qué Resend y qué remitente sale el correo.
 * - `generateCouponCode`: el código personal de cada destinatario.
 * - `renderCouponEmail`: asunto, HTML y texto. El HTML usa tablas y estilos en línea,
 *   como `GodCode/lib/email/render.ts`, porque es lo único que respetan Gmail y Outlook.
 */

// ---------------------------------------------------------------------------
// Empresa y remitente
// ---------------------------------------------------------------------------

export type CompanyForEmail = {
	id: string;
	name: string | null;
	email: string | null;
	public_slug: string | null;
	custom_domain: string | null;
	subscription_status: string | null;
	subscription_ends_at: string | null;
	currency: string | null;
	theme_config: unknown;
};

export type CompanySenderRow = {
	api_key_sealed: string;
	api_key_last4: string | null;
	from_email: string;
	from_name: string | null;
	reply_to: string | null;
	verified_at: string | null;
	last_error: string | null;
};

export type ResolvedSender = {
	/** `own`: el Resend de la empresa. `godcode`: el de GodCode con el nombre de la empresa. */
	mode: "own" | "godcode";
	/** Lo que verá el cliente en «De:». */
	from: string;
	replyTo: string | null;
	/** Solo en `own`: la key sellada que hay que abrir para enviar. */
	sealedApiKey: string | null;
};

/**
 * Misma regla que el menú público (`GodCode/lib/plans/tenant-subscription.ts`): no
 * suspendida, no vencida, y una cancelación programada sigue viva hasta el vencimiento.
 */
export function isSubscriptionAccessible(
	company: Pick<CompanyForEmail, "subscription_status" | "subscription_ends_at">,
	now = new Date(),
): boolean {
	const status = String(company.subscription_status ?? "").trim().toLowerCase();
	if (status === "suspended") return false;
	const endsAt = company.subscription_ends_at ? new Date(company.subscription_ends_at).getTime() : null;
	if (endsAt != null && Number.isFinite(endsAt) && endsAt <= now.getTime()) return false;
	if (status === "cancelled") return endsAt != null && Number.isFinite(endsAt) && endsAt > now.getTime();
	return true;
}

/** El dominio propio solo cuenta mientras la suscripción está viva (`tenant-effective-custom-domain.ts`). */
export function effectiveCustomDomain(company: CompanyForEmail, now = new Date()): string | null {
	const domain = String(company.custom_domain ?? "").trim().toLowerCase();
	if (!domain || !isSubscriptionAccessible(company, now)) return null;
	return domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function themeRecord(company: CompanyForEmail): Record<string, unknown> {
	const theme = company.theme_config;
	return theme && typeof theme === "object" && !Array.isArray(theme) ? (theme as Record<string, unknown>) : {};
}

/** Nombre que firma el correo: el nombre visible de la marca o, si no hay, el de la empresa. */
export function companyDisplayName(company: CompanyForEmail): string {
	const display = String(themeRecord(company).displayName ?? "").trim();
	return cleanDisplayName(display || String(company.name ?? "").trim() || "Tu tienda");
}

export function companyPrimaryColor(company: CompanyForEmail): string {
	const color = String(themeRecord(company).primaryColor ?? "").trim();
	return /^#[0-9a-f]{6}$/i.test(color) ? color : "#4F5BFF";
}

/** URL del menú: el dominio propio vigente o el subdominio de GodCode (`godcode.me/slug`). */
export function resolveMenuUrl(company: CompanyForEmail, storefrontOrigin: string, now = new Date()): string | null {
	const domain = effectiveCustomDomain(company, now);
	if (domain) return `https://${domain}`;
	const slug = String(company.public_slug ?? "").trim().toLowerCase();
	if (!slug) return null;
	const origin = storefrontOrigin.replace(/\/+$/, "");
	const encoded = encodeURIComponent(slug.replace(/\s+/g, "-"));
	return origin.includes("{slug}") ? origin.replace("{slug}", encoded) : `${origin}/${encoded}`;
}

export function isValidEmail(value: unknown): value is string {
	return typeof value === "string" && /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/.test(value.trim());
}

/** El nombre del remitente va entre comillas en el encabezado: sin comillas, saltos ni `<>`. */
export function cleanDisplayName(value: string): string {
	return value.replace(/["<>\\\r\n\t]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

export function formatFrom(name: string, email: string): string {
	const clean = cleanDisplayName(name);
	return clean ? `"${clean}" <${email}>` : email;
}

/**
 * Con qué sale el correo:
 * - **Resend propio** si la empresa tiene dominio propio vigente y un remitente
 *   verificado (`company_email_senders`).
 * - Si no, **el Resend de GodCode** con el nombre de la empresa, y las respuestas a
 *   su correo. Un dominio propio sin Resend configurado también cae aquí.
 */
export function resolveSender(
	company: CompanyForEmail,
	sender: CompanySenderRow | null,
	godcodeFromAddress: string,
	now = new Date(),
): ResolvedSender {
	const ownReady = Boolean(effectiveCustomDomain(company, now) && sender?.verified_at && sender.api_key_sealed);
	if (ownReady && sender) {
		const replyTo = isValidEmail(sender.reply_to) ? sender.reply_to.trim() : null;
		return {
			mode: "own",
			from: formatFrom(sender.from_name || companyDisplayName(company), sender.from_email),
			replyTo,
			sealedApiKey: sender.api_key_sealed,
		};
	}
	return {
		mode: "godcode",
		from: formatFrom(companyDisplayName(company), godcodeFromAddress),
		replyTo: isValidEmail(company.email) ? company.email.trim() : null,
		sealedApiKey: null,
	};
}

// ---------------------------------------------------------------------------
// Cupón
// ---------------------------------------------------------------------------

/** Sin 0/O ni 1/I/L: el cliente lo va a escribir a mano. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

export function couponCodePrefix(company: Pick<CompanyForEmail, "public_slug" | "name">): string {
	const source = String(company.public_slug || company.name || "")
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toUpperCase()
		.replace(/[^A-Z]/g, "");
	return source.slice(0, 5) || "CUPON";
}

/** `OISHI-7KQ2MX`. `random` se inyecta en los tests. */
export function generateCouponCode(
	company: Pick<CompanyForEmail, "public_slug" | "name">,
	random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n)),
): string {
	const bytes = random(CODE_LENGTH);
	let suffix = "";
	for (let i = 0; i < CODE_LENGTH; i++) suffix += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
	return `${couponCodePrefix(company)}-${suffix}`;
}

export type CouponDraft = {
	discountType: "percent" | "fixed_amount";
	discountValue: number;
	minOrderSubtotal: number;
	validUntil: string;
	message: string;
};

export const MAX_ACCOUNTS_PER_CALL = 50;
export const MAX_MESSAGE_LENGTH = 500;

/** Valida lo que llega del panel. Devuelve el borrador limpio o el error para mostrar. */
export function parseCouponDraft(body: Record<string, unknown>, now = new Date()): CouponDraft | { error: string } {
	const discountType = body.discountType === "fixed_amount" ? "fixed_amount" : body.discountType === "percent" ? "percent" : null;
	if (!discountType) return { error: "Tipo de descuento inválido" };
	const discountValue = Number(body.discountValue);
	if (!Number.isFinite(discountValue) || discountValue <= 0) return { error: "El descuento tiene que ser mayor que 0" };
	if (discountType === "percent" && discountValue > 100) return { error: "El porcentaje no puede superar 100" };
	const minRaw = body.minOrderSubtotal == null || body.minOrderSubtotal === "" ? 0 : Number(body.minOrderSubtotal);
	if (!Number.isFinite(minRaw) || minRaw < 0) return { error: "El mínimo del pedido no es válido" };
	const validUntil = new Date(String(body.validUntil ?? ""));
	if (Number.isNaN(validUntil.getTime())) return { error: "Falta la fecha de vencimiento" };
	if (validUntil.getTime() <= now.getTime()) return { error: "La fecha de vencimiento ya pasó" };
	const message = String(body.message ?? "").trim();
	if (message.length > MAX_MESSAGE_LENGTH) return { error: `El mensaje admite hasta ${MAX_MESSAGE_LENGTH} caracteres` };
	return { discountType, discountValue, minOrderSubtotal: minRaw, validUntil: validUntil.toISOString(), message };
}

export function formatMoney(value: number, currency: string | null): string {
	const code = String(currency || "CLP").toUpperCase();
	try {
		return new Intl.NumberFormat("es-CL", {
			style: "currency",
			currency: code,
			maximumFractionDigits: code === "CLP" ? 0 : 2,
		}).format(value);
	} catch {
		return `${code} ${value}`;
	}
}

export function describeDiscount(draft: Pick<CouponDraft, "discountType" | "discountValue">, currency: string | null): string {
	return draft.discountType === "percent"
		? `${draft.discountValue}% de descuento`
		: `${formatMoney(draft.discountValue, currency)} de descuento`;
}

export function formatValidUntil(iso: string, timeZone = "America/Santiago"): string {
	try {
		return new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone }).format(new Date(iso));
	} catch {
		return iso.slice(0, 10);
	}
}

// ---------------------------------------------------------------------------
// Correo
// ---------------------------------------------------------------------------

export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function sanitizeSubject(subject: string): string {
	return subject
		.split("")
		.map((char) => (char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 ? " " : char))
		.join("")
		.replace(/\s+/g, " ")
		.trim();
}

function safeHttpUrl(url: string | null): string | null {
	const trimmed = String(url ?? "").trim();
	return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

export type CouponEmailInput = {
	companyName: string;
	primaryColor: string;
	currency: string | null;
	code: string;
	draft: CouponDraft;
	menuUrl: string | null;
	unsubscribeUrl: string;
	timeZone?: string;
};

export type RenderedCouponEmail = { subject: string; html: string; text: string };

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";
const INK = "#0F172A";
const BODY = "#334155";
const MUTED = "#64748B";
const LINE = "#E5E7EB";

export function renderCouponEmail(input: CouponEmailInput): RenderedCouponEmail {
	const company = input.companyName;
	const discount = describeDiscount(input.draft, input.currency);
	const until = formatValidUntil(input.draft.validUntil, input.timeZone);
	const minimum = input.draft.minOrderSubtotal > 0 ? formatMoney(input.draft.minOrderSubtotal, input.currency) : null;
	const menuUrl = safeHttpUrl(input.menuUrl);
	const unsubscribeUrl = safeHttpUrl(input.unsubscribeUrl) ?? "#";
	const accent = /^#[0-9a-f]{6}$/i.test(input.primaryColor) ? input.primaryColor : "#4F5BFF";

	const subject = sanitizeSubject(`${company}: tienes un cupón de ${discount}`);
	const preheader = `Código ${input.code} · válido hasta el ${until}`;
	const howTo = "Para usarlo, inicia sesión en el menú con este mismo correo y escribe el código al pagar. Es personal y sirve una sola vez.";

	const rows: Array<[string, string]> = [
		["Descuento", discount],
		...(minimum ? ([["Pedido mínimo", minimum]] as Array<[string, string]>) : []),
		["Válido hasta", until],
		["Usos", "1 vez"],
	];

	const messageHtml = input.draft.message
		? `<p style="margin:0 0 20px;font-family:${FONT};font-size:15px;line-height:24px;color:${BODY};">${escapeHtml(input.draft.message).replace(/\n/g, "<br>")}</p>`
		: "";
	const summaryHtml = rows
		.map(
			([label, value], index) => `<tr>
<td style="padding:11px 16px;${index > 0 ? `border-top:1px solid ${LINE};` : ""}font-family:${FONT};font-size:14px;line-height:20px;color:${MUTED};">${escapeHtml(label)}</td>
<td align="right" style="padding:11px 16px;${index > 0 ? `border-top:1px solid ${LINE};` : ""}font-family:${FONT};font-size:14px;line-height:20px;color:${INK};font-weight:600;">${escapeHtml(value)}</td>
</tr>`,
		)
		.join("");
	const buttonHtml = menuUrl
		? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 0;"><tr><td align="center" bgcolor="${accent}" style="border-radius:10px;background:${accent};"><a href="${escapeHtml(menuUrl)}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:15px;line-height:20px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px;">Ir al menú</a></td></tr></table>`
		: "";

	const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#F3F4F6;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F3F4F6;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#FFFFFF;border-radius:16px;border:1px solid ${LINE};">
<tr><td style="padding:22px 32px;border-bottom:4px solid ${accent};font-family:${FONT};font-size:18px;line-height:24px;font-weight:700;color:${INK};">${escapeHtml(company)}</td></tr>
<tr><td style="padding:28px 32px 32px;">
<h1 style="margin:0 0 16px;font-family:${FONT};font-size:24px;line-height:32px;font-weight:700;color:${INK};">Tienes un cupón de ${escapeHtml(discount)}</h1>
${messageHtml}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px;">
<tr><td align="center" style="padding:18px 16px;border:2px dashed ${accent};border-radius:12px;">
<p style="margin:0 0 4px;font-family:${FONT};font-size:12px;line-height:16px;letter-spacing:0.08em;text-transform:uppercase;color:${MUTED};">Tu código</p>
<p style="margin:0;font-family:${MONO};font-size:28px;line-height:36px;font-weight:700;letter-spacing:0.08em;color:${INK};">${escapeHtml(input.code)}</p>
</td></tr>
</table>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px;border:1px solid ${LINE};border-radius:12px;border-collapse:separate;background:#F8FAFC;">${summaryHtml}</table>
<p style="margin:0 0 20px;font-family:${FONT};font-size:14px;line-height:21px;color:${BODY};">${escapeHtml(howTo)}</p>
${buttonHtml}
</td></tr>
</table>
<p style="margin:20px 0 0;max-width:560px;font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED};">Recibes este correo porque tienes una cuenta en el menú de ${escapeHtml(company)}.<br><a href="${escapeHtml(unsubscribeUrl)}" target="_blank" style="color:${MUTED};text-decoration:underline;">No quiero recibir más cupones</a></p>
</td></tr>
</table>
</body>
</html>`;

	const text = [
		company,
		"",
		`Tienes un cupón de ${discount}`,
		...(input.draft.message ? ["", input.draft.message] : []),
		"",
		`Tu código: ${input.code}`,
		"",
		...rows.map(([label, value]) => `${label}: ${value}`),
		"",
		howTo,
		...(menuUrl ? ["", `Ir al menú: ${menuUrl}`] : []),
		"",
		"--",
		`Recibes este correo porque tienes una cuenta en el menú de ${company}.`,
		`No quiero recibir más cupones: ${unsubscribeUrl}`,
	].join("\n");

	return { subject, html, text };
}

/** Correo de prueba al guardar un Resend propio. */
export function renderSenderTestEmail(companyName: string, from: string): RenderedCouponEmail {
	const subject = sanitizeSubject(`Prueba de correo de ${companyName}`);
	const body = `Este es un correo de prueba. Si te llegó, los cupones de ${companyName} van a salir desde ${from}.`;
	return {
		subject,
		html: `<p style="font-family:${FONT};font-size:15px;line-height:24px;color:${BODY};">${escapeHtml(body)}</p>`,
		text: body,
	};
}
