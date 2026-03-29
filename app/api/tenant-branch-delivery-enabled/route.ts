import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "../../../lib/supabase-admin";
import { createSupabaseServerClient } from "../../../utils/supabase/server";

const TENANT_ALLOWED_ROLES = new Set(["admin", "ceo", "cashier", "staff"]);

async function getTenantCompanyContext(): Promise<
	{ companyId: string } | { error: string }
> {
	const supabase = await createSupabaseServerClient("tenant");
	const {
		data: { user },
		error: userError,
	} = await supabase.auth.getUser();

	if (userError || !user?.email) {
		return { error: "No autenticado" };
	}

	const email = user.email.trim().toLowerCase();
	const { data: rows, error } = await supabaseAdmin
		.from("users")
		.select("id,company_id,role")
		.ilike("email", email);

	if (error || !rows?.length) {
		return { error: "Usuario no encontrado en la empresa." };
	}

	const row = rows.find((r) =>
		TENANT_ALLOWED_ROLES.has(String(r.role ?? "").toLowerCase()),
	);
	if (!row?.company_id) {
		return { error: "No tienes permisos de panel tenant" };
	}
	return { companyId: row.company_id };
}

function deliveryEnabledFromRow(raw: unknown): boolean {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		return true;
	}
	const e = (raw as Record<string, unknown>).enabled;
	if (typeof e === "boolean") {
		return e;
	}
	return true;
}

function mergeDeliverySettings(
	prev: unknown,
	enabled: boolean,
): Record<string, unknown> {
	const base =
		prev && typeof prev === "object" && !Array.isArray(prev)
			? { ...(prev as Record<string, unknown>) }
			: {};
	return { ...base, enabled };
}

export async function GET(req: NextRequest) {
	try {
		const ctx = await getTenantCompanyContext();
		if ("error" in ctx) {
			return NextResponse.json({ error: ctx.error }, { status: 403 });
		}

		const branchId = req.nextUrl.searchParams.get("branchId")?.trim();
		if (!branchId) {
			return NextResponse.json({ error: "Falta branchId" }, { status: 400 });
		}

		const { data, error } = await supabaseAdmin
			.from("branches")
			.select("delivery_settings")
			.eq("id", branchId)
			.eq("company_id", ctx.companyId)
			.maybeSingle();

		if (error) {
			return NextResponse.json({ error: error.message }, { status: 400 });
		}
		if (!data) {
			return NextResponse.json({ error: "Sucursal no encontrada" }, { status: 404 });
		}

		const enabled = deliveryEnabledFromRow(data.delivery_settings);
		return NextResponse.json({ enabled });
	} catch (err) {
		const message = err instanceof Error ? err.message : "Error en el servidor";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

export async function PATCH(req: NextRequest) {
	try {
		const ctx = await getTenantCompanyContext();
		if ("error" in ctx) {
			return NextResponse.json({ error: ctx.error }, { status: 403 });
		}

		const body = (await req.json().catch(() => ({}))) as {
			branchId?: unknown;
			enabled?: unknown;
		};

		const branchId = typeof body.branchId === "string" ? body.branchId.trim() : "";
		if (!branchId) {
			return NextResponse.json({ error: "branchId es obligatorio" }, { status: 400 });
		}
		if (typeof body.enabled !== "boolean") {
			return NextResponse.json(
				{ error: "enabled (boolean) es obligatorio" },
				{ status: 400 },
			);
		}

		const { data: row, error: loadError } = await supabaseAdmin
			.from("branches")
			.select("id,delivery_settings")
			.eq("id", branchId)
			.eq("company_id", ctx.companyId)
			.maybeSingle();

		if (loadError) {
			return NextResponse.json({ error: loadError.message }, { status: 400 });
		}
		if (!row) {
			return NextResponse.json({ error: "Sucursal no encontrada" }, { status: 404 });
		}

		const nextSettings = mergeDeliverySettings(row.delivery_settings, body.enabled);

		const { error: upError } = await supabaseAdmin
			.from("branches")
			.update({ delivery_settings: nextSettings })
			.eq("id", branchId)
			.eq("company_id", ctx.companyId);

		if (upError) {
			return NextResponse.json({ error: upError.message }, { status: 400 });
		}

		return NextResponse.json({ enabled: body.enabled });
	} catch (err) {
		const message = err instanceof Error ? err.message : "Error en el servidor";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
