import { NextRequest, NextResponse } from "next/server";

import {
	computeDeliveryFee,
	normalizeDeliverySettings,
	orderItemsSubtotalFromPayload,
} from "../../../lib/delivery-settings";
import { supabaseAdmin } from "../../../lib/supabase-admin";

const MAX_ORDER_AGE_MS = 10 * 60 * 1000;
const TOTAL_EPS = 2;
const FEE_EPS = 0.5;

function parseItems(raw: unknown): Array<{ price?: unknown; quantity?: unknown }> {
	if (!raw) return [];
	if (Array.isArray(raw)) return raw;
	if (typeof raw === "string") {
		try {
			const p = JSON.parse(raw);
			return Array.isArray(p) ? p : [];
		} catch {
			return [];
		}
	}
	return [];
}

function isDeliveryType(orderType: string): boolean {
	const t = orderType.trim().toLowerCase();
	return t === "delivery" || t === "envio" || t === "envío" || t === "despacho";
}

/**
 * Tras crear el pedido vía RPC, persiste metadatos de envío con validación server-side
 * (tarifa coherente con `branches.delivery_settings` y total = ítems + envío).
 */
export async function POST(req: NextRequest) {
	try {
		const body = (await req.json().catch(() => ({}))) as {
			orderId?: unknown;
			orderType?: unknown;
			deliveryKm?: unknown;
			deliveryAddress?: unknown;
			deliveryFee?: unknown;
		};

		const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
		const orderTypeRaw = String(body.orderType ?? "pickup");
		const deliveryKm = Number(body.deliveryKm);
		const deliveryFeeClient = Number(body.deliveryFee);

		if (!orderId) {
			return NextResponse.json({ error: "Falta orderId" }, { status: 400 });
		}

		const { data: order, error: orderErr } = await supabaseAdmin
			.from("orders")
			.select("id, branch_id, total, items, created_at, status")
			.eq("id", orderId)
			.maybeSingle();

		if (orderErr || !order) {
			return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
		}

		const created = order.created_at ? new Date(String(order.created_at)) : null;
		if (
			!created ||
			!Number.isFinite(created.getTime()) ||
			Date.now() - created.getTime() > MAX_ORDER_AGE_MS
		) {
			return NextResponse.json(
				{ error: "Pedido no elegible para actualización de envío" },
				{ status: 400 },
			);
		}

		if (String(order.status) !== "pending") {
			return NextResponse.json({ error: "Solo pedidos pendientes" }, { status: 400 });
		}

		const { data: branch, error: brErr } = await supabaseAdmin
			.from("branches")
			.select("id, delivery_settings")
			.eq("id", order.branch_id)
			.maybeSingle();

		if (brErr || !branch) {
			return NextResponse.json({ error: "Sucursal no encontrada" }, { status: 400 });
		}

		const items = parseItems(order.items);
		const subtotal = orderItemsSubtotalFromPayload(items);
		const settings = normalizeDeliverySettings(branch.delivery_settings);

		let expectedFee = 0;
		if (isDeliveryType(orderTypeRaw)) {
			if (!settings.enabled) {
				return NextResponse.json(
					{ error: "Delivery no habilitado en esta sucursal" },
					{ status: 400 },
				);
			}
			const km = Number.isFinite(deliveryKm) && deliveryKm >= 0 ? deliveryKm : 0;
			const r = computeDeliveryFee(settings, km, subtotal);
			if (r.fee < 0) {
				return NextResponse.json(
					{
						error:
							r.fee === -1
								? "Distancia fuera del máximo permitido"
								: "No se alcanza el pedido mínimo para delivery",
					},
					{ status: 400 },
				);
			}
			expectedFee = r.fee;
		} else {
			expectedFee = 0;
		}

		if (
			!Number.isFinite(deliveryFeeClient) ||
			Math.abs(deliveryFeeClient - expectedFee) > FEE_EPS
		) {
			return NextResponse.json({ error: "Tarifa de envío no válida" }, { status: 400 });
		}

		const expectedTotal = Math.round((subtotal + expectedFee) * 100) / 100;
		const orderTotal = Number(order.total) || 0;
		if (Math.abs(orderTotal - expectedTotal) > TOTAL_EPS) {
			return NextResponse.json(
				{ error: "Total del pedido no coincide con ítems + envío" },
				{ status: 400 },
			);
		}

		const deliveryAddress =
			isDeliveryType(orderTypeRaw) &&
			body.deliveryAddress &&
			typeof body.deliveryAddress === "object" &&
			!Array.isArray(body.deliveryAddress)
				? body.deliveryAddress
				: null;

		const { error: upErr } = await supabaseAdmin
			.from("orders")
			.update({
				order_type: isDeliveryType(orderTypeRaw) ? "delivery" : "pickup",
				delivery_fee: expectedFee,
				delivery_address: deliveryAddress,
			})
			.eq("id", orderId)
			.eq("branch_id", order.branch_id);

		if (upErr) {
			return NextResponse.json({ error: upErr.message }, { status: 400 });
		}

		return NextResponse.json({ ok: true, delivery_fee: expectedFee });
	} catch (err) {
		const message = err instanceof Error ? err.message : "Error en el servidor";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
