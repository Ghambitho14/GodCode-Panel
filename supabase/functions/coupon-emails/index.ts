/**
 * Edge Function: coupon-emails
 *
 * Manda cupones personales por correo a las cuentas del menú. Siempre POST con
 * `{ action, ... }`:
 *
 *   action="sender-status"   -> con qué remitente salen hoy los cupones
 *   action="preview"         { discountType, discountValue, minOrderSubtotal?, validUntil, message? }
 *                            -> asunto, remitente y HTML de ejemplo
 *   action="send-coupon"     { campaignId, accountIds: [], ...lo de preview }
 *                            -> crea un cupón de 1 uso por cuenta y se lo manda
 *
 * Remitente (`resolveSender` en `_shared/coupon-email.ts`):
 *  - Dominio propio vigente + Resend propio verificado -> el Resend de la empresa.
 *  - Si no -> el Resend de GodCode, «<Empresa> <COUPON_EMAIL_FROM>», respuestas al
 *    correo de la empresa.
 * El Resend propio solo lo configura soporte desde el super admin de GodCode
 * (`lib/email/company-sender.ts`); el panel lo pide con un ticket. Por eso aquí no
 * hay acciones para guardarlo ni quitarlo.
 *
 * Auth: igual que `client-pii`. `verify_jwt=true`; el usuario se resuelve en `users`
 * por `auth_user_id` y todo se filtra por su `company_id`. El correo de un cliente
 * se lee de `auth.users` con service role y nunca vuelve al navegador.
 *
 * Secretos: RESEND_API_KEY y COUPON_EMAIL_FROM (el Resend de GodCode),
 * EMAIL_SENDER_SECRET_KEY (abre las keys propias), EMAIL_UNSUBSCRIBE_SECRET y
 * EMAIL_UNSUBSCRIBE_BASE_URL (enlace de baja, lo atiende GodCode),
 * TENANT_STOREFRONT_ORIGIN (menú sin dominio propio, por defecto https://www.godcode.me).
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";

import {
	companyDisplayName,
	companyPrimaryColor,
	type CompanyForEmail,
	type CompanySenderRow,
	effectiveCustomDomain,
	generateCouponCode,
	isValidEmail,
	MAX_ACCOUNTS_PER_CALL,
	parseCouponDraft,
	renderCouponEmail,
	resolveMenuUrl,
	resolveSender,
	type CouponDraft,
} from "../_shared/coupon-email.ts";
import { createSecretBox } from "../_shared/secret-box.ts";
import { buildUnsubscribeUrl } from "../_shared/unsubscribe-token.ts";

const STAFF_ROLES = new Set(["owner", "admin", "ceo"]);
/** Quienes pueden pedir a soporte el Resend propio (lo muestra `canConfigure`). */
const CONFIG_ROLES = new Set(["owner", "ceo"]);
const RESEND_API = "https://api.resend.com/emails";
/** Resend acepta 2 envíos por segundo en el plan base: se espacian un poco más. */
const RESEND_SPACING_MS = 550;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const COMPANY_SELECT =
	"id, name, email, public_slug, custom_domain, subscription_status, subscription_ends_at, currency, theme_config";
const SENDER_SELECT = "api_key_sealed, api_key_last4, from_email, from_name, reply_to, verified_at, last_error";

type StaffContext = {
	admin: SupabaseClient;
	companyId: string;
	role: string;
};
type ContextError = { error: string; status: number };

const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
	"Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body ?? {}), {
		status,
		headers: { ...CORS_HEADERS, "Content-Type": "application/json", "Cache-Control": "no-store" },
	});
}

function getEnv(name: string): string {
	const value = Deno.env.get(name);
	if (!value) throw new Error(`Falta variable de entorno: ${name}`);
	return value;
}

function optionalEnv(name: string): string {
	return String(Deno.env.get(name) ?? "").trim();
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function getStaffContext(authHeader: string | null): Promise<StaffContext | ContextError> {
	if (!authHeader) return { error: "No autenticado", status: 401 };

	const userClient = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_ANON_KEY"), {
		global: { headers: { Authorization: authHeader } },
		auth: { persistSession: false, autoRefreshToken: false },
	});
	const { data, error } = await userClient.auth.getUser();
	if (error || !data.user?.id) return { error: "No autenticado", status: 401 };

	const admin = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
		auth: { persistSession: false, autoRefreshToken: false },
	});

	const { data: row, error: userError } = await admin
		.from("users")
		.select("company_id, role, is_active")
		.eq("auth_user_id", data.user.id)
		.limit(1)
		.maybeSingle();
	if (userError) return { error: userError.message, status: 500 };

	const role = String(row?.role ?? "").trim().toLowerCase();
	if (!row?.company_id || row.is_active === false || !STAFF_ROLES.has(role)) {
		return { error: "No tienes permisos para enviar cupones", status: 403 };
	}
	return {
		admin,
		companyId: String(row.company_id),
		role,
	};
}

async function loadCompany(ctx: StaffContext): Promise<CompanyForEmail> {
	const { data, error } = await ctx.admin.from("companies").select(COMPANY_SELECT).eq("id", ctx.companyId).maybeSingle();
	if (error) throw new Error(error.message);
	if (!data) throw new Error("Empresa no encontrada");
	return data as CompanyForEmail;
}

async function loadSender(ctx: StaffContext): Promise<CompanySenderRow | null> {
	const { data, error } = await ctx.admin
		.from("company_email_senders")
		.select(SENDER_SELECT)
		.eq("company_id", ctx.companyId)
		.maybeSingle();
	if (error) throw new Error(error.message);
	return (data as CompanySenderRow | null) ?? null;
}

type ResendResult = { ok: true; id: string | null } | { ok: false; status: number; error: string };

async function sendViaResend(
	apiKey: string,
	payload: Record<string, unknown>,
	idempotencyKey?: string,
): Promise<ResendResult> {
	for (let attempt = 0; attempt < 2; attempt++) {
		let res: Response;
		try {
			res = await fetch(RESEND_API, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"Content-Type": "application/json",
					...(idempotencyKey ? { "Idempotency-Key": idempotencyKey.slice(0, 256) } : {}),
				},
				body: JSON.stringify(payload),
			});
		} catch (err) {
			return { ok: false, status: 0, error: err instanceof Error ? err.message : "Error de red al enviar" };
		}
		const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
		if (res.ok) return { ok: true, id: body.id ?? null };
		// Límite de envíos: se espera un poco y se reintenta una vez.
		if (res.status === 429 && attempt === 0) {
			await sleep(1200);
			continue;
		}
		return { ok: false, status: res.status, error: body.message || `Resend respondió ${res.status}` };
	}
	return { ok: false, status: 429, error: "Resend: demasiados envíos seguidos" };
}

function godcodeConfig(): { apiKey: string; fromAddress: string } | null {
	const apiKey = optionalEnv("RESEND_API_KEY");
	const fromAddress = optionalEnv("COUPON_EMAIL_FROM");
	return apiKey && isValidEmail(fromAddress) ? { apiKey, fromAddress } : null;
}

// ---------------------------------------------------------------------------
// Remitente
// ---------------------------------------------------------------------------

async function handleSenderStatus(ctx: StaffContext): Promise<Response> {
	const [company, sender] = await Promise.all([loadCompany(ctx), loadSender(ctx)]);
	const godcode = godcodeConfig();
	const resolved = resolveSender(company, sender, godcode?.fromAddress ?? "cupones@godcode.me");
	return jsonResponse({
		mode: resolved.mode,
		from: resolved.from,
		replyTo: resolved.replyTo,
		customDomain: effectiveCustomDomain(company),
		canConfigure: CONFIG_ROLES.has(ctx.role),
		ready: resolved.mode === "own" || Boolean(godcode),
		own: sender
			? {
					fromEmail: sender.from_email,
					fromName: sender.from_name ?? "",
					replyTo: sender.reply_to ?? "",
					apiKeyLast4: sender.api_key_last4 ?? "",
					verifiedAt: sender.verified_at,
					lastError: sender.last_error,
				}
			: null,
	});
}

// ---------------------------------------------------------------------------
// Cupones
// ---------------------------------------------------------------------------

function storefrontOrigin(): string {
	return optionalEnv("TENANT_STOREFRONT_ORIGIN") || "https://www.godcode.me";
}

function unsubscribeBase(): string {
	return optionalEnv("EMAIL_UNSUBSCRIBE_BASE_URL") || "https://www.godcode.me";
}

function renderFor(company: CompanyForEmail, draft: CouponDraft, code: string, unsubscribeUrl: string) {
	return renderCouponEmail({
		companyName: companyDisplayName(company),
		primaryColor: companyPrimaryColor(company),
		currency: company.currency,
		code,
		draft,
		menuUrl: resolveMenuUrl(company, storefrontOrigin()),
		unsubscribeUrl,
	});
}

async function handlePreview(body: Record<string, unknown>, ctx: StaffContext): Promise<Response> {
	const draft = parseCouponDraft(body);
	if ("error" in draft) return jsonResponse({ error: draft.error }, 400);
	const [company, sender] = await Promise.all([loadCompany(ctx), loadSender(ctx)]);
	const resolved = resolveSender(company, sender, godcodeConfig()?.fromAddress ?? "cupones@godcode.me");
	const rendered = renderFor(company, draft, generateCouponCode(company), `${unsubscribeBase()}/api/email/unsubscribe`);
	return jsonResponse({ subject: rendered.subject, html: rendered.html, from: resolved.from });
}

async function couponCodeIsFree(ctx: StaffContext, code: string): Promise<boolean> {
	const { data, error } = await ctx.admin
		.from("discount_coupons")
		.select("id")
		.eq("company_id", ctx.companyId)
		.ilike("code", code)
		.limit(1);
	if (error) throw new Error(error.message);
	return !data || data.length === 0;
}

type SendResult = {
	accountId: string;
	status: "sent" | "skipped" | "failed";
	code?: string;
	reason?: string;
};

async function handleSendCoupon(body: Record<string, unknown>, ctx: StaffContext): Promise<Response> {
	const campaignId = String(body.campaignId ?? "").trim();
	if (!UUID_RE.test(campaignId)) return jsonResponse({ error: "Falta campaignId" }, 400);
	const accountIds = Array.isArray(body.accountIds)
		? [...new Set(body.accountIds.map((id) => String(id ?? "").trim().toLowerCase()).filter((id) => UUID_RE.test(id)))]
		: [];
	if (accountIds.length === 0) return jsonResponse({ error: "Elige al menos un cliente" }, 400);
	if (accountIds.length > MAX_ACCOUNTS_PER_CALL) {
		return jsonResponse({ error: `Máximo ${MAX_ACCOUNTS_PER_CALL} clientes por envío` }, 400);
	}
	const draft = parseCouponDraft(body);
	if ("error" in draft) return jsonResponse({ error: draft.error }, 400);

	const [company, sender] = await Promise.all([loadCompany(ctx), loadSender(ctx)]);
	const godcode = godcodeConfig();
	const resolved = resolveSender(company, sender, godcode?.fromAddress ?? "");
	let apiKey: string;
	if (resolved.mode === "own") {
		const box = await createSecretBox(Deno.env.get("EMAIL_SENDER_SECRET_KEY") ?? "");
		apiKey = await box.open(resolved.sealedApiKey!);
	} else {
		if (!godcode) return jsonResponse({ error: "El correo de GodCode no está configurado todavía" }, 503);
		apiKey = godcode.apiKey;
	}
	const unsubscribeSecret = getEnv("EMAIL_UNSUBSCRIBE_SECRET");

	const { data: accountRows, error: accountsError } = await ctx.admin
		.from("menu_client_accounts")
		.select("id, auth_user_id, is_active, marketing_email_opt_out_at")
		.eq("company_id", ctx.companyId)
		.in("id", accountIds);
	if (accountsError) return jsonResponse({ error: accountsError.message }, 500);
	const accounts = new Map((accountRows ?? []).map((row) => [String(row.id).toLowerCase(), row]));

	const results: SendResult[] = [];
	let lastSendAt = 0;

	for (const accountId of accountIds) {
		const account = accounts.get(accountId);
		if (!account) {
			results.push({ accountId, status: "skipped", reason: "Cuenta no encontrada" });
			continue;
		}
		if (account.is_active === false) {
			results.push({ accountId, status: "skipped", reason: "Cuenta desactivada" });
			continue;
		}
		if (account.marketing_email_opt_out_at) {
			results.push({ accountId, status: "skipped", reason: "Se dio de baja de los correos" });
			continue;
		}
		if (!account.auth_user_id) {
			results.push({ accountId, status: "skipped", reason: "Sin correo" });
			continue;
		}
		const { data: authUser, error: authError } = await ctx.admin.auth.admin.getUserById(String(account.auth_user_id));
		const email = authUser?.user?.email?.trim().toLowerCase() ?? "";
		if (authError || !isValidEmail(email)) {
			results.push({ accountId, status: "skipped", reason: "Sin correo" });
			continue;
		}

		let code = "";
		for (let attempt = 0; attempt < 5 && !code; attempt++) {
			const candidate = generateCouponCode(company);
			if (await couponCodeIsFree(ctx, candidate)) code = candidate;
		}
		if (!code) {
			results.push({ accountId, status: "failed", reason: "No se pudo generar un código libre" });
			continue;
		}

		const unsubscribeUrl = await buildUnsubscribeUrl(unsubscribeBase(), unsubscribeSecret, accountId, ctx.companyId);
		const rendered = renderFor(company, draft, code, unsubscribeUrl);
		const dedupeKey = `coupon:${campaignId}:${accountId}`;

		// Reserva el envío: si el mismo envío se reintenta, esta cuenta no recibe dos cupones.
		const { data: delivery, error: claimError } = await ctx.admin
			.from("email_deliveries")
			.insert({
				kind: "coupon",
				recipient: email,
				subject: rendered.subject.slice(0, 300),
				company_id: ctx.companyId,
				dedupe_key: dedupeKey,
				status: "sending",
				metadata: { campaign_id: campaignId, account_id: accountId, sender_mode: resolved.mode },
			})
			.select("id")
			.single();
		if (claimError) {
			if (claimError.code === "23505") {
				results.push({ accountId, status: "skipped", reason: "Ya se le envió en este envío" });
			} else {
				results.push({ accountId, status: "failed", reason: claimError.message });
			}
			continue;
		}
		const deliveryId = String(delivery.id);

		const { data: coupon, error: couponError } = await ctx.admin
			.from("discount_coupons")
			.insert({
				company_id: ctx.companyId,
				code,
				discount_type: draft.discountType,
				discount_value: draft.discountValue,
				scope: "client_only",
				restricted_account_id: accountId,
				restricted_client_id: null,
				min_order_subtotal: draft.minOrderSubtotal,
				max_redemptions: 1,
				max_redemptions_per_client: 1,
				valid_from: new Date().toISOString(),
				valid_until: draft.validUntil,
				is_active: true,
			})
			.select("id")
			.single();
		if (couponError) {
			await ctx.admin
				.from("email_deliveries")
				.update({ status: "failed", error: couponError.message.slice(0, 500), dedupe_key: null })
				.eq("id", deliveryId);
			results.push({ accountId, status: "failed", reason: "No se pudo crear el cupón" });
			continue;
		}

		const wait = lastSendAt + RESEND_SPACING_MS - Date.now();
		if (wait > 0) await sleep(wait);
		lastSendAt = Date.now();
		const sent = await sendViaResend(
			apiKey,
			{
				from: resolved.from,
				to: email,
				subject: rendered.subject,
				html: rendered.html,
				text: rendered.text,
				...(resolved.replyTo ? { reply_to: resolved.replyTo } : {}),
				headers: {
					"List-Unsubscribe": `<${unsubscribeUrl}>`,
					"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
				},
				tags: [
					{ name: "kind", value: "coupon" },
					{ name: "company", value: ctx.companyId },
				],
			},
			dedupeKey,
		);

		if (!sent.ok) {
			// Un cupón que no llegó a nadie no debe quedar vivo.
			await ctx.admin.from("discount_coupons").delete().eq("id", coupon.id);
			await ctx.admin
				.from("email_deliveries")
				.update({ status: "failed", error: sent.error.slice(0, 500), dedupe_key: null })
				.eq("id", deliveryId);
			if (resolved.mode === "own" && (sent.status === 401 || sent.status === 403)) {
				await ctx.admin
					.from("company_email_senders")
					.update({ last_error: sent.error.slice(0, 500), updated_at: new Date().toISOString() })
					.eq("company_id", ctx.companyId);
			}
			results.push({ accountId, status: "failed", reason: sent.error });
			continue;
		}

		await ctx.admin
			.from("email_deliveries")
			.update({
				status: "sent",
				sent_at: new Date().toISOString(),
				provider_message_id: sent.id,
				metadata: {
					campaign_id: campaignId,
					account_id: accountId,
					sender_mode: resolved.mode,
					coupon_id: coupon.id,
					code,
				},
			})
			.eq("id", deliveryId);
		results.push({ accountId, status: "sent", code });
	}

	return jsonResponse({
		results,
		sent: results.filter((r) => r.status === "sent").length,
		from: resolved.from,
	});
}

Deno.serve(async (req: Request): Promise<Response> => {
	if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
	if (req.method !== "POST") return jsonResponse({ error: "Metodo no permitido" }, 405);

	try {
		const ctx = await getStaffContext(req.headers.get("Authorization"));
		if ("error" in ctx) return jsonResponse({ error: ctx.error }, ctx.status);

		let body: Record<string, unknown>;
		try {
			body = (await req.json()) as Record<string, unknown>;
		} catch {
			body = {};
		}

		const action = String(body.action ?? "").trim().toLowerCase();
		if (action === "sender-status") return await handleSenderStatus(ctx);
		if (action === "save-sender" || action === "delete-sender") {
			return jsonResponse({ error: "El correo de los cupones lo configura Soporte de GodCode. Pídelo con un ticket." }, 403);
		}
		if (action === "preview") return await handlePreview(body, ctx);
		if (action === "send-coupon") return await handleSendCoupon(body, ctx);
		return jsonResponse({ error: "Accion desconocida" }, 400);
	} catch (err) {
		const message = err instanceof Error ? err.message : "Error interno";
		// Sin llave válida se falla cerrado: no se usa ni se guarda ninguna key.
		if (message === "secret_key_invalid" || message === "secret_open_failed") {
			return jsonResponse({ error: "email_sender_key_missing" }, 503);
		}
		if (message === "unsubscribe_secret_invalid") return jsonResponse({ error: "email_unsubscribe_secret_missing" }, 503);
		return jsonResponse({ error: message }, 500);
	}
});
