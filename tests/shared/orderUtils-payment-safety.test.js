import { describe, expect, it } from 'vitest';

import {
	buildPaymentBreakdownForOrder,
	buildSettlementPaymentBreakdown,
	getOrderPaymentBreakdown,
	isOrderPaymentSettled,
	shouldRegisterPaidOrderAtStatus,
	validateCheckoutPayment,
} from '@/shared/utils/orderUtils';
import { MANUAL_ORDER_INITIAL_FORM_STATE } from '@/modules/cash/hooks/manual-order/manualOrderShared';
import { planSaleMovements } from '@/modules/cash/utils/orderPaymentMovements';

describe('seguridad del pago manual', () => {
	it('no selecciona efectivo implícitamente al iniciar una venta rápida', () => {
		expect(MANUAL_ORDER_INITIAL_FORM_STATE.payment_type).toBe('');
	});

	it('exige un método válido en pagos de un solo medio', () => {
		expect(validateCheckoutPayment({
			payment_mode: 'single',
			payment_type: '',
			totalToPay: 10_000,
		})).toEqual({ valid: false, reason: 'payment_method_required' });
		expect(validateCheckoutPayment({
			payment_mode: 'single',
			payment_type: 'pendiente',
			totalToPay: 10_000,
		})).toEqual({ valid: false, reason: 'payment_method_required' });
		expect(validateCheckoutPayment({
			payment_mode: 'single',
			payment_type: 'tarjeta',
			totalToPay: 10_000,
		})).toEqual({ valid: true });
	});

	it('no convierte pagos vacíos o pendientes en efectivo', () => {
		expect(buildSettlementPaymentBreakdown('', 10_000)).toBeNull();
		expect(buildSettlementPaymentBreakdown('pendiente', 10_000)).toBeNull();
		expect(getOrderPaymentBreakdown({ total: 10_000, payment_type: '' })).toEqual({
			cash: 0,
			card: 0,
			online: 0,
		});
		expect(isOrderPaymentSettled({ total: 10_000, payment_type: '' })).toBe(false);
		expect(getOrderPaymentBreakdown({
			total: 10_000,
			payment_type: 'tienda',
		})).toEqual({ cash: 10_000, card: 0, online: 0 });
	});

	it('persiste el desglose explícito para pagos de un solo método', () => {
		expect(buildPaymentBreakdownForOrder({
			payment_mode: 'single',
			payment_type: 'tarjeta',
			total: 24_000,
		})).toEqual({ cash: 0, card: 24_000, online: 0 });
		expect(buildPaymentBreakdownForOrder({
			payment_mode: 'single',
			payment_type: 'online',
			total: 10_500,
		})).toEqual({ cash: 0, card: 0, online: 10_500 });
		expect(buildPaymentBreakdownForOrder({
			payment_mode: 'single',
			payment_type: 'pendiente',
			total: 10_500,
		})).toBeNull();
	});

	it('conserva centavos USD sin redondearlos a unidades completas', () => {
		expect(buildPaymentBreakdownForOrder({
			payment_mode: 'single',
			payment_type: 'tarjeta',
			total: 10.5,
		})).toEqual({ cash: 0, card: 10.5, online: 0 });
		expect(validateCheckoutPayment({
			payment_mode: 'mixed',
			cash_amount: 5.25,
			card_amount: 5.25,
			cash_tendered: 5.25,
			totalToPay: 10.5,
		})).toEqual({ valid: true });
	});

	it('no planifica caja hasta que el cobro tenga un medio confirmado', () => {
		expect(planSaleMovements({
			id: 'order-1',
			total: 10_000,
			currency: 'CLP',
			payment_type: '',
		})).toEqual([]);
		expect(planSaleMovements({
			id: 'order-2',
			total: 10_000,
			currency: 'CLP',
			payment_type: 'tarjeta',
		})).toEqual([
			expect.objectContaining({
				type: 'sale',
				amount: 10_000,
				payment_method: 'card',
			}),
		]);
	});

	it('registra un pedido pagado cuando pasa a terminado, sin cobrar pendientes', () => {
		const paid = { total: 10_000, payment_type: 'tarjeta' };
		const pending = { total: 10_000, payment_type: 'pendiente' };
		expect(shouldRegisterPaidOrderAtStatus(paid, 'completed')).toBe(true);
		expect(shouldRegisterPaidOrderAtStatus(paid, 'picked_up')).toBe(true);
		expect(shouldRegisterPaidOrderAtStatus(pending, 'completed')).toBe(false);
		expect(shouldRegisterPaidOrderAtStatus(paid, 'cancelled')).toBe(false);
	});
});
