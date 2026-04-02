/**
 * Taxonomía compartida: inventario (tipo ítem, bebida) y platos (dish_kind).
 * Coherente con CHECK en migración `inventory_items_item_type_chk`.
 */

export const INVENTORY_ITEM_TYPES = [
	{ id: "kitchen", label: "Cocina / insumo" },
	{ id: "beverage", label: "Bebida (stock)" },
	{ id: "sellable_extra", label: "Extra vendible" },
	{ id: "other", label: "Otro" },
] as const;

export type InventoryItemTypeId = (typeof INVENTORY_ITEM_TYPES)[number]["id"];

export const BEVERAGE_KIND_PRESETS = [
	"Agua",
	"Refresco",
	"Jugo natural",
	"Té y café",
	"Cerveza",
	"Otro",
] as const;

export const DISH_KIND_PRESETS = [
	"Plato principal",
	"Acompañamiento",
	"Entrada",
	"Postre",
	"Bebida (carta)",
	"Otro",
] as const;

export const CART_CATALOG_TAG_MAX = 8;
export const CART_CATALOG_TAG_MAX_LEN = 32;

export function parseInventoryItemType(raw: unknown): InventoryItemTypeId {
	const s = typeof raw === "string" ? raw.trim() : "";
	const allowed = new Set(INVENTORY_ITEM_TYPES.map((t) => t.id));
	if (allowed.has(s as InventoryItemTypeId)) return s as InventoryItemTypeId;
	return "kitchen";
}

export function parseTagList(raw: unknown, max = CART_CATALOG_TAG_MAX): string[] {
	if (!Array.isArray(raw)) return [];
	const out: string[] = [];
	const seen = new Set<string>();
	for (const x of raw) {
		if (out.length >= max) break;
		const t = typeof x === "string" ? x.trim().slice(0, CART_CATALOG_TAG_MAX_LEN) : "";
		if (!t) continue;
		const k = t.toLowerCase();
		if (seen.has(k)) continue;
		seen.add(k);
		out.push(t);
	}
	return out;
}
