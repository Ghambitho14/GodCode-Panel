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

/**
 * Precio y oferta del producto cuando tiene tamaños: el precio base es el del más
 * barato (el «Desde» del menú y lo que cobra una caja sin tamaño elegido) y la oferta
 * no aplica. La lista solo viaja si se tocó y se cargó bien: así un fallo de carga
 * nunca borra los tamaños guardados.
 */
export function applySizesToProductPayload(payload, {
  sizesActive,
  sizesEnabled,
  sizesDirty,
  sizesLoading = false,
  sizesLoadError = null,
  sizeRows = [],
}) {
  const next = { ...payload };
  if (sizesActive) {
    next.price = minSizeRowPrice(sizeRows);
    next.has_discount = false;
    next.discount_price = '';
  }
  if (sizesDirty && !sizesLoadError && !sizesLoading) {
    next.sizes = sizesEnabled
      ? sizeRows.map((r) => ({
          ...(r.id ? { id: r.id } : {}),
          name: String(r.name).trim(),
          price: Number(r.price),
        }))
      : [];
  }
  return next;
}

/* Códigos que lanza `admin_set_product_sizes`; el orden importa porque
   `not_allowed` también está dentro de `branch_not_allowed`. */
const SIZES_RPC_MESSAGES = [
  ['duplicate_size_name', 'Hay dos tamaños con el mismo nombre'],
  ['invalid_size_name', 'Un tamaño no tiene nombre'],
  ['invalid_size_price', 'El precio de un tamaño no es válido'],
  ['too_many_sizes', 'Son demasiados tamaños'],
  ['branch_not_allowed', 'No puedes editar tamaños en esta sucursal'],
  ['not_allowed', 'No tienes permiso para editar tamaños'],
];

const SIZES_RPC_MISSING = 'La base todavía no tiene la función de tamaños; avisa al equipo de Gcode';
const SIZES_RPC_FORBIDDEN = 'No tienes permiso para editar tamaños';
const SIZES_RPC_FALLBACK = 'No se pudieron guardar los tamaños';

/**
 * Error de `admin_set_product_sizes` (o de PostgREST) a una frase para el aviso del
 * panel. Nunca devuelve el texto crudo de la base.
 */
export function describeProductSizesSaveError(error) {
  const code = String(error?.code ?? '').toUpperCase();
  const text = [error?.message, error?.details, error?.hint]
    .map((part) => String(part ?? ''))
    .join(' ')
    .toLowerCase();
  // PostgREST no encuentra la función (PGRST202) o Postgres no la conoce (42883).
  if (
    code === 'PGRST202'
    || code === '42883'
    || (text.includes('admin_set_product_sizes') && (text.includes('could not find') || text.includes('does not exist')))
  ) {
    return SIZES_RPC_MISSING;
  }
  const hit = SIZES_RPC_MESSAGES.find(([key]) => text.includes(key));
  if (hit) return hit[1];
  // 42501 sin código propio: falta el permiso de ejecutar la función.
  if (code === '42501') return SIZES_RPC_FORBIDDEN;
  return SIZES_RPC_FALLBACK;
}

/** Trozo del aviso al guardar el producto: «los tamaños no se guardaron: hay dos…». */
export function productSizesSaveWarning(error) {
  const reason = describeProductSizesSaveError(error);
  return `los tamaños no se guardaron: ${reason.charAt(0).toLowerCase()}${reason.slice(1)}`;
}
