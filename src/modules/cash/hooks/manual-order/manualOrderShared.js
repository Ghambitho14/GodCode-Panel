import { computeDeliveryFee, effectiveDeliveryPricingMode } from '@/lib/delivery-settings';
import { mapAddressToFormFields } from '../../services/clientService';

/** Estado inicial del formulario de pedido manual / edición. */
export const MANUAL_ORDER_INITIAL_FORM_STATE = {
	client_name: 'CAJA',
	client_rut: '1-9',
	client_phone: '+56 9 0000 0000',
	payment_type: 'tienda',
	payment_mode: 'single',
	cash_amount: 0,
	card_amount: 0,
	cash_tendered: '',
	order_type: 'pickup',
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
};

/** Nombres predeterminados al abrir mesa/moto (salón vs delivery). */
export const OPEN_MESA_DEFAULT_CLIENT_NAMES = {
	pickup: 'Salón',
	delivery: 'Delivery',
};

/** Resuelve el nombre de sesión en modo abrir mesa (fallback por tipo de pedido). */
export function resolveOpenMesaClientName(orderType, override = '') {
	const custom = String(override ?? '').trim();
	if (custom) return custom;
	return orderType === 'delivery'
		? OPEN_MESA_DEFAULT_CLIENT_NAMES.delivery
		: OPEN_MESA_DEFAULT_CLIENT_NAMES.pickup;
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

/** Sanitiza texto libre del formulario de pedido manual. */
export function sanitizeManualOrderInput(text) {
	return text ? String(text).replace(/<[^>]*>/g, '').trim() : '';
}
