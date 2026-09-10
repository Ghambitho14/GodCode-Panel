import { describe, expect, it } from "vitest";

import { computeCouponDiscountAmount } from "@/lib/coupon-discount";
import { COUPON_DISCOUNT_CONTRACT_CASES } from "@/lib/coupon-discount-contract-cases";
import { computeCouponDiscountAmount as computeFromRow } from "@/lib/discount-coupon";

/**
 * Contrato del descuento de cupón.
 *
 * El mismo fichero de casos vive en el Portal y alimenta allí un test idéntico.
 * Mientras los dos pasen, las dos implementaciones coinciden.
 */
describe("computeCouponDiscountAmount — contrato compartido con el Portal", () => {
	for (const testCase of COUPON_DISCOUNT_CONTRACT_CASES) {
		it(testCase.name, () => {
			expect(
				computeCouponDiscountAmount(
					testCase.subtotal,
					testCase.discountType,
					testCase.discountValue,
				),
			).toBe(testCase.expected);
		});
	}

	it("nunca devuelve un descuento negativo", () => {
		for (const testCase of COUPON_DISCOUNT_CONTRACT_CASES) {
			const result = computeCouponDiscountAmount(
				testCase.subtotal,
				testCase.discountType,
				testCase.discountValue,
			);
			expect(result).toBeGreaterThanOrEqual(0);
		}
	});

	it("nunca descuenta más que el subtotal", () => {
		for (const testCase of COUPON_DISCOUNT_CONTRACT_CASES) {
			const subtotal = Number(testCase.subtotal);
			if (!Number.isFinite(subtotal) || subtotal <= 0) continue;
			const result = computeCouponDiscountAmount(
				testCase.subtotal,
				testCase.discountType,
				testCase.discountValue,
			);
			expect(result).toBeLessThanOrEqual(subtotal);
		}
	});
});

/**
 * El envoltorio que recibe la fila completa debe dar exactamente lo mismo que la
 * función canónica. Es el punto por el que el Panel entra al cálculo.
 */
describe("computeCouponDiscountAmount(subtotal, row) — envoltorio de fila", () => {
	for (const testCase of COUPON_DISCOUNT_CONTRACT_CASES) {
		it(`coincide con la canónica: ${testCase.name}`, () => {
			const row = {
				discount_type: testCase.discountType,
				discount_value: testCase.discountValue,
			} as unknown as Parameters<typeof computeFromRow>[1];

			expect(computeFromRow(testCase.subtotal, row)).toBe(testCase.expected);
		});
	}
});
