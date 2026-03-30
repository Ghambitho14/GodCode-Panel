/** Etiquetas para método de pago específico (coincide con keys del carrito/SaaS). */
export const PAYMENT_METHOD_LABELS = {
	efectivo: 'Efectivo',
	tarjeta: 'Tarjeta',
	pago_movil: 'Pago Móvil',
	zelle: 'Zelle',
	transferencia_bancaria: 'Transferencia',
	stripe: 'Tarjeta (Online)',
	mercadopago: 'MercadoPago',
	paypal: 'PayPal',
	online: 'Transf.',
	tienda: 'En local'
};

/** Métodos que se consideran "pago online" para desglose y filtros. */
const ONLINE_SPECIFIC_METHODS = new Set(['pago_movil', 'zelle', 'transferencia_bancaria', 'stripe', 'mercadopago', 'paypal']);

/**
 * Devuelve la etiqueta a mostrar para el método de pago (usa payment_method_specific si existe).
 * @param {{ payment_type?: string; payment_method_specific?: string | null }} order
 * @returns {string}
 */
export function getPaymentLabel(order) {
	if (!order) return '—';
	const specific = order.payment_method_specific;
	if (specific && PAYMENT_METHOD_LABELS[specific]) return PAYMENT_METHOD_LABELS[specific];
	const type = order.payment_type || '';
	if (type === 'online') return 'Transf.';
	if (type === 'tarjeta') return 'Tarjeta';
	if (type === 'tienda') return 'Efectivo';
	return type || '—';
}

/**
 * Indica si el pedido es pago online (transferencia, Zelle, etc.) para filtros y desglose.
 * @param {{ payment_type?: string; payment_method_specific?: string | null }} order
 * @returns {boolean}
 */
export function isOnlineOrder(order) {
	if (!order) return false;
	if (order.payment_type === 'online' || order.payment_type === 'transferencia') return true;
	return Boolean(order.payment_method_specific && ONLINE_SPECIFIC_METHODS.has(order.payment_method_specific));
}

/**
 * Texto plano para pegar en WhatsApp o compartir el pedido.
 * @param {Record<string, unknown>} order
 * @param {string | null | undefined} branchName
 * @returns {string}
 */
export function buildOrderWhatsAppShareText(order, branchName) {
	if (!order) return '';
	const idPart = order.display_id ?? order.order_number ?? order.id;
	const header = idPart != null && idPart !== '' ? `Pedido ${idPart}` : 'Pedido';
	const lines = [String(header)];
	if (branchName) lines.push(`Local: ${branchName}`);
	lines.push(`Cliente: ${order.client_name || '—'}`);
	if (order.client_phone) lines.push(`Tel: ${order.client_phone}`);
	lines.push(`Pago: ${getPaymentLabel(order)}`);
	const items = order.items;
	if (Array.isArray(items) && items.length > 0) {
		lines.push('Productos:');
		for (const it of items) {
			const qty = it.quantity ?? 1;
			const name = it.name ?? 'Ítem';
			lines.push(`• ${qty}x ${name}`);
		}
	}
	return lines.join('\n');
}

/**
 * Slug de método de pago para CSS y desglose: 'cash' | 'card' | 'transfer'.
 * @param {{ payment_type?: string; payment_method_specific?: string | null }} order
 * @returns {'cash' | 'card' | 'transfer'}
 */
export function getPaymentSlug(order) {
	if (!order) return 'cash';
	if (order.payment_type === 'tarjeta' || order.payment_type === 'card') return 'card';
	if (isOnlineOrder(order)) return 'transfer';
	return 'cash';
}

/**
 * Pedido con envío a domicilio (tabla orders: order_type, delivery_address, delivery_fee).
 * @param {Record<string, unknown> | null | undefined} order
 * @returns {boolean}
 */
export function isOrderDelivery(order) {
	if (!order) return false;
	const t = String(order.order_type ?? '')
		.trim()
		.toLowerCase();
	if (t === 'delivery' || t === 'envio' || t === 'envío' || t === 'despacho') {
		return true;
	}
	const fee = Number(order.delivery_fee);
	if (Number.isFinite(fee) && fee > 0) {
		return true;
	}
	const addr = order.delivery_address;
	if (addr && typeof addr === 'object' && !Array.isArray(addr)) {
		const vals = Object.values(addr).filter(
			(v) => v != null && String(v).trim() !== '',
		);
		if (vals.length > 0) return true;
	}
	return false;
}

/**
 * Texto legible de delivery_address (JSONB).
 * @param {unknown} addr
 * @returns {string[]}
 */
export function deliveryAddressLines(addr) {
	if (!addr || typeof addr !== 'object' || Array.isArray(addr)) return [];
	const o = /** @type {Record<string, unknown>} */ (addr);
	const prefer = [
		'formatted_address',
		'label',
		'address',
		'street',
		'line1',
		'line_1',
		'description',
		'reference',
		'referencia',
		'comuna',
		'commune',
		'city',
		'ciudad',
	];
	const lines = [];
	for (const k of prefer) {
		if (o[k] != null && String(o[k]).trim() !== '') {
			lines.push(`${String(o[k]).trim()}`);
		}
	}
	if (lines.length > 0) return [...new Set(lines)];
	try {
		return [JSON.stringify(o, null, 2)];
	} catch {
		return [];
	}
}

/**
 * Saneamiento de pedidos desde la BD (items JSONB, total, client_*, status, etc.)
 * Usado en Admin y en hooks que parsean órdenes.
 */
export function sanitizeOrder(rawOrder) {
	if (!rawOrder) return null;

	let cleanItems = [];
	if (rawOrder.items) {
		if (Array.isArray(rawOrder.items)) {
			cleanItems = rawOrder.items;
		} else if (typeof rawOrder.items === 'string') {
			try {
				const parsed = JSON.parse(rawOrder.items);
				cleanItems = Array.isArray(parsed) ? parsed : [];
			} catch {
				cleanItems = [];
			}
		}
	}

	return {
		...rawOrder,
		items: cleanItems,
		total: Number(rawOrder.total) || 0,
		delivery_fee: Number(rawOrder.delivery_fee) || 0,
		client_name: rawOrder.client_name || 'Cliente Desconocido',
		client_rut: rawOrder.client_rut || 'Sin RUT',
		client_phone: rawOrder.client_phone || '',
		status: rawOrder.status || 'pending',
		created_at: rawOrder.created_at || new Date().toISOString(),
		payment_type: rawOrder.payment_type || 'unknown',
		payment_method_specific: rawOrder.payment_method_specific ?? null
	};
}
