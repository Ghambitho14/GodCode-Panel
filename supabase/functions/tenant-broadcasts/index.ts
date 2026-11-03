/**
 * Edge Function: tenant-broadcasts
 *
 * Reemplaza al endpoint Next.js legacy `/api/tenant-broadcasts` (panel-viejo)
 * y al endpoint paralelo `GodCode-Saas/app/api/tenant/broadcasts/route.ts`.
 *
 * El front (`GodCode-panel`) la invoca con `supabase.functions.invoke('tenant-broadcasts')`,
 * que adjunta automaticamente el header `Authorization: Bearer <jwt>` del usuario logueado.
 *
 * GET  -> devuelve los broadcasts activos visibles para la company del usuario,
 *         con `readAt` (timestamp del acuse) o null.
 * POST -> body { broadcastId } -> upsert de acuse en `saas_broadcast_reads`.
 *
 * Auth model:
 *  - `verify_jwt=true` en el deploy: Supabase rechaza el request si el JWT no es valido
 *    antes de invocar la function.
 *  - El usuario se resuelve con `_shared/staff-auth.ts` (por `auth_user_id`, exige
 *    `is_active`). Para leer companies/saas_broadcasts/saas_broadcast_reads se usa
 *    SUPABASE_SERVICE_ROLE_KEY (mismo modelo que el endpoint del SaaS), porque:
 *      * `users` no permite leer otros perfiles via RLS;
 *      * `saas_broadcast_reads` no tiene policy INSERT para autenticados.
 *
 * Cero dependencia de cookies del SaaS. CORS solo para los orígenes del panel
 * (`_shared/cors.ts`).
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";

import { withCors } from "../_shared/cors.ts";
import { resolveStaff, staffLog, type StaffContext } from "../_shared/staff-auth.ts";

const METHODS = "GET, POST, OPTIONS";

type BroadcastRow = {
	id: string;
	title: string;
	message: string;
	broadcast_type: "general" | "maintenance" | "incident" | "billing" | "release";
	priority: "low" | "medium" | "high" | "critical";
	target_scope: "all" | "plans" | "companies" | "subdomains";
	target_plan_ids: string[] | null;
	target_company_ids: string[] | null;
	target_subdomains: string[] | null;
	starts_at: string;
	ends_at: string | null;
	requires_ack: boolean;
	is_active: boolean;
	created_at: string;
};

type TenantContext = {
	admin: SupabaseClient;
	companyId: string;
	companyPlanId: string | null;
	companySlug: string;
	email: string;
};

type ContextError = { error: string; status: number };

const TENANT_ALLOWED_ROLES = new Set(["admin", "ceo", "cashier", "staff"]);

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body ?? {}), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

/** El detalle de Postgres va al log; al navegador, nada que describa la base. */
function dbError(where: string, error: unknown, status = 500): Response {
	staffLog("error", "tenant-broadcasts.error", {
		where,
		error: error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error),
	});
	return jsonResponse({ error: "Error interno" }, status);
}

function resolveTenantStaff(authHeader: string | null): Promise<StaffContext | ContextError> {
	return resolveStaff(authHeader, {
		roles: TENANT_ALLOWED_ROLES,
		forbiddenMessage: "No tienes permisos de panel tenant",
		allowEmailFallback: true,
	});
}

async function getTenantContext(
	authHeader: string | null,
): Promise<TenantContext | ContextError> {
	const staff = await resolveTenantStaff(authHeader);
	if ("error" in staff) return staff;

	const { data: company, error: companyError } = await staff.admin
		.from("companies")
		.select("id, plan_id, public_slug")
		.eq("id", staff.companyId)
		.maybeSingle();

	if (companyError) {
		staffLog("error", "tenant-broadcasts.error", { where: "company", error: companyError.message });
		return { error: "Error interno", status: 500 };
	}
	if (!company) {
		return { error: "No se encontro la empresa", status: 404 };
	}

	return {
		admin: staff.admin,
		companyId: company.id as string,
		companyPlanId: (company.plan_id ?? null) as string | null,
		companySlug: String(company.public_slug || "").toLowerCase(),
		email: staff.email,
	};
}

function shouldIncludeBroadcast(
	item: BroadcastRow,
	ctx: Pick<TenantContext, "companyId" | "companyPlanId" | "companySlug">,
): boolean {
	if (!item.is_active) return false;

	const scope = item.target_scope;
	if (scope === "all") return true;

	if (scope === "companies") {
		const ids = Array.isArray(item.target_company_ids)
			? item.target_company_ids
			: [];
		return ids.includes(ctx.companyId);
	}

	if (scope === "plans") {
		const planIds = Array.isArray(item.target_plan_ids)
			? item.target_plan_ids
			: [];
		return !!ctx.companyPlanId && planIds.includes(ctx.companyPlanId);
	}

	if (scope === "subdomains") {
		const slugs = Array.isArray(item.target_subdomains)
			? item.target_subdomains.map((slug) => String(slug).toLowerCase())
			: [];
		return !!ctx.companySlug && slugs.includes(ctx.companySlug);
	}

	return false;
}

const BROADCAST_SELECT =
	"id, title, message, broadcast_type, priority, target_scope, target_plan_ids, target_company_ids, target_subdomains, starts_at, ends_at, requires_ack, is_active, created_at";

async function handleGet(ctx: TenantContext): Promise<Response> {
	const nowIso = new Date().toISOString();

	const { data, error } = await ctx.admin
		.from("saas_broadcasts")
		.select(BROADCAST_SELECT)
		.eq("is_active", true)
		.lte("starts_at", nowIso)
		.or(`ends_at.is.null,ends_at.gte.${nowIso}`)
		.order("priority", { ascending: false })
		.order("starts_at", { ascending: false });

	if (error) {
		return dbError("list", error, 400);
	}

	const visible = ((data ?? []) as BroadcastRow[]).filter((item) =>
		shouldIncludeBroadcast(item, ctx),
	);
	const ids = visible.map((item) => item.id);
	const readMap = new Map<string, string>();

	if (ids.length > 0) {
		const { data: reads, error: readsError } = await ctx.admin
			.from("saas_broadcast_reads")
			.select("broadcast_id, read_at")
			.eq("company_id", ctx.companyId)
			.eq("email", ctx.email)
			.in("broadcast_id", ids);

		if (!readsError && Array.isArray(reads)) {
			for (const row of reads as { broadcast_id: string; read_at: string }[]) {
				readMap.set(row.broadcast_id, row.read_at);
			}
		}
	}

	return jsonResponse({
		broadcasts: visible.map((item) => ({
			id: item.id,
			title: item.title,
			message: item.message,
			broadcastType: item.broadcast_type,
			priority: item.priority,
			startsAt: item.starts_at,
			endsAt: item.ends_at,
			requiresAck: item.requires_ack,
			readAt: readMap.get(item.id) ?? null,
		})),
	});
}

async function handlePost(req: Request, ctx: TenantContext): Promise<Response> {
	let body: { broadcastId?: unknown };
	try {
		body = await req.json();
	} catch {
		return jsonResponse({ error: "JSON invalido" }, 400);
	}

	const broadcastId = String(body.broadcastId ?? "").trim();
	if (!broadcastId) {
		return jsonResponse({ error: "Falta broadcastId" }, 400);
	}

	const { data: broadcast, error: broadcastError } = await ctx.admin
		.from("saas_broadcasts")
		.select(BROADCAST_SELECT)
		.eq("id", broadcastId)
		.maybeSingle();

	if (broadcastError) return dbError("read-broadcast", broadcastError, 500);
	if (!broadcast) {
		return jsonResponse({ error: "Comunicado no encontrado" }, 404);
	}

	if (!shouldIncludeBroadcast(broadcast as BroadcastRow, ctx)) {
		return jsonResponse(
			{ error: "No autorizado para este comunicado" },
			403,
		);
	}

	const { error: upsertError } = await ctx.admin
		.from("saas_broadcast_reads")
		.upsert(
			{
				broadcast_id: broadcastId,
				company_id: ctx.companyId,
				email: ctx.email,
				read_at: new Date().toISOString(),
			},
			{ onConflict: "broadcast_id,company_id,email" },
		);

	if (upsertError) {
		return dbError("mark-read", upsertError, 400);
	}

	return jsonResponse({ success: true });
}

Deno.serve(withCors(METHODS, async (req: Request): Promise<Response> => {
	if (req.method !== "GET" && req.method !== "POST") {
		return jsonResponse({ error: "Metodo no permitido" }, 405);
	}

	try {
		const ctx = await getTenantContext(req.headers.get("Authorization"));
		if ("error" in ctx) {
			return jsonResponse({ error: ctx.error }, ctx.status);
		}

		if (req.method === "GET") {
			return await handleGet(ctx);
		}

		return await handlePost(req, ctx);
	} catch (err) {
		return dbError("serve", err);
	}
}));
