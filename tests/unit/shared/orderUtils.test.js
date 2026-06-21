import { describe, expect, it } from "vitest";
import {
	flattenDeliveryAddress,
	getOrderCouponDiscountMeta,
	getPaymentLabel,
	getPaymentSlug,
	getOrderPaymentBreakdown,
	buildPaymentBreakdownForOrder,
	validateCheckoutPayment,
	computeChangeDue,
	isMixedPaymentBreakdown,
	isMenuOrder,
	isOnlineOrder,
	isPanelManualOrder,
	isOrderDelivery,
	resolveOrderCouponCode,
	sanitizeOrder,
	getOrderTileKind,
	getOrderFulfillmentKind,
	getFulfillmentKindLabel,
	resolveOrderClientRutForDisplay,
	resolveOrderClientPhoneForDisplay,
	resolveOrderClientNameForDisplay,
	isLegacySalonClientName,
	isCajaGenericIdentity,
	isOrderPaymentDeferred,
	isOrderPaymentSettled,
	isLocalOpenSessionOrder,
	countOpenOrderSessions,
	filterOpenOrderSessions,
	ORDER_OPEN_STATUSES,
} from "@/shared/utils/orderUtils";

describe("orderUtils", () => {
	it("isOnlineOrder detects online payment type", () => {
		expect(isOnlineOrder({ payment_type: "online" })).toBe(true);
		expect(isOnlineOrder({ payment_type: "tienda" })).toBe(false);
	});

	it("isMenuOrder and isPanelManualOrder", () => {
		expect(isMenuOrder({ payment_method_specific: "stripe" })).toBe(true);
		expect(isPanelManualOrder({ payment_method_specific: "" })).toBe(true);
	});

	it("getPaymentSlug maps methods", () => {
		expect(getPaymentSlug({ payment_method_specific: "efectivo" })).toBe(
			"cash",
		);
		expect(getPaymentSlug({ payment_method_specific: "tarjeta" })).toBe("card");
		expect(getPaymentSlug({ payment_method_specific: "stripe" })).toBe("card");
		expect(getPaymentSlug({ payment_method_specific: "mercadopago" })).toBe("card");
		expect(getPaymentSlug({ payment_method_specific: "transferencia_bancaria" })).toBe(
			"transfer",
		);
		expect(getPaymentSlug({ payment_type: "online", payment_method_specific: "stripe" })).toBe(
			"card",
		);
		expect(getPaymentSlug({ payment_type: "online" })).toBe("transfer");
	});

	it("isOnlineOrder excludes card processors from menu", () => {
		expect(isOnlineOrder({ payment_method_specific: "stripe" })).toBe(false);
		expect(isOnlineOrder({ payment_method_specific: "transferencia_bancaria" })).toBe(true);
	});

	it("flattenDeliveryAddress from object", () => {
		expect(
			flattenDeliveryAddress({
				address: "Av 1",
				reference: "Depto 2",
				named_area_id: "z1",
			}),
		).toEqual({
			delivery_address: "Av 1",
			delivery_reference: "Depto 2",
			delivery_named_area_id: "z1",
		});
	});

	it("sanitizeOrder parses string items JSON", () => {
		const order = sanitizeOrder({
			items: '[{"name":"Pizza","price":1000,"quantity":1}]',
			total: "5000",
			delivery_address: '{"address":"Calle 1"}',
		});
		expect(order.items).toHaveLength(1);
		expect(order.total).toBe(5000);
		expect(order.delivery_address).toMatchObject({ address: "Calle 1" });
	});

	it("sanitizeOrder returns null for falsy input", () => {
		expect(sanitizeOrder(null)).toBeNull();
	});

	it("sanitizeOrder maps coupon_code from discount_coupons join", () => {
		const order = sanitizeOrder({
			id: 1,
			total: 9000,
			discount_coupon_id: "coupon-uuid",
			discount_total: 1000,
			discount_coupons: { code: "SAVE10" },
			items: [],
		});
		expect(order.coupon_code).toBe("SAVE10");
		expect(order.discount_coupon_id).toBe("coupon-uuid");
		expect(order.discount_total).toBe(1000);
	});

	it("resolveOrderCouponCode prefers join over legacy field", () => {
		expect(
			resolveOrderCouponCode({
				coupon_code: "OLD",
				discount_coupons: { code: "NEW" },
			}),
		).toBe("NEW");
	});

	it("getOrderCouponDiscountMeta returns null without discount", () => {
		expect(getOrderCouponDiscountMeta({ total: 5000, discount_total: 0 })).toBeNull();
	});

	it("getOrderCouponDiscountMeta computes from discount_total", () => {
		const meta = getOrderCouponDiscountMeta({
			total: 9000,
			discount_total: 1000,
		});
		expect(meta).toEqual({
			originalTotal: 10000,
			discountTotal: 1000,
			discountPercent: 10,
		});
	});

	it("getOrderCouponDiscountMeta falls back with discount_coupon_id and subtotal", () => {
		const meta = getOrderCouponDiscountMeta({
			total: 7794,
			discount_total: 0,
			discount_coupon_id: "uuid-1",
			subtotal: 8660,
		});
		expect(meta).toEqual({
			originalTotal: 8660,
			discountTotal: 866,
			discountPercent: 10,
		});
	});

	it("getOrderPaymentBreakdown uses stored mixed breakdown", () => {
		expect(
			getOrderPaymentBreakdown({
				total: 3000,
				payment_type: "tienda",
				payment_breakdown: { cash: 2000, card: 1000, online: 0 },
			}),
		).toEqual({ cash: 2000, card: 1000, online: 0 });
	});

	it("getOrderPaymentBreakdown falls back to payment_type", () => {
		expect(
			getOrderPaymentBreakdown({ total: 3000, payment_type: "tarjeta" }),
		).toEqual({ cash: 0, card: 3000, online: 0 });
	});

	it("getPaymentLabel shows mixed breakdown", () => {
		expect(
			getPaymentLabel({
				payment_breakdown: { cash: 2000, card: 1000, online: 0 },
			}),
		).toBe("Mixto (Ef. $2.000 + Tarjeta $1.000)");
	});

	it("buildPaymentBreakdownForOrder returns null for single method", () => {
		expect(
			buildPaymentBreakdownForOrder({
				payment_mode: "single",
				payment_type: "tienda",
				total: 3000,
			}),
		).toBeNull();
	});

	it("validateCheckoutPayment requires tender for cash", () => {
		expect(
			validateCheckoutPayment({
				payment_mode: "single",
				payment_type: "tienda",
				cash_tendered: 10000,
				totalToPay: 3000,
			}).valid,
		).toBe(true);
		expect(
			validateCheckoutPayment({
				payment_mode: "single",
				payment_type: "tienda",
				cash_tendered: 2000,
				totalToPay: 3000,
			}).valid,
		).toBe(false);
	});

	it("validateCheckoutPayment validates mixed split", () => {
		expect(
			validateCheckoutPayment({
				payment_mode: "mixed",
				cash_amount: 2000,
				card_amount: 1000,
				cash_tendered: 5000,
				totalToPay: 3000,
			}).valid,
		).toBe(true);
		expect(
			validateCheckoutPayment({
				payment_mode: "mixed",
				cash_amount: 1500,
				card_amount: 1000,
				totalToPay: 3000,
			}).valid,
		).toBe(false);
	});

	it("computeChangeDue subtracts cash due", () => {
		expect(computeChangeDue(10000, 3000)).toBe(7000);
	});

	it("isMixedPaymentBreakdown detects multiple methods", () => {
		expect(isMixedPaymentBreakdown({ cash: 2000, card: 1000, online: 0 })).toBe(true);
		expect(isMixedPaymentBreakdown({ cash: 3000, card: 0, online: 0 })).toBe(false);
	});

	it("getOrderTileKind maps delivery to moto, salon to mesa, pickup client to retiro", () => {
		expect(getOrderTileKind({ order_type: "delivery" })).toBe("moto");
		expect(getOrderTileKind({ order_type: "sale", channel: "delivery" })).toBe("moto");
		expect(getOrderTileKind({ order_type: "pickup", client_name: "Salón" })).toBe("mesa");
		expect(getOrderTileKind({ order_type: "pickup", client_name: "Retiro" })).toBe("retiro");
		expect(getOrderTileKind({ channel: "menu", order_type: "pickup", client_name: "Juan" })).toBe("retiro");
	});

	it("isOrderDelivery detects delivery by channel, fee, address and open-mesa defaults", () => {
		expect(isOrderDelivery({ channel: "delivery", order_type: "sale" })).toBe(true);
		expect(
			isOrderDelivery({
				channel: "pickup",
				order_type: "sale",
				delivery_fee: 2500,
			}),
		).toBe(true);
		expect(
			isOrderDelivery({
				channel: "pickup",
				order_type: "sale",
				delivery_address: { address: "Av. Providencia 123" },
			}),
		).toBe(true);
		expect(isOrderDelivery({ channel: "pickup", order_type: "sale", client_name: "Delivery" })).toBe(true);
		expect(isOrderDelivery({ channel: "pickup", order_type: "sale", client_name: "Retiro" })).toBe(false);
		expect(isOrderDelivery({ channel: "salon", order_type: "sale", client_name: "Salón" })).toBe(false);
	});

	it("getOrderFulfillmentKind prioritizes channel salon over custom client name", () => {
		expect(getOrderFulfillmentKind({ channel: "salon", client_name: "Juan" })).toBe("mesa");
		expect(getOrderFulfillmentKind({ channel: "salon", client_name: "Pedro" })).toBe("mesa");
		expect(getOrderFulfillmentKind({ channel: "pickup", client_name: "Juan" })).toBe("retiro");
		expect(getFulfillmentKindLabel(getOrderFulfillmentKind({ channel: "salon" }))).toBe("Mesa");
		expect(getFulfillmentKindLabel(getOrderFulfillmentKind({ order_type: "pickup", client_name: "Retiro" }))).toBe("Retiro");
	});

	it("resolveOrderClientRutForDisplay hides placeholders", () => {
		expect(resolveOrderClientRutForDisplay({ client_rut: "" })).toBeNull();
		expect(resolveOrderClientRutForDisplay({ client_rut: "Sin RUT" })).toBeNull();
		expect(resolveOrderClientRutForDisplay({ client_rut: "SIN-RUT-123456" })).toBeNull();
		expect(resolveOrderClientRutForDisplay({ client_rut: "11.111.111-1" })).toBe("11.111.111-1");
	});

	it("isCajaGenericIdentity detects CAJA defaults", () => {
		expect(isCajaGenericIdentity("1-9", "+56 9 0000 0000")).toBe(true);
		expect(isCajaGenericIdentity("1-9", "+56900000000")).toBe(true);
		expect(isCajaGenericIdentity("11.111.111-1", "+56 9 0000 0000")).toBe(false);
		expect(isCajaGenericIdentity("1-9", "+56911111111")).toBe(false);
	});

	it("resolveOrderClientPhoneForDisplay returns trimmed phone or null", () => {
		expect(resolveOrderClientPhoneForDisplay({ client_phone: "  " })).toBeNull();
		expect(resolveOrderClientPhoneForDisplay({ client_phone: "+56 9 1111 1111" })).toBe("+56 9 1111 1111");
	});

	it("resolveOrderClientNameForDisplay handles legacy Salón mesa orders", () => {
		expect(isLegacySalonClientName("Salón")).toBe(true);
		expect(isLegacySalonClientName("Juan")).toBe(false);
		const legacy = resolveOrderClientNameForDisplay({ client_name: "Salón" }, "mesa");
		expect(legacy.name).toBe("Mesa en salón");
		expect(legacy.isLegacySalon).toBe(true);
		expect(resolveOrderClientNameForDisplay({ client_name: "Pedro" }, "mesa").name).toBe("Pedro");
	});

	it("isLocalOpenSessionOrder excludes online menu and closed statuses", () => {
		expect(isLocalOpenSessionOrder({ status: "pending", channel: "salon" })).toBe(true);
		expect(isLocalOpenSessionOrder({ status: "active", channel: "pickup" })).toBe(true);
		expect(isLocalOpenSessionOrder({ status: "pending", channel: "online" })).toBe(false);
		expect(isLocalOpenSessionOrder({ status: "picked_up", channel: "salon" })).toBe(false);
	});

	it("isOrderPaymentDeferred detects pendiente", () => {
		expect(isOrderPaymentDeferred({ payment_type: "pendiente" })).toBe(true);
		expect(isOrderPaymentDeferred({ payment_type: "tienda" })).toBe(false);
		expect(getPaymentLabel({ payment_type: "pendiente" })).toBe("Pago pendiente");
	});

	it("isOrderPaymentSettled is false for deferred payment", () => {
		expect(isOrderPaymentSettled({ payment_type: "pendiente", total: 5000 })).toBe(false);
	});

	it("countOpenOrderSessions counts only open statuses for branch", () => {
		const orders = [
			{ branch_id: "b1", status: "active" },
			{ branch_id: "b1", status: "completed" },
			{ branch_id: "b1", status: "picked_up" },
			{ branch_id: "b2", status: "pending" },
		];
		expect(countOpenOrderSessions(orders, "b1")).toBe(2);
		expect(countOpenOrderSessions(orders, "all")).toBe(0);
		expect(ORDER_OPEN_STATUSES).toEqual(["pending", "active", "completed"]);
	});

	it("filterOpenOrderSessions sorts by kind then shift_sequence", () => {
		const sorted = filterOpenOrderSessions([
			{ status: "active", shift_sequence: 3, channel: "delivery" },
			{ status: "pending", shift_sequence: 1, channel: "pickup", client_name: "Salón" },
			{ status: "completed", shift_sequence: 2, channel: "pickup", client_name: "Juan" },
			{ status: "picked_up", shift_sequence: 9, channel: "pickup" },
		]);
		expect(sorted.map((o) => o.shift_sequence)).toEqual([1, 2, 3]);
	});
});
