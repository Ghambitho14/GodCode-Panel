import { NextRequest, NextResponse } from "next/server";

import { isTenantExternalDeliveryAllowed } from "../../../lib/company-integration-policy";
import {
	extractCartUpsellSettings,
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

function pickTrustedDriverWhatsAppDigits(raw: unknown): string {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "";
	const o = raw as Record<string, unknown>;
	const v = o.trustedDriverWhatsApp ?? o.trusted_driver_whatsapp;
	if (typeof v !== "string") return "";
	return v.replace(/\D/g, "").slice(0, 18);
}

function settingsResponse(
	deliverySettingsRaw: unknown,
	origin?: { lat: number | null; lng: number | null },
) {
	const n = normalizeDeliverySettings(deliverySettingsRaw);
	const trustedWa = pickTrustedDriverWhatsAppDigits(deliverySettingsRaw);
	const cart = extractCartUpsellSettings(deliverySettingsRaw);
	return {
		enabled: n.enabled,
		deliveryPricingStrategy: n.deliveryPricingStrategy,
		externalDeliveryProvider: n.externalDeliveryProvider,
		uberDirectStoreId: n.uberDirectStoreId,
		showExternalDeliveryFeeAmount: n.showExternalDeliveryFeeAmount,
		externalDeliveryDisplayText: n.externalDeliveryDisplayText,
		namedAreaResolution: n.namedAreaResolution,
		pricePerKm: n.pricePerKm,
		baseFee: n.baseFee,
		minFee: n.minFee,
		maxFee: n.maxFee,
		maxDeliveryKm: n.maxDeliveryKm,
		freeDeliveryFromSubtotal: n.freeDeliveryFromSubtotal,
		minOrderSubtotal: n.minOrderSubtotal,
		customerNotes: n.customerNotes,
		zones: n.zones,
		namedAreas: n.namedAreas,
		allowedPaymentMethodsForDelivery: n.allowedPaymentMethodsForDelivery,
		originLat: origin?.lat ?? null,
		originLng: origin?.lng ?? null,
		trustedDriverWhatsApp: trustedWa.length >= 8 ? trustedWa : "",
		beveragesUpsellEnabledByBranch: cart.beveragesUpsellEnabledByBranch,
		extrasEnabledByBranch: cart.extrasEnabledByBranch,
		cartBeveragesCatalog: cart.cartBeveragesCatalog,
		cartGlobalExtrasCatalog: cart.cartGlobalExtrasCatalog,
	};
}

function buildPatchFromBody(body: Record<string, unknown>): Record<string, unknown> {
	const patch: Record<string, unknown> = {};
	const keys = [
		"enabled",
		"deliveryPricingStrategy",
		"externalDeliveryProvider",
		"uberDirectStoreId",
		"showExternalDeliveryFeeAmount",
		"externalDeliveryDisplayText",
		"namedAreaResolution",
		"pricePerKm",
		"baseFee",
		"minFee",
		"maxFee",
		"maxDeliveryKm",
		"freeDeliveryFromSubtotal",
		"minOrderSubtotal",
		"customerNotes",
		"trustedDriverWhatsApp",
		"allowedPaymentMethodsForDelivery",
	] as const;
	for (const k of keys) {
		if (k in body) {
			patch[k] = body[k];
		}
	}
	if ("zones" in body && Array.isArray(body.zones)) {
		patch.zones = body.zones;
	}
	if ("namedAreas" in body && Array.isArray(body.namedAreas)) {
		patch.namedAreas = body.namedAreas;
	}
	if (
		"beveragesUpsellEnabledByBranch" in body &&
		body.beveragesUpsellEnabledByBranch &&
		typeof body.beveragesUpsellEnabledByBranch === "object" &&
		!Array.isArray(body.beveragesUpsellEnabledByBranch)
	) {
		patch.beveragesUpsellEnabledByBranch = body.beveragesUpsellEnabledByBranch as Record<
			string,
			unknown
		>;
	}
	if (
		"extrasEnabledByBranch" in body &&
		body.extrasEnabledByBranch &&
		typeof body.extrasEnabledByBranch === "object" &&
		!Array.isArray(body.extrasEnabledByBranch)
	) {
		patch.extrasEnabledByBranch = body.extrasEnabledByBranch as Record<string, unknown>;
	}
	if ("cartBeveragesCatalog" in body && Array.isArray(body.cartBeveragesCatalog)) {
		patch.cartBeveragesCatalog = body.cartBeveragesCatalog;
	}
	if ("cartGlobalExtrasCatalog" in body && Array.isArray(body.cartGlobalExtrasCatalog)) {
		patch.cartGlobalExtrasCatalog = body.cartGlobalExtrasCatalog;
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

		const [{ data, error }, { data: companyRow }] = await Promise.all([
			supabaseAdmin
				.from("branches")
				.select("delivery_settings, origin_lat, origin_lng")
				.eq("id", branchId)
				.eq("company_id", ctx.companyId)
				.maybeSingle(),
			supabaseAdmin
				.from("companies")
				.select("integration_settings")
				.eq("id", ctx.companyId)
				.maybeSingle(),
		]);

		if (error) {
			return NextResponse.json({ error: error.message }, { status: 400 });
		}
		if (!data) {
			return NextResponse.json({ error: "Sucursal no encontrada" }, { status: 404 });
		}

		const olat = data.origin_lat != null ? Number(data.origin_lat) : null;
		const olng = data.origin_lng != null ? Number(data.origin_lng) : null;
		const allowTenantExternalDelivery = isTenantExternalDeliveryAllowed(
			companyRow?.integration_settings,
		);
		return NextResponse.json({
			...settingsResponse(data.delivery_settings, {
				lat: Number.isFinite(olat) ? olat : null,
				lng: Number.isFinite(olng) ? olng : null,
			}),
			allowTenantExternalDelivery,
		});
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
		const branchGeo: Record<string, unknown> = {};
		if ("originLat" in body) {
			const v = body.originLat;
			if (v === null || v === "") branchGeo.origin_lat = null;
			else {
				const n = Number(v);
				if (Number.isFinite(n)) branchGeo.origin_lat = n;
			}
		}
		if ("originLng" in body) {
			const v = body.originLng;
			if (v === null || v === "") branchGeo.origin_lng = null;
			else {
				const n = Number(v);
				if (Number.isFinite(n)) branchGeo.origin_lng = n;
			}
		}

		if (Object.keys(patch).length === 0 && Object.keys(branchGeo).length === 0) {
			return NextResponse.json(
				{
					error:
						"Nada que actualizar: envía delivery, tarifas, zonas, pagos delivery, WhatsApp repartidor, origen GPS o opciones de carrito (bebidas/extras)",
				},
				{ status: 400 },
			);
		}

		const [{ data: row, error: loadError }, { data: companyRow }] = await Promise.all([
			supabaseAdmin
				.from("branches")
				.select("id,delivery_settings,origin_lat,origin_lng")
				.eq("id", branchId)
				.eq("company_id", ctx.companyId)
				.maybeSingle(),
			supabaseAdmin
				.from("companies")
				.select("integration_settings")
				.eq("id", ctx.companyId)
				.maybeSingle(),
		]);

		if (loadError) {
			return NextResponse.json({ error: loadError.message }, { status: 400 });
		}
		if (!row) {
			return NextResponse.json({ error: "Sucursal no encontrada" }, { status: 404 });
		}

		const allowExt = isTenantExternalDeliveryAllowed(companyRow?.integration_settings);

		let nextSettings: Record<string, unknown>;
		if (Object.keys(patch).length > 0) {
			const merged = mergeDeliverySettingsJson(row.delivery_settings, patch);
			const normalized = normalizeDeliverySettings(merged);
			if (normalized.deliveryPricingStrategy === "external" && !allowExt) {
				return NextResponse.json(
					{
						error:
							"Tu administrador desactivó la opción de envío externo o consultar con tienda en el panel del negocio. Elige otra estrategia de envío o contacta al soporte.",
					},
					{ status: 403 },
				);
			}
			nextSettings = merged;
		} else {
			nextSettings = row.delivery_settings as Record<string, unknown>;
		}

		const updatePayload: Record<string, unknown> = {};
		if (Object.keys(patch).length > 0) {
			updatePayload.delivery_settings = nextSettings;
		}
		Object.assign(updatePayload, branchGeo);

		const { error: upError } = await supabaseAdmin
			.from("branches")
			.update(updatePayload)
			.eq("id", branchId)
			.eq("company_id", ctx.companyId);

		if (upError) {
			return NextResponse.json({ error: upError.message }, { status: 400 });
		}

		const { data: fresh, error: freshErr } = await supabaseAdmin
			.from("branches")
			.select("delivery_settings,origin_lat,origin_lng")
			.eq("id", branchId)
			.eq("company_id", ctx.companyId)
			.maybeSingle();

		if (freshErr || !fresh) {
			return NextResponse.json({
				...settingsResponse(nextSettings),
				allowTenantExternalDelivery: allowExt,
			});
		}
		const flatLat = fresh.origin_lat != null ? Number(fresh.origin_lat) : null;
		const flatLng = fresh.origin_lng != null ? Number(fresh.origin_lng) : null;
		return NextResponse.json({
			...settingsResponse(fresh.delivery_settings, {
				lat: Number.isFinite(flatLat) ? flatLat : null,
				lng: Number.isFinite(flatLng) ? flatLng : null,
			}),
			allowTenantExternalDelivery: allowExt,
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : "Error en el servidor";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
