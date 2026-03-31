import { NextRequest, NextResponse } from "next/server";

import { resolveNamedAreaFromAddress } from "../../../lib/delivery-area-resolve";
import {
	computeDeliveryFee,
	effectiveDeliveryPricingMode,
	externalDeliveryCheckoutHint,
	normalizeDeliverySettings,
} from "../../../lib/delivery-settings";
import { haversineKm, isValidLatLng } from "../../../lib/geo";
import { supabaseAdmin } from "../../../lib/supabase-admin";
import {
	createUberDeliveryQuote,
	isUberDirectConfigured,
} from "../../../lib/uber-direct";

/**
 * Cotización pública de delivery (sin auth).
 * - Estrategia `distance`: coordenadas de entrega vs origen de la sucursal.
 * - Estrategia `named_areas` + manual: `namedAreaId`.
 * - Estrategia `named_areas` + address_matched: texto `address`.
 * - Estrategia `external`: si hay `UBER_*` en servidor y coords pickup+dropoff, cotiza con Uber Direct; si no, texto “Consultar con la tienda” (`showDeliveryFeeAmount: false`).
 */
export async function POST(req: NextRequest) {
	try {
		const body = (await req.json().catch(() => ({}))) as {
			branchId?: unknown;
			lat?: unknown;
			lng?: unknown;
			subtotal?: unknown;
			namedAreaId?: unknown;
			address?: unknown;
		};

		const branchId = typeof body.branchId === "string" ? body.branchId.trim() : "";
		const lat = Number(body.lat);
		const lng = Number(body.lng);
		const subtotal = Number(body.subtotal);
		const namedAreaId =
			typeof body.namedAreaId === "string" ? body.namedAreaId.trim() : "";
		const addressStr =
			typeof body.address === "string" ? body.address.trim() : "";

		if (!branchId) {
			return NextResponse.json({ error: "Falta branchId" }, { status: 400 });
		}
		if (!Number.isFinite(subtotal) || subtotal < 0) {
			return NextResponse.json({ error: "Subtotal inválido" }, { status: 400 });
		}

		const { data: branch, error } = await supabaseAdmin
			.from("branches")
			.select("id, delivery_settings, origin_lat, origin_lng")
			.eq("id", branchId)
			.maybeSingle();

		if (error || !branch) {
			return NextResponse.json({ error: "Sucursal no encontrada" }, { status: 404 });
		}

		const settings = normalizeDeliverySettings(branch.delivery_settings);
		const mode = effectiveDeliveryPricingMode(settings);

		if (mode === "external") {
			const r = computeDeliveryFee(settings, 0, subtotal);
			if (r.fee < 0) {
				return NextResponse.json(
					{
						error:
							r.fee === -2
								? "No se alcanza el pedido mínimo para delivery"
								: "No se pudo cotizar el envío",
						code: r.fee,
					},
					{ status: 400 },
				);
			}

			const olat = Number(branch.origin_lat);
			const olng = Number(branch.origin_lng);
			const canUber =
				isUberDirectConfigured() &&
				isValidLatLng(lat, lng) &&
				isValidLatLng(olat, olng);

			if (canUber) {
				try {
					const dropoffAddress =
						addressStr.length >= 8
							? addressStr
							: `${lat.toFixed(6)},${lng.toFixed(6)}`;
					const pickupAddress = `${olat.toFixed(6)},${olng.toFixed(6)}`;
					const uber = await createUberDeliveryQuote({
						pickupAddress,
						dropoffAddress,
					});
					return NextResponse.json({
						ok: true,
						mode: "external",
						provider: "uber_direct",
						fee: uber.fee,
						currencyCode: uber.currencyCode,
						uberQuoteId: uber.quoteId,
						waivedFreeShipping: r.waivedFreeShipping,
						showDeliveryFeeAmount: true,
						hint: externalDeliveryCheckoutHint(settings),
					});
				} catch (e) {
					const msg = e instanceof Error ? e.message : "Uber Direct no disponible";
					return NextResponse.json(
						{ error: msg, code: "uber_quote_failed" },
						{ status: 502 },
					);
				}
			}

			if (isUberDirectConfigured() && !canUber) {
				return NextResponse.json(
					{
						error:
							"Para cotizar con Uber Direct configura ubicación del local (origen) y la ubicación de entrega (mapa o dirección).",
						code: "uber_needs_coordinates",
					},
					{ status: 400 },
				);
			}

			const displayText = externalDeliveryCheckoutHint(settings);
			return NextResponse.json({
				ok: true,
				mode: "external",
				fee: r.fee,
				waivedFreeShipping: r.waivedFreeShipping,
				showDeliveryFeeAmount: false,
				deliveryDisplayText: displayText,
				hint: displayText,
			});
		}

		if (mode === "named") {
			if (settings.namedAreaResolution === "address_matched") {
				const resolved = await resolveNamedAreaFromAddress(
					settings,
					addressStr,
					subtotal,
				);
				if (!resolved.ok) {
					const status =
						resolved.code === "short_address"
							? 400
							: resolved.code === "ambiguous"
								? 409
								: 404;
					return NextResponse.json(
						{ error: resolved.message, code: resolved.code },
						{ status },
					);
				}
				return NextResponse.json({
					ok: true,
					mode: "named_area",
					namedAreaResolution: "address_matched",
					namedAreaId: resolved.namedAreaId,
					label: resolved.label,
					fee: resolved.fee,
					waivedFreeShipping: resolved.waivedFreeShipping,
				});
			}

			if (!namedAreaId) {
				return NextResponse.json(
					{ error: "Selecciona una zona de entrega", code: -3 },
					{ status: 400 },
				);
			}
			const r = computeDeliveryFee(settings, 0, subtotal, {
				namedAreaId,
			});
			if (r.fee < 0) {
				const msg =
					r.fee === -2
						? "No se alcanza el pedido mínimo para delivery"
						: r.fee === -4
							? "Zona de entrega no válida"
							: "No se pudo cotizar el envío";
				return NextResponse.json({ error: msg, code: r.fee }, { status: 400 });
			}
			return NextResponse.json({
				ok: true,
				mode: "named_area",
				namedAreaResolution: "manual_select",
				namedAreaId,
				fee: r.fee,
				waivedFreeShipping: r.waivedFreeShipping,
			});
		}

		if (!isValidLatLng(lat, lng)) {
			return NextResponse.json({ error: "Coordenadas inválidas" }, { status: 400 });
		}

		const olat = Number(branch.origin_lat);
		const olng = Number(branch.origin_lng);
		if (!isValidLatLng(olat, olng)) {
			return NextResponse.json(
				{
					error:
						"Esta sucursal aún no tiene ubicación del local configurada para cotizar por distancia.",
				},
				{ status: 400 },
			);
		}

		const distanceKm = haversineKm({ lat: olat, lng: olng }, { lat, lng });
		const r = computeDeliveryFee(settings, distanceKm, subtotal);

		if (r.fee < 0) {
			return NextResponse.json(
				{
					error:
						r.fee === -1
							? "Distancia fuera del máximo permitido"
							: "No se alcanza el pedido mínimo para delivery",
					code: r.fee,
				},
				{ status: 400 },
			);
		}

		return NextResponse.json({
			ok: true,
			mode: "distance",
			distanceKm,
			fee: r.fee,
			waivedFreeShipping: r.waivedFreeShipping,
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : "Error en el servidor";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
