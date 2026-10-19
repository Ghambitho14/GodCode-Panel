import { canRole, ROLE_ACTIONS } from './rolePermissions';

/** Override manual del costo de envío (A2): admin/ceo, u otro rol con `orders.delivery_fee_override`. */
export function canOverrideDeliveryFee(role, actions) {
	return canRole(role, actions, ROLE_ACTIONS.ORDERS_DELIVERY_FEE_OVERRIDE);
}
