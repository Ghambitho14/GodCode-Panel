/**
 * Datos personales cifrados por el Portal (`enc:v1:…`).
 *
 * Los pedidos y fichas de clientes con cuenta del menú guardan teléfono, documento y
 * dirección cifrados. El panel no tiene la llave: los muestra enmascarados hasta que
 * se revelan con la Edge Function `client-pii` (ver `clientPiiService.js`).
 */

export const SEALED_PII_PREFIX = 'enc:v1:';

/** Lo que se muestra en lugar de un dato cifrado todavía no revelado. */
export const PII_MASK = '•••';

/** @param {unknown} value */
export function isSealedPiiValue(value) {
	return typeof value === 'string' && value.startsWith(SEALED_PII_PREFIX);
}

/** Dirección de un pedido de cuenta: lo personal viaja en `sealed`. */
export function isSealedDeliveryAddress(value) {
	return Boolean(value && typeof value === 'object' && isSealedPiiValue(value.sealed));
}

/** ¿El pedido trae algún dato de contacto cifrado? */
export function orderHasSealedContact(order) {
	if (!order || typeof order !== 'object') return false;
	return (
		isSealedPiiValue(order.client_phone) ||
		isSealedPiiValue(order.client_rut) ||
		isSealedDeliveryAddress(order.delivery_address)
	);
}

/** Valor para mostrar: el dato, o la máscara si sigue cifrado. */
export function maskSealedPii(value) {
	return isSealedPiiValue(value) ? PII_MASK : value;
}
