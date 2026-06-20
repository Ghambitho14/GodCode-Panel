import { computeDeliveryFee } from '@/lib/delivery-settings';
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
