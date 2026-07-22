import { computeDeliveryFee, effectiveDeliveryPricingMode } from '@/lib/delivery-settings';
import {
	buildPaymentBreakdownForOrder,
	getOrderFulfillmentKind,
	isCajaGenericIdentity,
	isLegacySalonClientName,
} from '@/shared/utils/orderUtils';
import { mapAddressToFormFields } from '../../services/clientService';

/** Defaults CAJA para documento/teléfono en sesiones locales (mesero o valores iniciales). */
export const OPEN_MESA_CAJA_DEFAULTS = {
	client_rut: '',
	client_phone: '',
};

/** Estado inicial del formulario de pedido manual / edición. */
export const MANUAL_ORDER_INITIAL_FORM_STATE = {
	client_name: '',
	client_rut: OPEN_MESA_CAJA_DEFAULTS.client_rut,
	client_phone: OPEN_MESA_CAJA_DEFAULTS.client_phone,
	payment_type: 'tienda',
	payment_mode: 'single',
	cash_amount: 0,
	card_amount: 0,
	cash_tendered: '',
	order_type: 'pickup',
	local_fulfillment_mode: 'mesa',
	mesa_party_mode: 'mesero',
	delivery_address: '',
	delivery_reference: '',
	delivery_km: '',
	delivery_fee: 0,
	delivery_named_area_id: '',
	note: '',
	coupon_code: '',
	selected_client_id: '',
	saved_addresses: [],
	selected_address_id: '',
	charge_now: false,
	payment_lines: [],
};

/** Compatibilidad de símbolos legacy: V2 no persiste identidades genéricas. */
export const OPEN_MESA_DEFAULT_CLIENT_NAMES = {
	mesa: '',
	/** @deprecated use mesa */
	pickup: '',
	retiro: '',
	delivery: '',
};

/** Modos de fulfillment al abrir sesión local en caja. */
export const LOCAL_FULFILLMENT_MODES = ['mesa', 'retiro', 'delivery'];

/** Resuelve el modo local desde el formulario de pedido manual. */
export function getLocalFulfillmentMode(form) {
	const explicit = String(form?.local_fulfillment_mode ?? '').trim().toLowerCase();
	if (LOCAL_FULFILLMENT_MODES.includes(explicit)) return explicit;
	if (String(form?.order_type ?? '').toLowerCase() === 'delivery') return 'delivery';
	return 'retiro';
}

/** Reconstruye mesa | retiro | delivery desde un pedido persistido (`orders.channel`). */
export function deriveLocalFulfillmentFromOrder(order) {
	const kind = getOrderFulfillmentKind(order);
	if (kind === 'moto') return 'delivery';
	if (kind === 'mesa') return 'mesa';
	return 'retiro';
}

/** Infiere mesero | cliente al editar una sesión local de mesa. */
export function deriveMesaPartyModeFromOrder(order) {
	if (deriveLocalFulfillmentFromOrder(order) !== 'mesa') return 'cliente';
	if (String(order?.client_id ?? '').trim()) return 'cliente';
	if (isCajaGenericIdentity(order?.client_rut, order?.client_phone)) return 'mesero';
	const name = String(order?.client_name ?? '').trim();
	if (!name || isLegacySalonClientName(name)) return 'mesero';
	return 'cliente';
}

/** ¿Modo mesero en sesión local de mesa? */
export function isOpenMesaMeseroMode(form) {
	return getLocalFulfillmentMode(form) === 'mesa' && form?.mesa_party_mode === 'mesero';
}

function withCajaContactDefaults(fields = {}) {
	return {
		...fields,
		client_rut: OPEN_MESA_CAJA_DEFAULTS.client_rut,
		client_phone: OPEN_MESA_CAJA_DEFAULTS.client_phone,
	};
}

/** Aplica mesa | retiro | delivery al formulario de abrir sesión local. */
export function applyLocalFulfillmentMode(prev, mode, branchDeliveryCfg = null, subtotal = 0) {
	if (mode === 'delivery') {
		const next = withCajaContactDefaults({
			...prev,
			local_fulfillment_mode: 'delivery',
			mesa_party_mode: 'cliente',
			order_type: 'delivery',
			client_name:
				prev.client_name === OPEN_MESA_DEFAULT_CLIENT_NAMES.mesa ||
				prev.client_name === OPEN_MESA_DEFAULT_CLIENT_NAMES.retiro ||
				!String(prev.client_name ?? '').trim()
					? OPEN_MESA_DEFAULT_CLIENT_NAMES.delivery
					: prev.client_name,
			selected_client_id: '',
		});
		if (
			Array.isArray(prev.saved_addresses) &&
			prev.saved_addresses.length > 0 &&
			!prev.delivery_address &&
			!prev.delivery_reference &&
			!prev.delivery_named_area_id
		) {
			return mergeAddressIntoForm(next, prev.saved_addresses[0], branchDeliveryCfg, subtotal);
		}
		return next;
	}

	const base = {
		...prev,
		order_type: 'pickup',
		delivery_named_area_id: '',
		delivery_fee: 0,
		delivery_address: '',
		delivery_reference: '',
		delivery_km: '',
		selected_address_id: '',
		selected_client_id: '',
	};

	if (mode === 'mesa') {
		return withCajaContactDefaults({
			...base,
			local_fulfillment_mode: 'mesa',
			mesa_party_mode: 'mesero',
			client_name: '',
		});
	}

	const retiroDefault = OPEN_MESA_DEFAULT_CLIENT_NAMES.retiro;
	const prevName = String(prev.client_name ?? '').trim();
	const keepCustomName =
		prevName &&
		prevName !== OPEN_MESA_DEFAULT_CLIENT_NAMES.mesa &&
		prevName !== OPEN_MESA_DEFAULT_CLIENT_NAMES.delivery &&
		prevName !== retiroDefault &&
		prevName !== 'CAJA';
	return withCajaContactDefaults({
		...base,
		local_fulfillment_mode: 'retiro',
		mesa_party_mode: 'cliente',
		client_name: keepCustomName ? prev.client_name : retiroDefault,
	});
}

/** Alterna mesero | cliente dentro de una sesión local de mesa. */
export function applyMesaPartyMode(prev, mode) {
	if (mode === 'mesero') {
		return withCajaContactDefaults({
			...prev,
			local_fulfillment_mode: 'mesa',
			mesa_party_mode: 'mesero',
			order_type: 'pickup',
			client_name: '',
			selected_client_id: '',
			saved_addresses: [],
			selected_address_id: '',
		});
	}
	return withCajaContactDefaults({
		...prev,
		local_fulfillment_mode: 'mesa',
		mesa_party_mode: 'cliente',
		order_type: 'pickup',
		client_name: prev.client_name || '',
		selected_client_id: '',
		saved_addresses: [],
		selected_address_id: '',
	});
}

/** Resuelve el nombre de sesión en modo abrir mesa (fallback por tipo de pedido). */
export function resolveOpenMesaClientName(orderType, override = '', fulfillmentMode = null) {
	const custom = String(override ?? '').trim();
	if (custom) return custom;
	if (fulfillmentMode === 'retiro') return OPEN_MESA_DEFAULT_CLIENT_NAMES.retiro;
	if (fulfillmentMode === 'delivery') return OPEN_MESA_DEFAULT_CLIENT_NAMES.delivery;
	return OPEN_MESA_DEFAULT_CLIENT_NAMES.mesa;
}

/** Mensajes de error al previsualizar cupones (manual order + edición). */
export const COUPON_PREVIEW_ERR_MSG = {
	empty: '',
	invalid_coupon: 'Código no válido o cupón desactivado.',
	coupon_expired: 'Este cupón no está vigente.',
	coupon_min_subtotal: 'El subtotal no alcanza el mínimo del cupón.',
	coupon_wrong_client: 'Este cupón solo aplica con el teléfono del cliente autorizado.',
	coupon_usage_exhausted: 'Este cupón ya no tiene usos disponibles.',
	coupon_usage_exhausted_client: 'Este cupón ya fue usado con este teléfono.',
};

/** Normaliza order_type del pedido al valor del formulario (`pickup` | `delivery`). */
export function normalizeManualOrderType(raw) {
	const t = String(raw ?? 'pickup').trim().toLowerCase();
	if (t === 'delivery' || t === 'envio' || t === 'envío' || t === 'despacho') {
		return 'delivery';
	}
	return 'pickup';
}

/** Precio unitario efectivo de un ítem (descuento incluido). */
export function getEffectiveItemPrice(item) {
	if (item?.has_discount && item?.discount_price != null && Number(item.discount_price) > 0) {
		return Number(item.discount_price);
	}
	return Number(item?.price) || 0;
}

export function resolveDeliveryFeeForAddress(branchDeliveryCfg, subtotal, namedAreaId) {
	if (!branchDeliveryCfg || !namedAreaId) return null;
	const r = computeDeliveryFee(branchDeliveryCfg, 0, Number(subtotal) || 0, {
		namedAreaId,
	});
	return r.fee >= 0 ? Math.round(r.fee * 100) / 100 : null;
}

/**
 * Calcula tarifa de envío según config de sucursal y campos del formulario.
 * @returns {number|null} fee >= 0, null si no aplica o error de pricing (-1..-4)
 */
export function computeDeliveryFeeForForm(branchDeliveryCfg, subtotal, {
	orderType = 'pickup',
	namedAreaId = '',
	deliveryKm = '',
} = {}) {
	if (!branchDeliveryCfg || orderType !== 'delivery') return null;

	const safeSubtotal = Number(subtotal) || 0;
	const pricing = effectiveDeliveryPricingMode(branchDeliveryCfg);
	const zoneId = String(namedAreaId ?? '').trim();

	if (pricing === 'named') {
		if (!zoneId) return null;
		const r = computeDeliveryFee(branchDeliveryCfg, 0, safeSubtotal, { namedAreaId: zoneId });
		return r.fee >= 0 ? Math.round(r.fee * 100) / 100 : null;
	}

	const kmRaw = deliveryKm === '' || deliveryKm == null ? 0 : Number(String(deliveryKm).replace(',', '.'));
	const safeKm = Number.isFinite(kmRaw) && kmRaw >= 0 ? kmRaw : 0;
	const r = computeDeliveryFee(branchDeliveryCfg, safeKm, safeSubtotal);
	return r.fee >= 0 ? Math.round(r.fee * 100) / 100 : null;
}

export function mergeAddressIntoForm(prev, addressRow, branchDeliveryCfg, subtotal) {
	const fields = mapAddressToFormFields(addressRow);
	const addressId = addressRow?.id != null ? String(addressRow.id) : '';
	const feeFromZone = resolveDeliveryFeeForAddress(
		branchDeliveryCfg,
		subtotal,
		fields.delivery_named_area_id,
	);

	return {
		...prev,
		...fields,
		selected_address_id: addressId,
		...(feeFromZone != null ? { delivery_fee: feeFromZone } : {}),
	};
}

/** Estados de sesión local aún abiertos (no entregados ni cancelados). */
export const OPEN_ORDER_SESSION_STATUSES = new Set(['pending', 'active', 'completed']);

export function isOpenOrderSessionStatus(status) {
	return OPEN_ORDER_SESSION_STATUSES.has(String(status ?? '').toLowerCase());
}

/** Pago al abrir sesión local: pendiente o cobro inmediato (charge_now). */
export function resolveOpenMesaCheckoutPayment(form, checkoutTotal) {
	if (!form?.charge_now) {
		return { payment_type: 'pendiente', payment_breakdown: null };
	}
	return {
		payment_type: form.payment_type,
		payment_breakdown: buildPaymentBreakdownForOrder({
			payment_mode: form.payment_mode,
			payment_type: form.payment_type,
			cash_amount: form.cash_amount,
			card_amount: form.card_amount,
			total: checkoutTotal,
		}),
	};
}

/** Sanitiza texto libre del formulario de pedido manual. */
export function sanitizeManualOrderInput(text) {
	return text ? String(text).replace(/<[^>]*>/g, '').trim() : '';
}
