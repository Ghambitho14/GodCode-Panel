import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../utils/supabase/server";

import { supabaseAdmin } from "../../../../lib/supabase-admin";

const PAYMENT_METHODS_ALLOWED_ROLES = new Set(["owner", "ceo", "admin"]);

async function getContext(): Promise<
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

	const { data: rowByAuth, error: authRowError } = await supabaseAdmin
		.from("users")
		.select("id,company_id,role")
		.eq("auth_user_id", user.id)
		.maybeSingle();

	if (authRowError) {
		return { error: "No se pudo validar tu usuario de panel." };
	}

	let row = rowByAuth;
	if (!row) {
		const email = user.email.trim().toLowerCase();
		const { data: rows, error } = await supabaseAdmin
			.from("users")
			.select("id,company_id,role")
			.ilike("email", email);

		if (error || !rows?.length) {
			return { error: "Usuario no encontrado en la empresa." };
		}

		row =
			rows.find((r) =>
				PAYMENT_METHODS_ALLOWED_ROLES.has(String(r.role ?? "").toLowerCase())
			) ?? null;
	}

	const hasAllowedRole = PAYMENT_METHODS_ALLOWED_ROLES.has(
		String(row?.role ?? "").toLowerCase()
	);
	if (!row?.company_id || !hasAllowedRole) {
		return { error: "Solo owner, CEO o admin puede configurar métodos de pago." };
	}
	return { companyId: row.company_id };
}

function sanitizeObject(obj: unknown): Record<string, string> | null {
	if (obj === null || obj === undefined) return null;
	if (typeof obj !== "object" || Array.isArray(obj)) return null;
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(obj)) {
		if (typeof k !== "string") continue;
		if (v === null || v === undefined) continue;
		out[k] = String(v).trim();
	}
	return out;
}

function jsonFieldStrings(prev: unknown): Record<string, string> {
	if (!prev || typeof prev !== "object" || Array.isArray(prev)) return {};
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(prev)) {
		if (v === null || v === undefined) continue;
		const s = String(v).trim();
		if (s) out[k] = s;
	}
	return out;
}

function mergeJsonBranchField(
	prev: unknown,
	incoming: Record<string, unknown> | null
): Record<string, string> | null {
	if (incoming === null) return null;
	const inc = sanitizeObject(incoming);
	if (inc === null) return null;
	const base = jsonFieldStrings(prev);
	return { ...base, ...inc };
}

/** Alinea columnas planas de sucursal con el JSON de transferencia (mismo origen que el carrito vía bank_name, etc.). */
function transferenciaToFlatColumns(
	t: Record<string, string> | null
): Record<string, string | null> {
	if (!t) {
		return {
			bank_name: null,
			account_type: null,
			account_number: null,
			account_rut: null,
			account_email: null,
			account_holder: null,
		};
	}
	return {
		bank_name: t.banco ?? null,
		account_type: t.tipo_cuenta ?? null,
		account_number: t.nro_cuenta ?? null,
		account_rut: t.identificacion ?? null,
		account_email: t.email ?? null,
		account_holder: t.titular ?? null,
	};
}

/** PUT: actualizar datos de pago de una sucursal (pago_movil, zelle, transferencia_bancaria) */
export async function PUT(req: NextRequest) {
	try {
		const ctx = await getContext();
		if ("error" in ctx) {
			return NextResponse.json({ error: ctx.error }, { status: 403 });
		}

		const body = (await req.json().catch(() => ({}))) as {
			branch_id?: string;
			pago_movil?: Record<string, unknown> | null;
			zelle?: Record<string, unknown> | null;
			transferencia_bancaria?: Record<string, unknown> | null;
		};

		const branchId = body.branch_id;
		if (!branchId || typeof branchId !== "string") {
			return NextResponse.json(
				{ error: "branch_id es obligatorio" },
				{ status: 400 }
			);
		}

		const { data: existing } = await supabaseAdmin
			.from("branches")
			.select("id,pago_movil,zelle,transferencia_bancaria")
			.eq("id", branchId)
			.eq("company_id", ctx.companyId)
			.maybeSingle();
		if (!existing) {
			return NextResponse.json({ error: "Sucursal no encontrada" }, { status: 404 });
		}

		const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

		if (Object.prototype.hasOwnProperty.call(body, "pago_movil")) {
			updates.pago_movil =
				body.pago_movil === null
					? null
					: mergeJsonBranchField(existing.pago_movil, body.pago_movil ?? null);
		}
		if (Object.prototype.hasOwnProperty.call(body, "zelle")) {
			updates.zelle =
				body.zelle === null ? null : mergeJsonBranchField(existing.zelle, body.zelle ?? null);
		}
		if (Object.prototype.hasOwnProperty.call(body, "transferencia_bancaria")) {
			const merged =
				body.transferencia_bancaria === null
					? null
					: mergeJsonBranchField(
							existing.transferencia_bancaria,
							body.transferencia_bancaria ?? null
						);
			updates.transferencia_bancaria = merged;
			Object.assign(updates, transferenciaToFlatColumns(merged));
		}

		await supabaseAdmin
			.from("branches")
			.update(updates)
			.eq("id", branchId)
			.eq("company_id", ctx.companyId);

		return NextResponse.json({ ok: true });
	} catch (err) {
		console.error("branch-config put:", err);
		return NextResponse.json(
			{ error: err instanceof Error ? err.message : "Error al guardar" },
			{ status: 500 }
		);
	}
}
