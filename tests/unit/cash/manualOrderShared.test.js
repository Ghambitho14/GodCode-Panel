import { describe, expect, it } from "vitest";
import {
	OPEN_MESA_CAJA_DEFAULTS,
	OPEN_MESA_DEFAULT_CLIENT_NAMES,
	MANUAL_ORDER_INITIAL_FORM_STATE,
	applyLocalFulfillmentMode,
	applyMesaPartyMode,
	deriveLocalFulfillmentFromOrder,
	getLocalFulfillmentMode,
	isOpenMesaMeseroMode,
	isOpenOrderSessionStatus,
	resolveOpenMesaCheckoutPayment,
} from "@/modules/cash/hooks/manual-order/manualOrderShared";

describe("manualOrderShared open mesa helpers", () => {
	it("getLocalFulfillmentMode reads explicit local_fulfillment_mode", () => {
		expect(getLocalFulfillmentMode({ local_fulfillment_mode: "mesa" })).toBe("mesa");
		expect(getLocalFulfillmentMode({ local_fulfillment_mode: "retiro" })).toBe("retiro");
		expect(getLocalFulfillmentMode({ order_type: "delivery" })).toBe("delivery");
	});

	it("deriveLocalFulfillmentFromOrder maps channel salon to mesa", () => {
		expect(deriveLocalFulfillmentFromOrder({ channel: "salon", client_name: "Pedro" })).toBe("mesa");
		expect(deriveLocalFulfillmentFromOrder({ channel: "pickup", client_name: "Retiro" })).toBe("retiro");
		expect(deriveLocalFulfillmentFromOrder({ channel: "delivery" })).toBe("delivery");
	});

	it("applyLocalFulfillmentMode mesa resets mesero with CAJA rut/tel", () => {
		const next = applyLocalFulfillmentMode(
			{ ...MANUAL_ORDER_INITIAL_FORM_STATE, client_name: "Ana", client_rut: "1-2", client_phone: "+56 9 1111 1111" },
			"mesa",
		);
		expect(next.local_fulfillment_mode).toBe("mesa");
		expect(next.mesa_party_mode).toBe("mesero");
		expect(next.client_name).toBe("");
		expect(next.client_rut).toBe(OPEN_MESA_CAJA_DEFAULTS.client_rut);
		expect(next.client_phone).toBe(OPEN_MESA_CAJA_DEFAULTS.client_phone);
		expect(isOpenMesaMeseroMode(next)).toBe(true);
	});

	it("applyLocalFulfillmentMode retiro seeds editable CAJA defaults", () => {
		const next = applyLocalFulfillmentMode(MANUAL_ORDER_INITIAL_FORM_STATE, "retiro");
		expect(next.local_fulfillment_mode).toBe("retiro");
		expect(next.mesa_party_mode).toBe("cliente");
		expect(next.client_name).toBe(OPEN_MESA_DEFAULT_CLIENT_NAMES.retiro);
		expect(next.client_rut).toBe(OPEN_MESA_CAJA_DEFAULTS.client_rut);
		expect(next.client_phone).toBe(OPEN_MESA_CAJA_DEFAULTS.client_phone);
	});

	it("applyMesaPartyMode toggles mesero/cliente without losing fulfillment", () => {
		const mesa = applyLocalFulfillmentMode(MANUAL_ORDER_INITIAL_FORM_STATE, "mesa");
		const cliente = applyMesaPartyMode(mesa, "cliente");
		expect(cliente.local_fulfillment_mode).toBe("mesa");
		expect(cliente.mesa_party_mode).toBe("cliente");
		expect(isOpenMesaMeseroMode(cliente)).toBe(false);

		const meseroAgain = applyMesaPartyMode({ ...cliente, client_name: "Pedro" }, "mesero");
		expect(meseroAgain.mesa_party_mode).toBe("mesero");
		expect(meseroAgain.client_name).toBe("");
		expect(meseroAgain.client_rut).toBe(OPEN_MESA_CAJA_DEFAULTS.client_rut);
	});

	it("isOpenOrderSessionStatus recognizes open session statuses", () => {
		expect(isOpenOrderSessionStatus("pending")).toBe(true);
		expect(isOpenOrderSessionStatus("active")).toBe(true);
		expect(isOpenOrderSessionStatus("completed")).toBe(true);
		expect(isOpenOrderSessionStatus("picked_up")).toBe(false);
		expect(isOpenOrderSessionStatus("cancelled")).toBe(false);
	});

	it("resolveOpenMesaCheckoutPayment defers payment when charge_now is false", () => {
		const deferred = resolveOpenMesaCheckoutPayment(
			{ ...MANUAL_ORDER_INITIAL_FORM_STATE, charge_now: false },
			12000,
		);
		expect(deferred.payment_type).toBe("pendiente");
		expect(deferred.payment_breakdown).toBeNull();
	});

	it("resolveOpenMesaCheckoutPayment builds breakdown when charge_now is true", () => {
		const paid = resolveOpenMesaCheckoutPayment(
			{
				...MANUAL_ORDER_INITIAL_FORM_STATE,
				charge_now: true,
				payment_type: "tienda",
				payment_mode: "mixed",
				cash_amount: 10000,
				card_amount: 5000,
			},
			15000,
		);
		expect(paid.payment_type).toBe("tienda");
		expect(paid.payment_breakdown).toEqual({ cash: 10000, card: 5000, online: 0 });
	});
});
