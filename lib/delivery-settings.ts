/**
 * Contrato JSON: `public.branches.delivery_settings` (JSONB por sucursal).
 * Claves en camelCase al guardar desde el panel.
 */

export const DELIVERY_MAX_PRICE_PER_KM = 500_000;
export const DELIVERY_MAX_BASE_FEE = 10_000_000;
export const DELIVERY_MAX_FEE_CAP = 50_000_000;
export const DELIVERY_MAX_KM = 500;

export type DeliverySettingsNormalized = {
	enabled: boolean;
	pricePerKm: number;
	baseFee: number;
	minFee: number | null;
	maxFee: number | null;
	maxDeliveryKm: number | null;
	freeDeliveryFromSubtotal: number | null;
	minOrderSubtotal: number | null;
	customerNotes: string;
};

export type DeliverySettingsPublic = DeliverySettingsNormalized;

const DEFAULTS: DeliverySettingsNormalized = {
	enabled: true,
	pricePerKm: 0,
	baseFee: 0,
	minFee: null,
	maxFee: null,
	maxDeliveryKm: null,
	freeDeliveryFromSubtotal: null,
	minOrderSubtotal: null,
	customerNotes: "",
};

function clampNonNeg(n: number, max: number): number {
	if (!Number.isFinite(n) || n < 0) return 0;
	return Math.min(max, n);
}

function parseOptionalCap(raw: unknown): number | null {
	if (raw === null || raw === undefined || raw === "") return null;
	const n = Number(raw);
	if (!Number.isFinite(n) || n < 0) return null;
	return Math.min(DELIVERY_MAX_FEE_CAP, n);
}

function parseBool(raw: unknown, defaultVal: boolean): boolean {
	if (typeof raw === "boolean") return raw;
	return defaultVal;
}

function parseNotes(raw: unknown): string {
	if (typeof raw !== "string") return "";
	return raw.trim().slice(0, 2000);
}

/** Normaliza lectura desde JSONB (camelCase; tolera algunos snake_case). */
export function normalizeDeliverySettings(raw: unknown): DeliverySettingsNormalized {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		return { ...DEFAULTS };
	}
	const o = raw as Record<string, unknown>;
	const price =
		o.pricePerKm ??
		o.price_per_km ??
		o.priceperkm;
	const base = o.baseFee ?? o.base_fee;
	const minF = o.minFee ?? o.min_fee;
	const maxF = o.maxFee ?? o.max_fee;
	const maxKm = o.maxDeliveryKm ?? o.max_delivery_km;
	const freeFrom = o.freeDeliveryFromSubtotal ?? o.free_delivery_from_subtotal;
	const minOrder = o.minOrderSubtotal ?? o.min_order_subtotal;
	const notes = o.customerNotes ?? o.customer_notes ?? o.notes;

	return {
		enabled: parseBool(o.enabled, DEFAULTS.enabled),
		pricePerKm: clampNonNeg(Number(price) || 0, DELIVERY_MAX_PRICE_PER_KM),
		baseFee: clampNonNeg(Number(base) || 0, DELIVERY_MAX_BASE_FEE),
		minFee: parseOptionalCap(minF),
		maxFee: parseOptionalCap(maxF),
		maxDeliveryKm: (() => {
			const v = maxKm;
			if (v === null || v === undefined || v === "") return null;
			const n = Number(v);
			if (!Number.isFinite(n) || n <= 0) return null;
			return Math.min(DELIVERY_MAX_KM, n);
		})(),
		freeDeliveryFromSubtotal: (() => {
			const v = freeFrom;
			if (v === null || v === undefined || v === "") return null;
			const n = Number(v);
			if (!Number.isFinite(n) || n < 0) return null;
			return Math.min(DELIVERY_MAX_FEE_CAP, n);
		})(),
		minOrderSubtotal: (() => {
			const v = minOrder;
			if (v === null || v === undefined || v === "") return null;
			const n = Number(v);
			if (!Number.isFinite(n) || n < 0) return null;
			return Math.min(DELIVERY_MAX_FEE_CAP, n);
		})(),
		customerNotes: parseNotes(notes),
	};
}

export function deliverySettingsToPublic(
	s: DeliverySettingsNormalized,
): DeliverySettingsPublic {
	return { ...s };
}

/** Merge parcial guardando solo claves conocidas; preserva el resto del JSON previo. */
export function mergeDeliverySettingsJson(
	prev: unknown,
	patch: Partial<Record<string, unknown>>,
): Record<string, unknown> {
	const base =
		prev && typeof prev === "object" && !Array.isArray(prev)
			? { ...(prev as Record<string, unknown>) }
			: {};
	const next = { ...base };

	const assignNum = (
		key: string,
		val: unknown,
		clampMax: number,
		allowNull = false,
	) => {
		if (!(key in patch)) return;
		const v = patch[key];
		if (allowNull && (v === null || v === "")) {
			next[key] = null;
			return;
		}
		const n = Number(v);
		if (!Number.isFinite(n)) return;
		next[key] = Math.min(clampMax, Math.max(0, n));
	};

	if ("enabled" in patch && typeof patch.enabled === "boolean") {
		next.enabled = patch.enabled;
	}
	assignNum("pricePerKm", patch.pricePerKm, DELIVERY_MAX_PRICE_PER_KM);
	assignNum("baseFee", patch.baseFee, DELIVERY_MAX_BASE_FEE);
	if ("minFee" in patch) {
		const v = patch.minFee;
		if (v === null || v === "") next.minFee = null;
		else assignNum("minFee", v, DELIVERY_MAX_FEE_CAP);
	}
	if ("maxFee" in patch) {
		const v = patch.maxFee;
		if (v === null || v === "") next.maxFee = null;
		else assignNum("maxFee", v, DELIVERY_MAX_FEE_CAP);
	}
	if ("maxDeliveryKm" in patch) {
		const v = patch.maxDeliveryKm;
		if (v === null || v === "") next.maxDeliveryKm = null;
		else {
			const n = Number(v);
			if (Number.isFinite(n) && n > 0) {
				next.maxDeliveryKm = Math.min(DELIVERY_MAX_KM, n);
			}
		}
	}
	if ("freeDeliveryFromSubtotal" in patch) {
		const v = patch.freeDeliveryFromSubtotal;
		if (v === null || v === "") next.freeDeliveryFromSubtotal = null;
		else assignNum("freeDeliveryFromSubtotal", v, DELIVERY_MAX_FEE_CAP);
	}
	if ("minOrderSubtotal" in patch) {
		const v = patch.minOrderSubtotal;
		if (v === null || v === "") next.minOrderSubtotal = null;
		else assignNum("minOrderSubtotal", v, DELIVERY_MAX_FEE_CAP);
	}
	if ("customerNotes" in patch && typeof patch.customerNotes === "string") {
		next.customerNotes = parseNotes(patch.customerNotes);
	}

	if (
		typeof next.minFee === "number" &&
		typeof next.maxFee === "number" &&
		next.minFee > next.maxFee
	) {
		const t = next.minFee;
		next.minFee = next.maxFee;
		next.maxFee = t;
	}

	return next;
}

export function computeDeliveryFee(
	settings: DeliverySettingsNormalized,
	deliveryKm: number,
	itemsSubtotal: number,
): { fee: number; waivedFreeShipping: boolean } {
	if (!settings.enabled) {
		return { fee: 0, waivedFreeShipping: false };
	}
	const km = Number(deliveryKm);
	const safeKm = Number.isFinite(km) && km >= 0 ? km : 0;
	if (
		settings.maxDeliveryKm != null &&
		safeKm > settings.maxDeliveryKm + 1e-9
	) {
		return { fee: -1, waivedFreeShipping: false };
	}
	if (
		settings.minOrderSubtotal != null &&
		itemsSubtotal + 1e-9 < settings.minOrderSubtotal
	) {
		return { fee: -2, waivedFreeShipping: false };
	}
	if (
		settings.freeDeliveryFromSubtotal != null &&
		itemsSubtotal + 1e-9 >= settings.freeDeliveryFromSubtotal
	) {
		return { fee: 0, waivedFreeShipping: true };
	}
	let fee = settings.baseFee + safeKm * settings.pricePerKm;
	if (settings.minFee != null) fee = Math.max(fee, settings.minFee);
	if (settings.maxFee != null) fee = Math.min(fee, settings.maxFee);
	if (!Number.isFinite(fee) || fee < 0) fee = 0;
	return { fee: Math.round(fee * 100) / 100, waivedFreeShipping: false };
}

/** Suma ítems del pedido (precio efectivo × cantidad). */
export function orderItemsSubtotalFromPayload(
	items: Array<{ price?: unknown; quantity?: unknown }>,
): number {
	if (!Array.isArray(items)) return 0;
	let sum = 0;
	for (const it of items) {
		const p = Number(it.price) || 0;
		const q = Math.max(1, Number(it.quantity) || 1);
		sum += p * q;
	}
	return Math.round(sum * 100) / 100;
}
