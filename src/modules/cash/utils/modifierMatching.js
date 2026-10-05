/*
 * Cruce entre las opciones del armador "Agregar cambios" y la receta de un producto.
 * Lo usan el armador (sugerir insumos) y el pedido manual (saber qué lleva el producto).
 */

const STOPWORDS = new Set(['o', 'y', 'de', 'del', 'con', 'la', 'el', 'en']);

/** Palabras sin tildes, mayúsculas, paréntesis ni conectores: «Frito (panko)» → [frito, panko]. */
export const ingredientWords = (value) => String(value ?? '')
	.normalize('NFD').replace(/[̀-ͯ]/g, '')
	.toLowerCase().replace(/[^a-z0-9ñ\s]/g, ' ')
	.split(/\s+/).filter((w) => w && !STOPWORDS.has(w));

/** «Pollo» ≈ «Pollo apanado», «Salmon» ≈ «Salmón», «Panko (frito)» ≈ «Frito (panko)». */
export function sameIngredient(a, b) {
	const wa = ingredientWords(a);
	const wb = ingredientWords(b);
	if (!wa.length || !wb.length) return false;
	return wa.every((w) => wb.includes(w)) || wb.every((w) => wa.includes(w));
}

/** «Proteína» = «proteinas», «Salsa» = «Salsas». */
export const partKey = (value) => ingredientWords(value).map((w) => w.replace(/s$/, '')).join(' ');

/**
 * ¿La línea de receta pertenece a la parte que nombra el grupo? En una promo un insumo puede
 * cumplir varios papeles y la parte viene como lista: «Relleno, Plaqueta».
 */
export const lineInPart = (line, groupName) => String(line?.part ?? '')
	.split(',')
	.some((part) => part.trim() && partKey(part) === partKey(groupName));

/**
 * ¿La opción está en estas líneas de receta? Cuenta el nombre parecido y, además, cualquier
 * insumo vinculado a mano: el vínculo suma, no reemplaza («Pollo apanado» vinculado a su insumo
 * sigue reconociendo el «Pollo» de una promo).
 * @param {{ name: string, inventoryItemIds?: string[] }} option
 * @param {{ itemId: string, name: string }[]} lines
 */
export function optionInLines(option, lines) {
	const ids = Array.isArray(option?.inventoryItemIds) ? option.inventoryItemIds.map(String) : [];
	return lines.some((line) => ids.includes(String(line.itemId)) || sameIngredient(option?.name, line.name));
}
