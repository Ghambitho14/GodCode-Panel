import { canRole, ROLE_ACTIONS } from './rolePermissions';

/** CEO y admin siempre; otro rol, si el super admin le dio `loyalty_rewards.manage`. */
export function canManageLoyaltyRewards(role, actions) {
	return canRole(role, actions, ROLE_ACTIONS.LOYALTY_REWARDS_MANAGE);
}
