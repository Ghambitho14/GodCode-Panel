import { describe, expect, it } from 'vitest';
import { createManualOrderState, manualOrderReducer, validateManualOrderState } from '../../src/modules/cash/domain/manual-order-state';
import { normalizeManualOrderSettings } from '../../src/modules/cash/domain/manual-order-settings';

describe('manual order reducer', () => {
	it('permite diferir o cobrar una venta rápida y mantiene mesa diferida', () => {
		let state = createManualOrderState({ mode: 'quick_sale', clientRequestId: 'request-1' });
		expect(state.paymentTiming).toBe('deferred');
		state = manualOrderReducer(state, { type: 'SET_PAYMENT_TIMING', timing: 'immediate' });
		expect(state.paymentTiming).toBe('immediate');
		state = manualOrderReducer(state, { type: 'SET_MODE', mode: 'session' });
		state = manualOrderReducer(state, { type: 'SET_FULFILLMENT', fulfillment: 'table' });
		expect(state.paymentTiming).toBe('deferred');
		state = manualOrderReducer(state, { type: 'SET_PAYMENT_TIMING', timing: 'immediate' });
		expect(state.paymentTiming).toBe('deferred');
	});

	it('blocks delivery without contact, location and quote', () => {
		let state = createManualOrderState({ mode: 'quick_sale', clientRequestId: 'request-2' });
		state = { ...state, fulfillment: 'delivery', items: [{ id: 'p1', quantity: 1 }], customer: { name: 'Ana', phone: '123', document: '' } };
		const validation = validateManualOrderState(state, {
			settings: normalizeManualOrderSettings({ enabled: true }),
			profile: { countryCode: 'CL', document: { label: 'RUT', validate: () => true } },
			deliveryUsesZones: true,
			paymentMethods: [],
		});
		expect(validation.valid).toBe(false);
		expect(validation.errors).toMatchObject({ phone: expect.any(String), address: expect.any(String), zone: expect.any(String), quote: expect.any(String) });
	});
});
