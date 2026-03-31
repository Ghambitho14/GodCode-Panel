/**
 * Claves canónicas en `branches.payment_methods` (alineado con delivery / checkout).
 */
export const BRANCH_PAYMENT_METHOD_ORDER = [
	"tienda",
	"tarjeta",
	"transferencia_bancaria",
	"pago_movil",
	"zelle",
	"paypal",
	"stripe",
] as const;

export type BranchPaymentMethodKey = (typeof BRANCH_PAYMENT_METHOD_ORDER)[number];

const ORDER_SET = new Set<string>(BRANCH_PAYMENT_METHOD_ORDER);

export function isBranchPaymentMethodKey(s: string): s is BranchPaymentMethodKey {
	return ORDER_SET.has(s);
}

/** Pasa cualquier clave guardada en BD a la clave canónica, o null si no es un método soportado. */
export function normalizePaymentMethodKeyToCanonical(raw: string): BranchPaymentMethodKey | null {
	const k = String(raw ?? "")
		.trim()
		.toLowerCase();
	if (k === "efectivo" || k === "cash" || k === "tienda") return "tienda";
	if (k === "card" || k === "tarjeta") return "tarjeta";
	if (k === "transferencia" || k === "online" || k === "transferencia_bancaria") {
		return "transferencia_bancaria";
	}
	if (k === "pago_movil" || k === "zelle" || k === "paypal" || k === "stripe") {
		return k;
	}
	return null;
}

export function aliasesForCanonical(canonical: BranchPaymentMethodKey): string[] {
	switch (canonical) {
		case "tienda":
			return ["tienda", "efectivo", "cash"];
		case "tarjeta":
			return ["tarjeta", "card"];
		case "transferencia_bancaria":
			return ["transferencia_bancaria", "transferencia", "online"];
		default:
			return [canonical];
	}
}

export function branchHasCanonicalMethod(
	paymentMethods: string[] | null | undefined,
	canonical: BranchPaymentMethodKey
): boolean {
	const raw = Array.isArray(paymentMethods) ? paymentMethods : [];
	const aliases = new Set(aliasesForCanonical(canonical).map((a) => a.toLowerCase()));
	return raw.some((m) => aliases.has(String(m).trim().toLowerCase()));
}

/** Actualiza el array guardado usando la clave canónica (sin duplicados por alias). */
export function applyPaymentMethodToggle(
	currentMethods: string[],
	canonical: BranchPaymentMethodKey,
	isEnabled: boolean
): string[] {
	const aliases = aliasesForCanonical(canonical);
	const lower = new Set(aliases.map((a) => a.toLowerCase()));
	const filtered = currentMethods.filter((m) => !lower.has(String(m).trim().toLowerCase()));
	if (isEnabled) {
		return [...filtered, canonical];
	}
	return filtered;
}
