import { describe, expect, it } from 'vitest';

import { canRole, ROLE_ACTIONS } from '@/modules/cash/utils/rolePermissions';
import { canManageLoyaltyRewards } from '@/modules/cash/utils/loyaltyRewardPermissions';
import { canOverrideDeliveryFee } from '@/modules/cash/utils/deliveryFeePermissions';

describe('canRole: acciones que el super admin da por rol', () => {
	it('admin y ceo pueden todo, sin mirar la lista', () => {
		for (const role of ['admin', 'CEO']) {
			for (const key of Object.values(ROLE_ACTIONS)) {
				expect(canRole(role, [], key)).toBe(true);
			}
		}
	});

	it('owner ya no existe: no tiene acceso total', () => {
		for (const key of Object.values(ROLE_ACTIONS)) {
			expect(canRole('owner', [], key)).toBe(false);
		}
	});

	it('el cajero solo puede lo que le dieron', () => {
		const actions = [ROLE_ACTIONS.ORDERS_REFUND];
		expect(canRole('cashier', actions, ROLE_ACTIONS.ORDERS_REFUND)).toBe(true);
		expect(canRole('cashier', actions, ROLE_ACTIONS.COUPONS_SEND_EMAIL)).toBe(false);
		expect(canManageLoyaltyRewards('cashier', [ROLE_ACTIONS.LOYALTY_REWARDS_MANAGE])).toBe(true);
		expect(canOverrideDeliveryFee('cashier', [ROLE_ACTIONS.ORDERS_DELIVERY_FEE_OVERRIDE])).toBe(true);
	});

	it('sin permisos leídos el cajero no puede nada, como antes', () => {
		for (const key of Object.values(ROLE_ACTIONS)) {
			expect(canRole('cashier', null, key)).toBe(false);
			expect(canRole('cashier', undefined, key)).toBe(false);
		}
		expect(canManageLoyaltyRewards('cashier')).toBe(false);
		expect(canOverrideDeliveryFee(null)).toBe(false);
	});
});
