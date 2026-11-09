/**
 * Edge Function: client-pii
 *
 * Descifra, para el personal del negocio, los datos personales de las cuentas del
 * menú. El Portal los guarda cifrados (`enc:v1:`) con una llave que la base no
 * tiene; esta función es el único lugar del panel donde vive esa llave.
 *
 * Siempre POST con `{ action, ... }`:
 *   action="list-accounts"                     -> cuentas de la empresa, descifradas
 *   action="reveal-orders"  { orderIds: [] }   -> teléfono, documento y dirección
 *                                                 de esos pedidos (máx. 50)
 *   action="client-addresses" { clientId }     -> direcciones guardadas de esa ficha
 *
 * Auth model:
 *  - `verify_jwt=true`: Supabase rechaza requests sin JWT válido.
 *  - El usuario se resuelve en `users` por `auth_user_id` (`_shared/staff-auth.ts`),
 *    igual que `current_user_company_id()` en las políticas RLS: la función nunca
 *    muestra datos de un pedido o una cuenta que ese usuario no pueda ya ver.
 *  - Lo que ya está en claro (compradores rápidos, datos antiguos) pasa tal cual.
 *  - Cada descifrado deja un evento `pii.access` en el log y una fila `pii.decrypt`
 *    en `public.audit_log` (quién, qué empresa, cuántos registros, IP y navegador).
 *    Si la fila no se puede escribir, la respuesta sigue: queda el aviso en el log.
 *
 * Secretos: `MENU_ACCOUNT_PII_KEY` (la misma del Portal; si se pierde, los datos
 * cifrados no se recuperan).
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { withCors } from "../_shared/cors.ts";
import { createPiiOpener, isSealedPii, type PiiOpener } from "../_shared/pii.ts";
import { resolveStaff, staffLog, type StaffContext } from "../_shared/staff-auth.ts";

const STAFF_ROLES = new Set(["admin", "ceo", "cashier", "staff"]);
const MAX_ORDERS_PER_REQUEST = 50;
const MAX_ADDRESSES_PER_CLIENT = 10;

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body ?? {}), {
		status,
		headers: {
			"Content-Type": "application/json",
			// Datos personales: que nada en el camino los guarde.
			"Cache-Control": "no-store",
		},
	});
}

/** El detalle de Postgres va al log; al navegador, nada que describa la base. */
function internalError(where: string, error: unknown): Response {
	staffLog("error", "client-pii.error", {
		where,
		error: error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error),
	});
	return jsonResponse({ error: "Error interno" }, 500);
}

type PiiTarget = { type: string; ids?: string[] };

/**
 * La cadena entera de x-forwarded-for, no el primer valor (ese lo escribe el cliente).
 * Mismo criterio que `logAuditEvent` de GodCode y el trigger de `audit_log`.
 */
function forwardedChain(req: Request): string | null {
	const chain = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "";
	return chain.trim().slice(0, 200) || null;
}

async function logPiiAccess(
	ctx: StaffContext,
	req: Request,
	action: string,
	count: number,
	target: PiiTarget,
): Promise<void> {
	const ids = (target.ids ?? []).slice(0, MAX_ORDERS_PER_REQUEST);
	staffLog("info", "pii.access", {
		action,
		company_id: ctx.companyId,
		auth_user_id: ctx.authUserId,
		role: ctx.role,
		count,
		target_ids: ids,
	});
	try {
		const { error } = await ctx.admin.from("audit_log").insert({
			company_id: ctx.companyId,
			actor_auth_user_id: ctx.authUserId,
			actor_role: ctx.role,
			action: "pii.decrypt",
			target_type: target.type,
			target_count: count,
			target_ids: ids.length ? ids : null,
			ip: forwardedChain(req),
			user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
			request_id: req.headers.get("x-request-id")?.slice(0, 100) ?? null,
			metadata: { operation: action },
		});
		if (error) staffLog("warn", "pii.audit_failed", { action, error: error.message });
	} catch (err) {
		staffLog("warn", "pii.audit_failed", { action, error: err instanceof Error ? err.message : String(err) });
	}
}

let openerPromise: Promise<PiiOpener> | null = null;
function getOpener(): Promise<PiiOpener> {
	if (!openerPromise) {
		openerPromise = createPiiOpener(Deno.env.get("MENU_ACCOUNT_PII_KEY") ?? "").catch((err) => {
			openerPromise = null;
			throw err;
		});
	}
	return openerPromise;
}

/** Un valor que no abre (llave cambiada, dato alterado) sale como null, no rompe el lote. */
async function openSafe(open: PiiOpener, value: unknown): Promise<string | null> {
	if (value == null || value === "") return (value as string | null) ?? null;
	try {
		return await open(String(value));
	} catch {
		console.error("[client-pii] valor que no se pudo abrir");
		return null;
	}
}

/**
 * La dirección de un pedido de cuenta guarda en claro solo lo operativo (zona,
 * proveedor de envío) y el resto en `sealed`. Se devuelve ya unida.
 */
async function openDeliveryAddress(open: PiiOpener, raw: unknown): Promise<unknown> {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw ?? null;
	const { sealed, ...rest } = raw as Record<string, unknown>;
	if (!isSealedPii(sealed)) return raw;
	const plain = await openSafe(open, sealed);
	if (!plain) return rest;
	try {
		const parsed = JSON.parse(plain);
		return parsed && typeof parsed === "object" ? { ...rest, ...parsed } : rest;
	} catch {
		return rest;
	}
}

async function handleListAccounts(ctx: StaffContext, req: Request): Promise<Response> {
	const { data, error } = await ctx.admin
		.from("menu_client_accounts")
		.select(
			"id, client_id, auth_user_id, full_name, phone, document_raw, document_country, preferred_branch_id, is_active, last_login_at, created_at, marketing_email_opt_out_at",
		)
		.eq("company_id", ctx.companyId)
		.order("created_at", { ascending: false });
	if (error) return internalError("list-accounts", error);

	const open = await getOpener();
	await logPiiAccess(ctx, req, "list-accounts", data?.length ?? 0, { type: "menu_client_accounts" });
	const accounts = await Promise.all(
		(data ?? []).map(async (row) => ({
			id: row.id,
			clientId: row.client_id ?? null,
			fullName: await openSafe(open, row.full_name),
			phone: await openSafe(open, row.phone),
			document: await openSafe(open, row.document_raw),
			documentCountry: row.document_country ?? null,
			preferredBranchId: row.preferred_branch_id ?? null,
			isActive: row.is_active !== false,
			lastLoginAt: row.last_login_at ?? null,
			createdAt: row.created_at ?? null,
			// Para los cupones por correo: si tiene login (y por tanto correo) y si se
			// dio de baja. El correo en sí no sale de la función `coupon-emails`.
			canReceiveEmail: Boolean(row.auth_user_id),
			emailOptOut: Boolean(row.marketing_email_opt_out_at),
		})),
	);
	return jsonResponse({ accounts });
}

/**
 * Direcciones guardadas de una ficha con cuenta, la más usada primero. El Portal
 * las cifra al guardarlas; la zona y los km quedan en claro porque son operativos.
 */
async function handleClientAddresses(body: Record<string, unknown>, ctx: StaffContext, req: Request): Promise<Response> {
	const clientId = String(body.clientId ?? "").trim();
	if (!/^[0-9a-f-]{36}$/i.test(clientId)) return jsonResponse({ error: "Falta clientId" }, 400);

	const { data, error } = await ctx.admin
		.from("client_addresses")
		.select("id, address_line, reference, named_area_id, delivery_km, last_used_at")
		.eq("company_id", ctx.companyId)
		.eq("client_id", clientId)
		.order("last_used_at", { ascending: false, nullsFirst: false })
		.limit(MAX_ADDRESSES_PER_CLIENT);
	if (error) return internalError("client-addresses", error);

	const open = await getOpener();
	await logPiiAccess(ctx, req, "client-addresses", data?.length ?? 0, { type: "clients", ids: [clientId] });
	const addresses = await Promise.all(
		(data ?? []).map(async (row) => ({
			id: row.id,
			address: await openSafe(open, row.address_line),
			reference: await openSafe(open, row.reference),
			namedAreaId: row.named_area_id ?? null,
			deliveryKm: row.delivery_km ?? null,
			lastUsedAt: row.last_used_at ?? null,
		})),
	);
	return jsonResponse({ addresses: addresses.filter((a) => String(a.address ?? "").trim()) });
}

async function handleRevealOrders(body: Record<string, unknown>, ctx: StaffContext, req: Request): Promise<Response> {
	const ids = Array.isArray(body.orderIds)
		? [...new Set(body.orderIds.map((id) => String(id ?? "").trim()).filter((id) => /^\d+$/.test(id)))]
		: [];
	if (ids.length === 0) return jsonResponse({ error: "Faltan orderIds" }, 400);
	if (ids.length > MAX_ORDERS_PER_REQUEST) {
		return jsonResponse({ error: `Máximo ${MAX_ORDERS_PER_REQUEST} pedidos por consulta` }, 400);
	}

	const { data, error } = await ctx.admin
		.from("orders")
		.select("id, client_phone, client_rut, delivery_address")
		.eq("company_id", ctx.companyId)
		.in("id", ids);
	if (error) return internalError("reveal-orders", error);

	const open = await getOpener();
	await logPiiAccess(ctx, req, "reveal-orders", data?.length ?? 0, {
		type: "orders",
		ids: (data ?? []).map((row) => String(row.id)),
	});
	const orders = await Promise.all(
		(data ?? []).map(async (row) => ({
			id: row.id,
			phone: await openSafe(open, row.client_phone),
			rut: await openSafe(open, row.client_rut),
			deliveryAddress: await openDeliveryAddress(open, row.delivery_address),
		})),
	);
	return jsonResponse({ orders });
}

Deno.serve(withCors("POST, OPTIONS", async (req: Request): Promise<Response> => {
	if (req.method !== "POST") return jsonResponse({ error: "Metodo no permitido" }, 405);

	try {
		const ctx = await resolveStaff(req.headers.get("Authorization"), {
			roles: STAFF_ROLES,
			forbiddenMessage: "No tienes permisos para ver datos de clientes",
		});
		if ("error" in ctx) return jsonResponse({ error: ctx.error }, ctx.status);

		let body: Record<string, unknown>;
		try {
			body = (await req.json()) as Record<string, unknown>;
		} catch {
			body = {};
		}

		const action = String(body.action ?? "").trim().toLowerCase();
		if (action === "list-accounts") return await handleListAccounts(ctx, req);
		if (action === "reveal-orders") return await handleRevealOrders(body, ctx, req);
		if (action === "client-addresses") return await handleClientAddresses(body, ctx, req);
		return jsonResponse({ error: "Accion desconocida" }, 400);
	} catch (err) {
		const message = err instanceof Error ? err.message : "Error interno";
		// Sin llave válida se falla cerrado y se dice por qué, sin mostrar nada cifrado.
		if (message === "pii_key_invalid") return jsonResponse({ error: "pii_key_missing" }, 503);
		return internalError("serve", err);
	}
}));
