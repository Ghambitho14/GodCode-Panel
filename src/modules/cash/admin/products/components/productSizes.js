/** Tamaños de producto (Familiar, Mediana…): helpers del editor del modal de producto. */

export const MAX_PRODUCT_SIZES = 12;

let sizeKeySeq = 0;
/** Fila nueva del editor; `key` es solo para React, `id` es el de product_sizes si existe. */
export function newSizeRow(name = '', price = '') {
  sizeKeySeq += 1;
  return { key: `size-${Date.now().toString(36)}-${sizeKeySeq}`, id: null, name, price: String(price ?? '') };
}

/** Precio más bajo entre las filas con precio válido, o null. */
export function minSizeRowPrice(rows) {
  const prices = rows.map((r) => Number(r.price)).filter((n) => Number.isFinite(n) && n > 0);
  return prices.length ? Math.min(...prices) : null;
}

/** Errores de la lista: nombre vacío o repetido, precio inválido, lista vacía. */
export function validateSizeRows(rows) {
  if (rows.length === 0) return 'Agrega al menos un tamaño o desactiva "Varios tamaños".';
  if (rows.length > MAX_PRODUCT_SIZES) return `Máximo ${MAX_PRODUCT_SIZES} tamaños por producto.`;
  const seen = new Set();
  for (const row of rows) {
    const name = String(row.name ?? '').trim();
    if (!name) return 'Cada tamaño necesita un nombre (Ej: Familiar).';
    if (name.length > 40) return 'El nombre de un tamaño admite hasta 40 caracteres.';
    const key = name.toLowerCase();
    if (seen.has(key)) return `El tamaño "${name}" está repetido.`;
    seen.add(key);
    if (!(Number(row.price) > 0)) return `El tamaño "${name}" necesita un precio mayor que 0.`;
  }
  return null;
}
