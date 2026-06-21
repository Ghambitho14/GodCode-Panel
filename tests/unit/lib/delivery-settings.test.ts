import { describe, expect, it } from "vitest";
import {
	computeDeliveryFee,
	isOrderPaymentAllowedForDelivery,
	mergeDeliverySettingsJson,
	normalizeDeliverySettings,
	orderItemsSubtotalFromPayload,
	parseInventoryEnforceOnSale,
	parseLocalOrderChannels,
	parseOrdersViewMode,
	firstEnabledLocalChannel,
} from "@/lib/delivery-settings";
import { makeDeliverySettings } from "../../setup/fixtures/delivery-settings";

describe("delivery-settings", () => {
	it("normalizeDeliverySettings returns defaults for invalid input", () => {
		const s = normalizeDeliverySettings(null);
		expect(s.enabled).toBeDefined();
		expect(typeof s.baseFee).toBe("number");
	});

	it("parseInventoryEnforceOnSale defaults true", () => {
		expect(parseInventoryEnforceOnSale(null)).toBe(true);
		expect(parseInventoryEnforceOnSale({ inventoryEnforceOnSale: false })).toBe(
			false,
		);
	});

	it("parseOrdersViewMode defaults mesas and maps legacy kanban to pedido", () => {
		expect(parseOrdersViewMode(null)).toBe("mesas");
		expect(parseOrdersViewMode("invalid")).toBe("mesas");
		expect(parseOrdersViewMode("mesas")).toBe("mesas");
		expect(parseOrdersViewMode("pedido")).toBe("pedido");
		expect(parseOrdersViewMode("kanban")).toBe("pedido");
		expect(parseOrdersViewMode({ ordersViewMode: "pedido" })).toBe("pedido");
		expect(parseOrdersViewMode({ orders_view_mode: "kanban" })).toBe("pedido");
	});

	it("mergeDeliverySettingsJson persists ordersViewMode", () => {
		const merged = mergeDeliverySettingsJson({}, { ordersViewMode: "pedido" });
		expect(merged.ordersViewMode).toBe("pedido");
		expect(merged).not.toHaveProperty("orders_view_mode");
	});

	it("parseLocalOrderChannels defaults all enabled", () => {
		expect(parseLocalOrderChannels(null)).toEqual({
			mesa: true,
			retiro: true,
			delivery: true,
		});
		expect(parseLocalOrderChannels({ localOrderChannels: { mesa: false, retiro: true, delivery: false } })).toEqual({
			mesa: false,
			retiro: true,
			delivery: false,
		});
	});

	it("mergeDeliverySettingsJson persists localOrderChannels", () => {
		const merged = mergeDeliverySettingsJson({}, {
			localOrderChannels: { mesa: true, retiro: false, delivery: true },
		});
		expect(merged.localOrderChannels).toEqual({
			mesa: true,
			retiro: false,
			delivery: true,
		});
	});

	it("firstEnabledLocalChannel prefers mesa then retiro then delivery", () => {
		expect(firstEnabledLocalChannel({ mesa: false, retiro: true, delivery: true })).toBe("retiro");
		expect(firstEnabledLocalChannel({ mesa: false, retiro: false, delivery: false })).toBe("mesa");
	});

	it("orderItemsSubtotalFromPayload sums items", () => {
		expect(
			orderItemsSubtotalFromPayload([
				{ price: 1000, quantity: 2 },
				{ price: 500, quantity: 1 },
			]),
		).toBe(2500);
	});

	it("computeDeliveryFee returns 0 when disabled", () => {
		const s = makeDeliverySettings({ enabled: false });
		expect(computeDeliveryFee(s, 5, 10000).fee).toBe(0);
	});

	it("computeDeliveryFee distance mode base + per km", () => {
		const s = makeDeliverySettings({
			baseFee: 1000,
			pricePerKm: 500,
			deliveryPricingStrategy: "distance",
		});
		const { fee } = computeDeliveryFee(s, 2, 50000);
		expect(fee).toBe(2000);
	});

	it("computeDeliveryFee returns -1 when exceeds maxDeliveryKm", () => {
		const s = makeDeliverySettings({ maxDeliveryKm: 5 });
		expect(computeDeliveryFee(s, 10, 50000).fee).toBe(-1);
	});

	it("computeDeliveryFee named area uses flat fee", () => {
		const s = makeDeliverySettings({
			deliveryPricingStrategy: "named_areas",
			namedAreas: [{ id: "z1", label: "Centro", feeFlat: 2500 }],
		});
		const { fee } = computeDeliveryFee(s, 0, 50000, { namedAreaId: "z1" });
		expect(fee).toBe(2500);
	});

	it("computeDeliveryFee returns -3 without namedAreaId in named mode", () => {
		const s = makeDeliverySettings({
			deliveryPricingStrategy: "named_areas",
			namedAreas: [{ id: "z1", label: "Centro", feeFlat: 2500 }],
		});
		expect(computeDeliveryFee(s, 0, 50000).fee).toBe(-3);
	});

	it("isOrderPaymentAllowedForDelivery respects allowed methods", () => {
		const s = makeDeliverySettings({
			allowedPaymentMethodsForDelivery: ["tienda", "tarjeta"],
		});
		expect(
			isOrderPaymentAllowedForDelivery(
				{ payment_type: "tienda" },
				["tienda", "tarjeta"],
				s,
			),
		).toBe(true);
		expect(
			isOrderPaymentAllowedForDelivery(
				{ payment_type: "tarjeta" },
				["tienda", "tarjeta"],
				s,
			),
		).toBe(true);
	});
});
