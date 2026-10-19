import { getOrderFulfillmentKind } from '@/shared/utils/orderUtils';
import { fetchOrderWithItems } from '@/modules/cash/services/analyticsService';
import { printOrderTicket } from './printOrderTicket';

/** Estado «Cocina» del Kanban: la comanda ya está en la cocina. */
const KITCHEN_STATUS = 'active';

/**
 * ¿Quedó vieja la comanda que ya tiene la cocina? Solo cuando el pedido está en
 * cocina y la edición cambió los productos o el tipo (mesa / retiro / delivery):
 * un pedido que entra como retiro y se pasa a delivery seguía con «RETIRO» impreso.
 * @param {Record<string, unknown> | null | undefined} previousOrder pedido antes de editar
 * @param {Record<string, unknown> | null | undefined} nextOrder pedido ya guardado
 * @param {{ itemsChanged?: boolean }} [opts]
 * @returns {boolean}
 */
export function kitchenTicketNeedsReprint(previousOrder, nextOrder, { itemsChanged = false } = {}) {
	if (!previousOrder || !nextOrder) return false;
	const status = String(nextOrder.status ?? previousOrder.status ?? '').toLowerCase();
	if (status !== KITCHEN_STATUS) return false;
	if (itemsChanged) return true;
	return getOrderFulfillmentKind(previousOrder) !== getOrderFulfillmentKind(nextOrder);
}

/**
 * Después de guardar una edición, saca otra comanda marcada «MODIFICADO» si la
 * que tiene la cocina quedó vieja. Se imprime el pedido releído de la base (con
 * productos, tipo y envío ya guardados), no la respuesta del guardado, que según
 * el camino de edición no trae todo. Un fallo al imprimir no deshace el guardado.
 * @param {{
 *   previousOrder: Record<string, unknown> | null | undefined;
 *   updatedOrder: Record<string, unknown> | null | undefined;
 *   itemsChanged?: boolean;
 *   branch?: { name?: string | null; address?: string | null; company_id?: string | null } | null;
 * }} params
 * @returns {Promise<boolean>} si se mandó a imprimir
 */
export async function reprintKitchenTicketAfterEdit({ previousOrder, updatedOrder, itemsChanged = false, branch = null }) {
	if (!previousOrder?.id) return false;
	const status = String(updatedOrder?.status ?? previousOrder.status ?? '').toLowerCase();
	if (status !== KITCHEN_STATUS) return false;
	try {
		const fresh = await fetchOrderWithItems({
			orderId: previousOrder.id,
			companyId: branch?.company_id ?? previousOrder.company_id ?? null,
		});
		const nextOrder = fresh ?? { ...previousOrder, ...updatedOrder };
		if (!kitchenTicketNeedsReprint(previousOrder, nextOrder, { itemsChanged })) return false;
		printOrderTicket(nextOrder, branch?.name ?? null, null, {
			variant: 'kitchen',
			branchAddress: branch?.address ?? null,
			// Con la sucursal la comanda sale en el diseño que eligió.
			branch: branch ?? null,
			modified: true,
		});
		return true;
	} catch (err) {
		console.warn('[kitchenReprint] reimpresión de cocina falló:', err);
		return false;
	}
}
