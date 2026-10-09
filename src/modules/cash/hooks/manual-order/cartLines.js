import { getItemChangesTotal, sanitizeManualOrderInput } from './manualOrderShared';

/**
 * Líneas del carrito de la caja (venta rápida, abrir mesa y edición).
 *
 * Un producto con tamaños (`product.sizes`, filas activas de `product_sizes` de la
 * sucursal) entra una línea por tamaño: el id de línea lleva el tamaño y `product_id`
 * sigue siendo el producto, que es lo que validan las RPC. El nombre va como lo
 * compone la base, «Producto (Tamaño)», y se cobra el precio del tamaño, sin oferta
 * (igual que en el modal de producto).
 */

const LINE_SIZE_SEPARATOR = '::size:';
const LINE_VARIANTS_SEPARATOR = '::variants:';
const LINE_COPY_SEPARATOR = '::copy:';
const LINE_SEPARATORS = [LINE_SIZE_SEPARATOR, LINE_VARIANTS_SEPARATOR, LINE_COPY_SEPARATOR];

/**
 * Aviso cuando el pedido no puede llevar tamaños: la cotización V2 de la caja
 * (`quote_manual_order_v2` / `create_manual_order_v2`) no tiene verificado `size_id`.
 */
export const SIZES_NOT_SUPPORTED_MESSAGE = 'Este producto tiene tamaños: cóbralo desde el menú online por ahora.';

export const normalizeLineId = (id) => (id == null ? '' : String(id));

/** Tamaños válidos del producto en el orden del menú (`sort_order`). */
export function productSizes(product) {
	const rows = Array.isArray(product?.sizes) ? product.sizes : [];
	return rows
		.filter((row) => row && row.id != null && String(row.name ?? '').trim() && Number(row.price) > 0)
		.map((row, index) => ({
			id: String(row.id),
			name: String(row.name).trim(),
			price: Number(row.price),
			sort_order: row.sort_order != null && Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : index,
		}))
		.sort((a, b) => a.sort_order - b.sort_order);
}

export function productHasSizes(product) {
	return productSizes(product).length > 0;
}

/** Precio «Desde» de la tarjeta: el tamaño más barato; sin tamaños, `null`. */
export function minProductSizePrice(product) {
	const sizes = productSizes(product);
	if (sizes.length === 0) return null;
	return Math.min(...sizes.map((size) => size.price));
}

function normalizeVariantIds(variantIds) {
	if (!Array.isArray(variantIds)) return [];
	return variantIds.map(normalizeLineId).filter(Boolean).sort();
}

/** Id de línea: el producto, más el tamaño y las variantes cuando los lleva. */
export function buildCartLineId(productId, sizeId = null, variantIds = null) {
	let id = normalizeLineId(productId);
	if (sizeId != null && sizeId !== '') id += `${LINE_SIZE_SEPARATOR}${normalizeLineId(sizeId)}`;
	const variants = normalizeVariantIds(variantIds);
	if (variants.length > 0) id += `${LINE_VARIANTS_SEPARATOR}${variants.join(',')}`;
	return id;
}

/** Id del producto de una línea, con o sin tamaño: lo que viaja a la RPC como `id`. */
export function getLineProductId(item) {
	if (item?.product_id != null && item.product_id !== '') return normalizeLineId(item.product_id);
	const raw = normalizeLineId(item?.id);
	const cuts = LINE_SEPARATORS.map((separator) => raw.indexOf(separator)).filter((index) => index !== -1);
	return cuts.length === 0 ? raw : raw.slice(0, Math.min(...cuts));
}

export function composeSizedLineName(productName, sizeName) {
	const base = String(productName ?? '').trim();
	const size = String(sizeName ?? '').trim();
	return size ? `${base} (${size})` : base;
}

/**
 * Campos de la línea que dependen del tamaño elegido (`size` = `{ id, name, price }`
 * o `null`). El resto (foto, nota, cantidad) lo pone cada carrito.
 */
export function buildCartLineFields(product, size = null) {
	const productId = normalizeLineId(product?.id);
	if (!size || size.id == null || size.id === '') {
		return {
			id: productId,
			product_id: productId,
			name: product?.name,
			price: product?.price,
			has_discount: product?.has_discount,
			discount_price: product?.discount_price,
		};
	}
	return {
		id: buildCartLineId(productId, size.id),
		product_id: productId,
		size_id: normalizeLineId(size.id),
		size_name: String(size.name ?? '').trim(),
		name: composeSizedLineName(product?.name, size.name),
		price: Number(size.price) || 0,
		has_discount: false,
		discount_price: null,
	};
}

/**
 * Ids de línea para los ítems de un pedido ya guardado (edición). El mismo producto
 * con otro tamaño o con otras variantes es otra línea; si dos quedan iguales (p. ej.
 * con notas distintas) la segunda lleva un sufijo para que no se pisen.
 */
export function buildOrderItemLineIds(items) {
	const used = new Set();
	return (Array.isArray(items) ? items : []).map((item) => {
		const base = buildCartLineId(item?.product_id ?? item?.id, item?.size_id, item?.variant_ids);
		let id = base;
		for (let copy = 2; used.has(id); copy += 1) id = `${base}${LINE_COPY_SEPARATOR}${copy}`;
		used.add(id);
		return id;
	});
}

/** Unidades de un producto en el carrito sumando todos sus tamaños (badge de la tarjeta). */
export function countProductInCart(items, productId) {
	const key = normalizeLineId(productId);
	if (!key) return 0;
	return (items || []).reduce(
		(sum, item) => (getLineProductId(item) === key ? sum + (Number(item?.quantity) || 0) : sum),
		0,
	);
}

export function cartHasSizedLines(items) {
	return (items || []).some((item) => Boolean(item?.size_id));
}

/** Líneas con tamaño o variantes: su precio solo lo sabe validar la base, no la cotización V2. */
export function hasSizeOrVariantLines(items) {
	return (items || []).some((item) => Boolean(item?.size_id)
		|| (Array.isArray(item?.variant_ids) && item.variant_ids.length > 0));
}

/** Ítems del carrito a `p_items` de las RPC: `id` es el producto y `size_id` va solo con tamaño. */
export function buildOrderItemsPayload(items) {
	return (items || []).map((item) => ({
		id: getLineProductId(item),
		name: String(item.name ?? ''),
		quantity: Math.max(1, Number(item.quantity) || 1),
		price: Number(item.price) || 0,
		has_discount: Boolean(item.has_discount),
		discount_price: item.has_discount && item.discount_price != null ? Number(item.discount_price) : null,
		description: item.description ? String(item.description) : null,
		note: item.note ? sanitizeManualOrderInput(String(item.note)).slice(0, 140) : null,
		manual_order_source: item.manual_order_source || null,
		is_extra: Boolean(item.is_extra),
		...(item.size_id ? { size_id: normalizeLineId(item.size_id) } : {}),
		...(Array.isArray(item.extras) && item.extras.length > 0
			? { extras: item.extras, extras_total: getItemChangesTotal(item) }
			: {}),
	}));
}
