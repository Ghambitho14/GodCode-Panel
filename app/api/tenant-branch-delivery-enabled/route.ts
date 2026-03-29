import { NextRequest, NextResponse } from "next/server";

import {
	mergeDeliverySettingsJson,
	normalizeDeliverySettings,
} from "../../../lib/delivery-settings";
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

function settingsResponse(deliverySettingsRaw: unknown) {
	const n = normalizeDeliverySettings(deliverySettingsRaw);
	return {
		enabled: n.enabled,
		pricePerKm: n.pricePerKm,
		baseFee: n.baseFee,
		minFee: n.minFee,
		maxFee: n.maxFee,
		maxDeliveryKm: n.maxDeliveryKm,
		freeDeliveryFromSubtotal: n.freeDeliveryFromSubtotal,
		minOrderSubtotal: n.minOrderSubtotal,
		customerNotes: n.customerNotes,
	};
}

function buildPatchFromBody(body: Record<string, unknown>): Record<string, unknown> {
	const patch: Record<string, unknown> = {};
	const keys = [
		"enabled",
		"pricePerKm",
		"baseFee",
		"minFee",
		"maxFee",
		"maxDeliveryKm",
		"freeDeliveryFromSubtotal",
		"minOrderSubtotal",
		"customerNotes",
	] as const;
	for (const k of keys) {
		if (k in body) {
			patch[k] = body[k];
		}
	}
	return patch;
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

		return NextResponse.json(settingsResponse(data.delivery_settings));
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

		const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

		const branchId = typeof body.branchId === "string" ? body.branchId.trim() : "";
		if (!branchId) {
			return NextResponse.json({ error: "branchId es obligatorio" }, { status: 400 });
		}

		const patch = buildPatchFromBody(body);
		if (Object.keys(patch).length === 0) {
			return NextResponse.json(
				{ error: "Nada que actualizar: envía al menos un campo de delivery" },
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

		const nextSettings = mergeDeliverySettingsJson(row.delivery_settings, patch);

		const { error: upError } = await supabaseAdmin
			.from("branches")
			.update({ delivery_settings: nextSettings })
			.eq("id", branchId)
			.eq("company_id", ctx.companyId);

		if (upError) {
			return NextResponse.json({ error: upError.message }, { status: 400 });
		}

		return NextResponse.json(settingsResponse(nextSettings));
	} catch (err) {
		const message = err instanceof Error ? err.message : "Error en el servidor";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
