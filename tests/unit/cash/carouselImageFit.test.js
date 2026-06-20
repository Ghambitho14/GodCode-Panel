import { describe, expect, it } from "vitest";
import {
	TARGET_RATIO,
	buildInitialCrop,
} from "@/modules/cash/utils/carouselImageFit";

function cropRatio(crop) {
	return crop.width / crop.height;
}

function isCenteredHorizontally(width, crop) {
	const expectedX = Math.max(0, Math.round((width - crop.width) / 2));
	return crop.x === expectedX;
}

function isCenteredVertically(height, crop) {
	const expectedY = Math.max(0, Math.round((height - crop.height) / 2));
	return crop.y === expectedY;
}

describe("buildInitialCrop", () => {
	it("centra recorte 2.35:1 en imagen panorámica ancha", () => {
		const crop = buildInitialCrop({ width: 3000, height: 1000 });
		expect(cropRatio(crop)).toBeCloseTo(TARGET_RATIO, 1);
		expect(crop.height).toBe(1000);
		expect(crop.width).toBe(Math.round(1000 * TARGET_RATIO));
		expect(isCenteredHorizontally(3000, crop)).toBe(true);
		expect(crop.y).toBe(0);
	});

	it("recorta bandas laterales en imagen cuadrada", () => {
		const crop = buildInitialCrop({ width: 1000, height: 1000 });
		expect(cropRatio(crop)).toBeCloseTo(TARGET_RATIO, 1);
		expect(crop.width).toBe(1000);
		expect(crop.height).toBe(Math.round(1000 / TARGET_RATIO));
		expect(isCenteredVertically(1000, crop)).toBe(true);
		expect(crop.x).toBe(0);
	});

	it("recorta bandas superior e inferior en imagen vertical", () => {
		const crop = buildInitialCrop({ width: 1080, height: 1920 });
		expect(cropRatio(crop)).toBeCloseTo(TARGET_RATIO, 1);
		expect(crop.width).toBe(1080);
		expect(crop.height).toBe(Math.round(1080 / TARGET_RATIO));
		expect(isCenteredVertically(1920, crop)).toBe(true);
		expect(crop.x).toBe(0);
	});
});
