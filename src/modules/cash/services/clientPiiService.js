import { supabase } from '@/integrations/supabase';
import { isSealedDeliveryAddress, isSealedPiiValue, orderHasSealedContact } from '@/shared/utils/sealedPii';

/**
 * Datos personales de clientes con cuenta del menú, descifrados para el personal.
 *
 * Los guarda cifrados el Portal y solo la Edge Function `client-pii` tiene la llave.
 * Lo revelado se guarda **solo en memoria** mientras dura la pestaña: nunca en
 * sessionStorage, IndexedDB ni en el estado persistido del panel.
 */

const FN_NAME = 'client-pii';
const MAX_ORDERS_PER_CALL = 50;

/** order id + los valores cifrados que tenía: si el pedido cambia, la entrada no sirve. */
const revealedOrders = new Map();

function buildFnError(response, fallbackMessage) {
	const dataMsg =
		response?.data && typeof response.data === 'object' && response.data !== null
			? response.data.error
			: null;
	const ctxMsg = response?.error?.message;
	return new Error(String(dataMsg || ctxMsg || fallbackMessage));
}

function orderCacheKey(order) {
	const address = isSealedDeliveryAddress(order.delivery_address) ? order.delivery_address.sealed : '';
	return `${order.id}|${order.client_phone ?? ''}|${order.client_rut ?? ''}|${address}`;
}

/**
 * Cuentas de la empresa con nombre, teléfono y documento en claro.
 * @returns {Promise<Array<{ id: string, clientId: string|null, fullName: string|null, phone: string|null, document: string|null, documentCountry: string|null, preferredBranchId: string|null, isActive: boolean, lastLoginAt: string|null, createdAt: string|null }>>}
 */
export async function fetchDecryptedAccounts() {
	const response = await supabase.functions.invoke(FN_NAME, {
		method: 'POST',
		body: { action: 'list-accounts' },
	});
	if (response.error) throw buildFnError(response, 'No se pudieron leer las cuentas');
	const accounts = response.data && Array.isArray(response.data.accounts) ? response.data.accounts : [];
	return accounts;
}

/**
 * Direcciones guardadas de una ficha con cuenta del menú, la más usada primero.
 * @param {unknown} clientId
 * @returns {Promise<Array<{ id: string, address: string, reference: string|null, namedAreaId: string|null, deliveryKm: number|null, lastUsedAt: string|null }>>}
 */
export async function fetchClientAddresses(clientId) {
	const id = String(clientId ?? '').trim();
	if (!id) return [];
	const response = await supabase.functions.invoke(FN_NAME, {
		method: 'POST',
		body: { action: 'client-addresses', clientId: id },
	});
	if (response.error) throw buildFnError(response, 'No se pudieron leer las direcciones');
	return response.data && Array.isArray(response.data.addresses) ? response.data.addresses : [];
}

/**
 * Devuelve cada pedido con su teléfono, documento y dirección descifrados. Los que
 * no traen nada cifrado (compradores rápidos) se devuelven tal cual, sin llamar a
 * la función.
 * @template T
 * @param {T[]} orders
 * @returns {Promise<T[]>}
 */
export async function revealOrdersContact(orders) {
	const list = Array.isArray(orders) ? orders : [];
	const pending = list.filter((o) => orderHasSealedContact(o) && !revealedOrders.has(orderCacheKey(o)));

	for (let i = 0; i < pending.length; i += MAX_ORDERS_PER_CALL) {
		const batch = pending.slice(i, i + MAX_ORDERS_PER_CALL);
		const response = await supabase.functions.invoke(FN_NAME, {
			method: 'POST',
			body: { action: 'reveal-orders', orderIds: batch.map((o) => String(o.id)) },
		});
		if (response.error) throw buildFnError(response, 'No se pudieron ver los datos del cliente');
		const byId = new Map(
			(Array.isArray(response.data?.orders) ? response.data.orders : []).map((r) => [String(r.id), r]),
		);
		for (const order of batch) {
			const revealed = byId.get(String(order.id));
			if (revealed) revealedOrders.set(orderCacheKey(order), revealed);
		}
	}

	return list.map((order) => {
		if (!orderHasSealedContact(order)) return order;
		const revealed = revealedOrders.get(orderCacheKey(order));
		if (!revealed) return order;
		return {
			...order,
			client_phone: isSealedPiiValue(order.client_phone) ? revealed.phone ?? null : order.client_phone,
			client_rut: isSealedPiiValue(order.client_rut) ? revealed.rut ?? null : order.client_rut,
			delivery_address: isSealedDeliveryAddress(order.delivery_address)
				? revealed.deliveryAddress ?? order.delivery_address
				: order.delivery_address,
		};
	});
}

/** Un solo pedido: igual que `revealOrdersContact`. */
export async function revealOrderContact(order) {
	if (!orderHasSealedContact(order)) return order;
	const [revealed] = await revealOrdersContact([order]);
	return revealed ?? order;
}

/** Olvida lo revelado (cierre de sesión o cambio de empresa). */
export function clearRevealedClientPii() {
	revealedOrders.clear();
}
