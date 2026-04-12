import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "../../../lib/supabase-admin";
import { createSupabaseServerClient } from "../../../utils/supabase/server";

const TENANT_ALLOWED_ROLES = new Set(["owner", "admin", "ceo", "cashier", "staff"]);

const DEFAULT_EXPIRES = "2099-12-31T23:59:59.000Z";
const MIN_INTERVAL_MS = 2000;
const MAX_INTERVAL_MS = 60000;
const MIN_MAX_SLIDES = 1;
const MAX_MAX_SLIDES = 20;
const MAX_BANNERS_PER_BRANCH = 20;
const MIN_PROMOTION_DAYS = 1;
const MAX_PROMOTION_DAYS = 90;

type MessageError = { message: string } | null;

type MenuCarouselPublicSettings = {
	intervalMs: number;
	maxSlides: number;
};

type TenantUserRow = {
	id: string;
	company_id: string;
	role: string;
};

const BANNER_SELECT =
	"id,branch_id,company_id,sort_order,is_active,created_at,image_url,expires_at,promotion_duration_enabled,promotion_duration_days";

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

	const { data: rowByAuth, error: authRowError } = await supabaseAdmin
		.from("users")
		.select("id,company_id,role")
		.eq("auth_user_id", user.id)
		.maybeSingle() as { data: TenantUserRow | null; error: MessageError };

	if (authRowError) {
		return { error: "No se pudo validar tu usuario de panel." };
	}

	let row = rowByAuth;
	if (!row) {
		const email = user.email.trim().toLowerCase();
		const { data: rows, error } = await supabaseAdmin
			.from("users")
			.select("id,company_id,role")
			.ilike("email", email) as { data: TenantUserRow[] | null; error: MessageError };

		if (error || !rows?.length) {
			return { error: "Usuario no encontrado en la empresa." };
		}

		row =
			rows.find((r) =>
				TENANT_ALLOWED_ROLES.has(String(r.role ?? "").toLowerCase())
			) ?? null;
	}

	const hasAllowedRole = TENANT_ALLOWED_ROLES.has(
		String(row?.role ?? "").toLowerCase()
	);
	if (!row?.company_id || !hasAllowedRole) {
		return { error: "No tienes permisos de panel tenant" };
	}
	return { companyId: row.company_id };
}

async function assertBranchInCompany(branchId: string, companyId: string) {
	const { data, error } = await supabaseAdmin
		.from("branches")
		.select("id")
		.eq("id", branchId)
		.eq("company_id", companyId)
		.maybeSingle();

	if (error) return { error: error.message };
	if (!data) return { error: "Sucursal no encontrada" };
	return { ok: true as const };
}

function clampMenuCarouselSettings(raw: {
	intervalMs?: unknown;
	maxSlides?: unknown;
}) {
	const intervalMs = Number(raw.intervalMs);
	const maxSlides = Number(raw.maxSlides);
	const safeInterval = Number.isFinite(intervalMs)
		? Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, Math.round(intervalMs)))
		: 5000;
	const safeMax = Number.isFinite(maxSlides)
		? Math.min(MAX_MAX_SLIDES, Math.max(MIN_MAX_SLIDES, Math.round(maxSlides)))
		: 10;
	return { intervalMs: safeInterval, maxSlides: safeMax };
}

function normalizeMenuCarouselBlock(mc: unknown): MenuCarouselPublicSettings {
	const o =
		mc && typeof mc === "object" && !Array.isArray(mc)
			? (mc as Record<string, unknown>)
			: {};
	return clampMenuCarouselSettings(o);
}

function clampPromotionDays(raw: unknown): number {
	const n = Number(raw);
	if (!Number.isFinite(n)) return 7;
	return Math.min(MAX_PROMOTION_DAYS, Math.max(MIN_PROMOTION_DAYS, Math.round(n)));
}

function expiresAtFromPromotionDays(days: number): string {
	const end = new Date();
	end.setUTCDate(end.getUTCDate() + days);
	return end.toISOString();
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

		const gate = await assertBranchInCompany(branchId, ctx.companyId);
		if ("error" in gate) {
			return NextResponse.json({ error: gate.error }, { status: 404 });
		}

		const [bannersRes, companyRes] = await Promise.all([
			supabaseAdmin
				.from("hero_banners")
				.select(BANNER_SELECT)
				.eq("branch_id", branchId)
				.eq("company_id", ctx.companyId)
				.order("sort_order", { ascending: true }),
			supabaseAdmin
				.from("companies")
				.select("theme_config")
				.eq("id", ctx.companyId)
				.maybeSingle(),
		]);

		if (bannersRes.error) {
			return NextResponse.json({ error: bannersRes.error.message }, { status: 400 });
		}

		const themeConfig = (companyRes.data?.theme_config ?? {}) as Record<
			string,
			unknown
		>;
		const settings = normalizeMenuCarouselBlock(themeConfig.menuCarousel);

		return NextResponse.json({
			banners: bannersRes.data ?? [],
			settings,
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : "Error en el servidor";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

export async function POST(req: NextRequest) {
	try {
		const ctx = await getTenantCompanyContext();
		if ("error" in ctx) {
			return NextResponse.json({ error: ctx.error }, { status: 403 });
		}

		const body = (await req.json().catch(() => ({}))) as {
			branchId?: string;
			imageUrl?: string;
			promotionDurationEnabled?: boolean;
			promotionDurationDays?: number;
		};
		const branchId = String(body.branchId ?? "").trim();
		const imageUrl = String(body.imageUrl ?? "").trim();

		if (!branchId || !imageUrl) {
			return NextResponse.json(
				{ error: "branchId e imageUrl son obligatorios" },
				{ status: 400 }
			);
		}

		const gate = await assertBranchInCompany(branchId, ctx.companyId);
		if ("error" in gate) {
			return NextResponse.json({ error: gate.error }, { status: 404 });
		}

		const promoOn = body.promotionDurationEnabled === true;
		const promoDays = clampPromotionDays(body.promotionDurationDays);

		const { count, error: countError } = await supabaseAdmin
			.from("hero_banners")
			.select("id", { count: "exact", head: true })
			.eq("branch_id", branchId)
			.eq("company_id", ctx.companyId);

		if (countError) {
			return NextResponse.json({ error: countError.message }, { status: 400 });
		}
		if ((count ?? 0) >= MAX_BANNERS_PER_BRANCH) {
			return NextResponse.json(
				{ error: `Máximo ${MAX_BANNERS_PER_BRANCH} imágenes por sucursal` },
				{ status: 400 }
			);
		}

		const { data: maxRow } = await supabaseAdmin
			.from("hero_banners")
			.select("sort_order")
			.eq("branch_id", branchId)
			.eq("company_id", ctx.companyId)
			.order("sort_order", { ascending: false })
			.limit(1)
			.maybeSingle();

		const nextOrder =
			typeof maxRow?.sort_order === "number" ? maxRow.sort_order + 1 : 0;

		const expiresAt = promoOn ? expiresAtFromPromotionDays(promoDays) : DEFAULT_EXPIRES;

		const { data: inserted, error: insertError } = await supabaseAdmin
			.from("hero_banners")
			.insert({
				branch_id: branchId,
				company_id: ctx.companyId,
				image_url: imageUrl,
				sort_order: nextOrder,
				expires_at: expiresAt,
				is_active: true,
				promotion_duration_enabled: promoOn,
				promotion_duration_days: promoOn ? promoDays : null,
			})
			.select(BANNER_SELECT)
			.maybeSingle();

		if (insertError || !inserted) {
			return NextResponse.json(
				{ error: insertError?.message || "No se pudo crear el banner" },
				{ status: 400 }
			);
		}

		return NextResponse.json({ banner: inserted });
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
			scope?: string;
			branchId?: string;
			orderedIds?: string[];
			bannerId?: string;
			is_active?: boolean;
			intervalMs?: number;
			maxSlides?: number;
			promotion_duration_enabled?: boolean;
			promotion_duration_days?: number;
		};

		const scope = String(body.scope ?? "").trim();

		if (scope === "settings") {
			const { intervalMs, maxSlides } = clampMenuCarouselSettings({
				intervalMs: body.intervalMs,
				maxSlides: body.maxSlides,
			});

			const { data: company, error: loadError } = await supabaseAdmin
				.from("companies")
				.select("theme_config")
				.eq("id", ctx.companyId)
				.maybeSingle();

			if (loadError || !company) {
				return NextResponse.json(
					{ error: loadError?.message || "Empresa no encontrada" },
					{ status: 400 }
				);
			}

			const prev =
				company.theme_config &&
				typeof company.theme_config === "object" &&
				!Array.isArray(company.theme_config)
					? (company.theme_config as Record<string, unknown>)
					: {};

			const prevMc =
				typeof prev.menuCarousel === "object" &&
				prev.menuCarousel !== null &&
				!Array.isArray(prev.menuCarousel)
					? ({ ...(prev.menuCarousel as Record<string, unknown>) } as Record<
							string,
							unknown
						>)
					: {};

			delete prevMc.promotionDurationEnabled;
			delete prevMc.promotionDurationDays;

			const nextTheme = {
				...prev,
				menuCarousel: {
					...prevMc,
					intervalMs,
					maxSlides,
				},
			};

			const { error: upError } = await supabaseAdmin
				.from("companies")
				.update({ theme_config: nextTheme })
				.eq("id", ctx.companyId);

			if (upError) {
				return NextResponse.json({ error: upError.message }, { status: 400 });
			}

			return NextResponse.json({ settings: { intervalMs, maxSlides } });
		}

		if (scope === "reorder") {
			const branchId = String(body.branchId ?? "").trim();
			const orderedIds = Array.isArray(body.orderedIds) ? body.orderedIds : [];

			if (!branchId || orderedIds.length === 0) {
				return NextResponse.json(
					{ error: "branchId y orderedIds son obligatorios" },
					{ status: 400 }
				);
			}

			const gate = await assertBranchInCompany(branchId, ctx.companyId);
			if ("error" in gate) {
				return NextResponse.json({ error: gate.error }, { status: 404 });
			}

			const { data: existing, error: listError } = await supabaseAdmin
				.from("hero_banners")
				.select("id")
				.eq("branch_id", branchId)
				.eq("company_id", ctx.companyId);

			if (listError) {
				return NextResponse.json({ error: listError.message }, { status: 400 });
			}

			const valid = new Set((existing ?? []).map((r) => r.id));
			const filtered = orderedIds.filter((id) => valid.has(id));
			if (filtered.length !== valid.size) {
				return NextResponse.json(
					{ error: "La lista de ids no coincide con los banners de la sucursal" },
					{ status: 400 }
				);
			}

			for (let i = 0; i < filtered.length; i += 1) {
				const id = filtered[i];
				const { error: uErr } = await supabaseAdmin
					.from("hero_banners")
					.update({ sort_order: i })
					.eq("id", id)
					.eq("company_id", ctx.companyId);

				if (uErr) {
					return NextResponse.json({ error: uErr.message }, { status: 400 });
				}
			}

			return NextResponse.json({ ok: true });
		}

		if (scope === "banner") {
			const bannerId = String(body.bannerId ?? "").trim();
			if (!bannerId) {
				return NextResponse.json({ error: "Falta bannerId" }, { status: 400 });
			}

			const { data: current, error: findError } = await supabaseAdmin
				.from("hero_banners")
				.select(
					"id,company_id,promotion_duration_enabled,promotion_duration_days"
				)
				.eq("id", bannerId)
				.maybeSingle();

			if (findError || !current || current.company_id !== ctx.companyId) {
				return NextResponse.json({ error: "Banner no encontrado" }, { status: 404 });
			}

			let promoEnabled = Boolean(current.promotion_duration_enabled);
			let promoDays = clampPromotionDays(current.promotion_duration_days);

			if (typeof body.promotion_duration_enabled === "boolean") {
				promoEnabled = body.promotion_duration_enabled;
			}
			if (
				body.promotion_duration_days !== undefined &&
				body.promotion_duration_days !== null
			) {
				promoDays = clampPromotionDays(body.promotion_duration_days);
			}

			const patch: Record<string, unknown> = {};

			if (typeof body.is_active === "boolean") {
				patch.is_active = body.is_active;
			}

			const promoFieldsSent =
				typeof body.promotion_duration_enabled === "boolean" ||
				(body.promotion_duration_days !== undefined &&
					body.promotion_duration_days !== null);

			if (promoFieldsSent) {
				patch.promotion_duration_enabled = promoEnabled;
				patch.promotion_duration_days = promoEnabled ? promoDays : null;
				patch.expires_at = promoEnabled
					? expiresAtFromPromotionDays(promoDays)
					: DEFAULT_EXPIRES;
			}

			if (Object.keys(patch).length === 0) {
				return NextResponse.json(
					{ error: "Nada que actualizar" },
					{ status: 400 }
				);
			}

			const { data: updated, error: upError } = await supabaseAdmin
				.from("hero_banners")
				.update(patch)
				.eq("id", bannerId)
				.eq("company_id", ctx.companyId)
				.select(BANNER_SELECT)
				.maybeSingle();

			if (upError) {
				return NextResponse.json({ error: upError.message }, { status: 400 });
			}

			return NextResponse.json({ ok: true, banner: updated });
		}

		return NextResponse.json({ error: "scope no válido" }, { status: 400 });
	} catch (err) {
		const message = err instanceof Error ? err.message : "Error en el servidor";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

export async function DELETE(req: NextRequest) {
	try {
		const ctx = await getTenantCompanyContext();
		if ("error" in ctx) {
			return NextResponse.json({ error: ctx.error }, { status: 403 });
		}

		const bannerId = req.nextUrl.searchParams.get("bannerId")?.trim();
		if (!bannerId) {
			return NextResponse.json({ error: "Falta bannerId" }, { status: 400 });
		}

		const { data: row, error: findError } = await supabaseAdmin
			.from("hero_banners")
			.select("id,company_id")
			.eq("id", bannerId)
			.maybeSingle();

		if (findError || !row || row.company_id !== ctx.companyId) {
			return NextResponse.json({ error: "Banner no encontrado" }, { status: 404 });
		}

		const { error: delError } = await supabaseAdmin
			.from("hero_banners")
			.delete()
			.eq("id", bannerId)
			.eq("company_id", ctx.companyId);

		if (delError) {
			return NextResponse.json({ error: delError.message }, { status: 400 });
		}

		return NextResponse.json({ ok: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : "Error en el servidor";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
