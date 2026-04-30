/**
 * Conversión de cantidades de receta (consumo por venta) hacia la unidad nativa del insumo
 * (`inventory_items.unit`), que es la misma que usa `inventory_branch.current_stock`.
 *
 * Pedidos: la RPC `create_order_transaction` en Supabase debe descontar usando esas cantidades
 * nativas (típicamente `qty_per_sale × cantidad vendida del producto`). Si el descuento no
 * coincide con las ventas, revisar la definición de la RPC en el SQL Editor del proyecto.
 */

export type RecipeInputUnit = "un" | "kg" | "g" | "lt" | "ml";

function normalizeUnitKey(u: string): string {
	return String(u ?? "un").trim().toLowerCase();
}

/** Opciones de “cantidad en…” compatibles con la unidad nativa del insumo. */
export function getInputUnitOptions(nativeUnit: string): RecipeInputUnit[] {
	const u = normalizeUnitKey(nativeUnit);
	if (u === "un") return ["un"];
	if (u === "kg" || u === "g") return ["kg", "g"];
	if (u === "lt" || u === "ml") return ["lt", "ml"];
	return [u as RecipeInputUnit];
}

/** Etiqueta corta para selects (español). */
export function recipeUnitSelectLabel(unit: string): string {
	const u = normalizeUnitKey(unit);
	const map: Record<string, string> = {
		un: "Unid.",
		kg: "Kilos (kg)",
		g: "Gramos (g)",
		lt: "Litros (L)",
		ml: "Mililitros (ml)",
	};
	return map[u] ?? unit;
}

/**
 * Convierte `amount` expresada en `inputUnit` a la unidad nativa `nativeUnit`.
 * Si las unidades son incompatibles (p. ej. un ↔ kg), devuelve `amount` sin convertir.
 */
export function toNativeQty(amount: number, inputUnit: string, nativeUnit: string): number {
	const a = Number(amount);
	if (!Number.isFinite(a)) return 0;
	const inp = normalizeUnitKey(inputUnit);
	const nat = normalizeUnitKey(nativeUnit);
	if (inp === nat) return a;

	const mass = new Set(["kg", "g"]);
	if (mass.has(inp) && mass.has(nat)) {
		const grams = inp === "kg" ? a * 1000 : a;
		return nat === "kg" ? grams / 1000 : grams;
	}

	const vol = new Set(["lt", "ml"]);
	if (vol.has(inp) && vol.has(nat)) {
		const ml = inp === "lt" ? a * 1000 : a;
		return nat === "lt" ? ml / 1000 : ml;
	}

	return a;
}
