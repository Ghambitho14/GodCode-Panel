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
 *
 * Auth model:
 *  - `verify_jwt=true`: Supabase rechaza requests sin JWT válido.
 *  - El usuario se resuelve en `users` por `auth_user_id`, igual que
 *    `current_user_company_id()` en las políticas RLS: la función nunca muestra
 *    datos de un pedido o una cuenta que ese usuario no pueda ya ver.
 *  - Lo que ya está en claro (compradores rápidos, datos antiguos) pasa tal cual.
 *
 * Secretos: `MENU_ACCOUNT_PII_KEY` (la misma del Portal; si se pierde, los datos
 * cifrados no se recuperan).
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";

import { createPiiOpener, isSealedPii, type PiiOpener } from "../_shared/pii.ts";

const STAFF_ROLES = new Set(["owner", "admin", "ceo", "cashier", "staff"]);
const MAX_ORDERS_PER_REQUEST = 50;

type StaffContext = { admin: SupabaseClient; companyId: string };
type ContextError = { error: string; status: number };

const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
	"Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body ?? {}), {
		status,
		headers: {
			...CORS_HEADERS,
			"Content-Type": "application/json",
			// Datos personales: que nada en el camino los guarde.
			"Cache-Control": "no-store",
		},
	});
}

function getEnv(name: string): string {
	const value = Deno.env.get(name);
	if (!value) throw new Error(`Falta variable de entorno: ${name}`);
	return value;
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
		return { error: "No tienes permisos para ver datos de clientes", status: 403 };
	}
	return { admin, companyId: String(row.company_id) };
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

async function handleListAccounts(ctx: StaffContext): Promise<Response> {
	const { data, error } = await ctx.admin
		.from("menu_client_accounts")
		.select(
			"id, client_id, full_name, phone, document_raw, document_country, preferred_branch_id, is_active, last_login_at, created_at",
		)
		.eq("company_id", ctx.companyId)
		.order("created_at", { ascending: false });
	if (error) return jsonResponse({ error: error.message }, 500);

	const open = await getOpener();
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
		})),
	);
	return jsonResponse({ accounts });
}

async function handleRevealOrders(body: Record<string, unknown>, ctx: StaffContext): Promise<Response> {
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
	if (error) return jsonResponse({ error: error.message }, 500);

	const open = await getOpener();
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
		if (action === "list-accounts") return await handleListAccounts(ctx);
		if (action === "reveal-orders") return await handleRevealOrders(body, ctx);
		return jsonResponse({ error: "Accion desconocida" }, 400);
	} catch (err) {
		const message = err instanceof Error ? err.message : "Error interno";
		// Sin llave válida se falla cerrado y se dice por qué, sin mostrar nada cifrado.
		if (message === "pii_key_invalid") return jsonResponse({ error: "pii_key_missing" }, 503);
		return jsonResponse({ error: message }, 500);
	}
});
