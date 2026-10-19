/**
 * Acciones sensibles del panel que se dan por rol desde el super admin (Configuración →
 * Roles, guardadas en `role_definitions.actions`). Mismas claves que la base (`role_can`)
 * y que GodCode `lib/super-admin/role-permissions.ts`: si se agrega una, va en los tres lados.
 */
export const ROLE_ACTIONS = Object.freeze({
	LOYALTY_REWARDS_MANAGE: 'loyalty_rewards.manage',
	ORDERS_REFUND: 'orders.refund',
	ORDERS_DELIVERY_FEE_OVERRIDE: 'orders.delivery_fee_override',
	COUPONS_SEND_EMAIL: 'coupons.send_email',
});

/** Ven y hacen todo siempre; sus permisos no se leen de la tabla. */
const FULL_ACCESS_ROLES = new Set(['admin', 'ceo']);

export function canRole(role, actions, key) {
	const r = String(role ?? '').toLowerCase();
	if (FULL_ACCESS_ROLES.has(r)) return true;
	return Array.isArray(actions) && actions.includes(key);
}
