/**
 * Edge Function: tenant-tickets
 *
 * Reemplaza a los endpoints Next.js legacy del panel viejo:
 *   - GET  /api/tenant-tickets                  -> lista de tickets de la company
 *   - POST /api/tenant-tickets                  -> crea ticket + primer mensaje
 *   - GET  /api/tenant-tickets/:id/messages     -> mensajes publicos del ticket
 *   - POST /api/tenant-tickets/:id/messages     -> agrega respuesta del tenant
 *
 * Diseño: SIEMPRE POST con `{ action, ... }` en el body. `supabase.functions.invoke`
 * no transmite query-params, asi que el routeo se hace por la propiedad `action`:
 *   action="list-tickets"       (sin params)                -> handleListTickets
 *   action="create-ticket"      { subject, description, category, priority }
 *   action="list-messages"      { ticketId }
 *   action="send-message"       { ticketId, message }
 *
 * Auth model:
 *  - `verify_jwt=true`: Supabase rechaza requests sin JWT valido.
 *  - El usuario se resuelve con `_shared/staff-auth.ts` (por `auth_user_id`,
 *    exige `is_active`) y SUPABASE_SERVICE_ROLE_KEY escribe
 *    saas_tickets/saas_ticket_messages (mismo modelo del SaaS).
 *
 * Tablas tocadas (NO accesibles por RLS desde el cliente):
 *   - saas_tickets
 *   - saas_ticket_messages
 *   - users
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";

import { withCors } from "../_shared/cors.ts";
import { resolveStaff, staffLog, type StaffContext } from "../_shared/staff-auth.ts";

type TicketStatus =
	| "open"
	| "in_progress"
	| "waiting_customer"
	| "resolved"
	| "closed";
type TicketPriority = "low" | "medium" | "high" | "critical";
type TicketCategory = "general" | "billing" | "technical" | "product" | "account";

type TicketRow = {
	id: string;
	company_id: string;
	created_by_email: string;
	source: "tenant" | "saas";
	subject: string;
	description: string;
	category: TicketCategory;
	priority: TicketPriority;
	status: TicketStatus;
	assigned_to: string | null;
	first_response_at: string | null;
	resolved_at: string | null;
	first_response_due_at: string | null;
	resolution_due_at: string | null;
	last_message_at: string;
	created_at: string;
	updated_at: string;
};

type MessageRow = {
	id: string;
	ticket_id: string;
	author_type: "tenant" | "super_admin" | "system";
	author_email: string | null;
	is_internal: boolean;
	message: string;
	created_at: string;
};

type TenantContext = StaffContext;

type ContextError = { error: string; status: number };

const TENANT_ALLOWED_ROLES = new Set(["admin", "ceo", "cashier", "staff"]);

const VALID_PRIORITIES = new Set<TicketPriority>([
	"low",
	"medium",
	"high",
	"critical",
]);
const VALID_CATEGORIES = new Set<TicketCategory>([
	"general",
	"billing",
	"technical",
	"product",
	"account",
]);

const SLA_HOURS: Record<TicketPriority, { firstResponse: number; resolution: number }> = {
	low: { firstResponse: 24, resolution: 120 },
	medium: { firstResponse: 12, resolution: 48 },
	high: { firstResponse: 4, resolution: 24 },
	critical: { firstResponse: 2, resolution: 8 },
};

const TICKET_SELECT =
	"id, company_id, created_by_email, source, subject, description, category, priority, status, assigned_to, first_response_at, resolved_at, first_response_due_at, resolution_due_at, last_message_at, created_at, updated_at";

const MESSAGE_SELECT =
	"id, ticket_id, author_type, author_email, is_internal, message, created_at";

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body ?? {}), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

/** El detalle de Postgres va al log; al navegador, nada que describa la base. */
function dbError(where: string, error: unknown, status = 500): Response {
	staffLog("error", "tenant-tickets.error", {
		where,
		error: error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error),
	});
	return jsonResponse({ error: "Error interno" }, status);
}

function getTenantContext(authHeader: string | null): Promise<TenantContext | ContextError> {
	return resolveStaff(authHeader, {
		roles: TENANT_ALLOWED_ROLES,
		forbiddenMessage: "No tienes permisos de panel tenant",
		allowEmailFallback: true,
	});
}

function ticketToDto(row: TicketRow) {
	return {
		id: row.id,
		companyId: row.company_id,
		createdByEmail: row.created_by_email,
		source: row.source,
		subject: row.subject,
		description: row.description,
		category: row.category,
		priority: row.priority,
		status: row.status,
		assignedTo: row.assigned_to,
		firstResponseAt: row.first_response_at,
		resolvedAt: row.resolved_at,
		firstResponseDueAt: row.first_response_due_at,
		resolutionDueAt: row.resolution_due_at,
		lastMessageAt: row.last_message_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function addHours(iso: string, hours: number): string {
	const base = new Date(iso);
	if (Number.isNaN(base.getTime())) return iso;
	return new Date(base.getTime() + hours * 60 * 60 * 1000).toISOString();
}

async function verifyTicketOwnership(
	admin: SupabaseClient,
	ticketId: string,
	companyId: string,
): Promise<{ ok: true } | ContextError> {
	const { data, error } = await admin
		.from("saas_tickets")
		.select("id, company_id")
		.eq("id", ticketId)
		.maybeSingle();

	if (error) {
		staffLog("error", "tenant-tickets.error", { where: "verify-ownership", error: error.message });
		return { error: "Error interno", status: 500 };
	}
	if (!data) {
		return { error: "Ticket no encontrado", status: 404 };
	}
	if (data.company_id !== companyId) {
		return { error: "No autorizado para este ticket", status: 403 };
	}
	return { ok: true };
}

async function handleListTickets(ctx: TenantContext): Promise<Response> {
	const { data, error } = await ctx.admin
		.from("saas_tickets")
		.select(TICKET_SELECT)
		.eq("company_id", ctx.companyId)
		.order("last_message_at", { ascending: false })
		.order("created_at", { ascending: false });

	if (error) return dbError("list-tickets", error, 400);

	return jsonResponse({
		tickets: ((data ?? []) as TicketRow[]).map(ticketToDto),
	});
}

async function handleCreateTicket(
	body: Record<string, unknown>,
	ctx: TenantContext,
): Promise<Response> {
	const subject = String(body.subject ?? "").trim();
	const description = String(body.description ?? "").trim();
	const categoryRaw = String(body.category ?? "general").trim().toLowerCase();
	const priorityRaw = String(body.priority ?? "medium").trim().toLowerCase();

	if (!subject) return jsonResponse({ error: "El asunto es obligatorio" }, 400);
	if (!description) {
		return jsonResponse({ error: "La descripcion es obligatoria" }, 400);
	}
	if (!VALID_CATEGORIES.has(categoryRaw as TicketCategory)) {
		return jsonResponse({ error: "Categoria invalida" }, 400);
	}
	if (!VALID_PRIORITIES.has(priorityRaw as TicketPriority)) {
		return jsonResponse({ error: "Prioridad invalida" }, 400);
	}

	const category = categoryRaw as TicketCategory;
	const priority = priorityRaw as TicketPriority;
	const nowIso = new Date().toISOString();
	const { firstResponse, resolution } = SLA_HOURS[priority];

	const { data, error } = await ctx.admin
		.from("saas_tickets")
		.insert({
			company_id: ctx.companyId,
			created_by_email: ctx.email,
			source: "tenant",
			subject,
			description,
			category,
			priority,
			status: "open",
			first_response_due_at: addHours(nowIso, firstResponse),
			resolution_due_at: addHours(nowIso, resolution),
			last_message_at: nowIso,
			updated_at: nowIso,
		})
		.select(TICKET_SELECT)
		.single();

	if (error) return dbError("create-ticket", error, 400);
	if (!data) return jsonResponse({ error: "No se pudo crear el ticket" }, 400);

	const ticket = data as TicketRow;
	const { error: msgError } = await ctx.admin
		.from("saas_ticket_messages")
		.insert({
			ticket_id: ticket.id,
			author_type: "tenant",
			author_email: ctx.email,
			is_internal: false,
			message: description,
		});

	if (msgError) {
		return dbError("create-ticket-message", msgError, 400);
	}

	return jsonResponse({ success: true, ticket: ticketToDto(ticket) });
}

async function handleListMessages(
	ticketId: string,
	ctx: TenantContext,
): Promise<Response> {
	const ownership = await verifyTicketOwnership(ctx.admin, ticketId, ctx.companyId);
	if ("error" in ownership) {
		return jsonResponse({ error: ownership.error }, ownership.status);
	}

	const { data, error } = await ctx.admin
		.from("saas_ticket_messages")
		.select(MESSAGE_SELECT)
		.eq("ticket_id", ticketId)
		.eq("is_internal", false)
		.order("created_at", { ascending: true });

	if (error) return dbError("list-messages", error, 400);

	return jsonResponse({ messages: (data ?? []) as MessageRow[] });
}

async function handleSendMessage(
	ticketId: string,
	body: Record<string, unknown>,
	ctx: TenantContext,
): Promise<Response> {
	const ownership = await verifyTicketOwnership(ctx.admin, ticketId, ctx.companyId);
	if ("error" in ownership) {
		return jsonResponse({ error: ownership.error }, ownership.status);
	}

	const message = String(body.message ?? "").trim();
	if (!message) {
		return jsonResponse({ error: "El mensaje es obligatorio" }, 400);
	}

	const nowIso = new Date().toISOString();

	const { error: insertError } = await ctx.admin
		.from("saas_ticket_messages")
		.insert({
			ticket_id: ticketId,
			author_type: "tenant",
			author_email: ctx.email,
			is_internal: false,
			message,
		});

	if (insertError) {
		return dbError("send-message", insertError, 400);
	}

	const { error: updateError } = await ctx.admin
		.from("saas_tickets")
		.update({
			status: "open",
			resolved_at: null,
			last_message_at: nowIso,
			updated_at: nowIso,
		})
		.eq("id", ticketId);

	if (updateError) {
		return dbError("send-message-update", updateError, 400);
	}

	return jsonResponse({ success: true });
}

Deno.serve(withCors("POST, OPTIONS", async (req: Request): Promise<Response> => {
	if (req.method !== "POST") {
		return jsonResponse({ error: "Metodo no permitido" }, 405);
	}

	try {
		const ctx = await getTenantContext(req.headers.get("Authorization"));
		if ("error" in ctx) {
			return jsonResponse({ error: ctx.error }, ctx.status);
		}

		let body: Record<string, unknown>;
		try {
			body = (await req.json()) as Record<string, unknown>;
		} catch {
			body = {};
		}

		const action = String(body.action ?? "").trim().toLowerCase();

		if (action === "list-tickets") {
			return await handleListTickets(ctx);
		}

		if (action === "create-ticket") {
			return await handleCreateTicket(body, ctx);
		}

		if (action === "list-messages") {
			const ticketId = String(body.ticketId ?? "").trim();
			if (!ticketId) {
				return jsonResponse({ error: "Falta ticketId" }, 400);
			}
			return await handleListMessages(ticketId, ctx);
		}

		if (action === "send-message") {
			const ticketId = String(body.ticketId ?? "").trim();
			if (!ticketId) {
				return jsonResponse({ error: "Falta ticketId" }, 400);
			}
			return await handleSendMessage(ticketId, body, ctx);
		}

		return jsonResponse({ error: "Accion desconocida" }, 400);
	} catch (err) {
		return dbError("serve", err);
	}
}));
