/**
 * Criterio único para "gasto manual del local": egreso de caja no vinculado a un pedido
 * (devoluciones y otros egresos con pedido llevan `order_id`).
 * @param {Record<string, unknown> | null | undefined} m
 * @returns {boolean}
 */
export function isManualLocalExpense(m) {
	if (!m || m.type !== 'expense') return false;
	const oid = m.order_id ?? m.orderId;
	if (oid == null) return true;
	return String(oid).trim() === '';
}

/**
 * Egreso ligado a pedido (p. ej. devolución registrada en caja).
 * @param {Record<string, unknown> | null | undefined} m
 * @returns {boolean}
 */
export function isOrderLinkedExpense(m) {
	return Boolean(m && m.type === 'expense' && !isManualLocalExpense(m));
}
