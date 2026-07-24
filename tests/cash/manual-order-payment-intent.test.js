import { describe, expect, it } from 'vitest';
import { hasManualOrderPaymentIntent } from '@/modules/cash/hooks/manual-order/manualOrderShared';

describe('detección automática de pago en pedido manual', () => {
	it('deja pendiente una venta V2 sin líneas de pago', () => {
		expect(hasManualOrderPaymentIntent({ v2Enabled: true, payment_lines: [] })).toBe(false);
	});

	it('marca intención de pago V2 al agregar una línea', () => {
		expect(hasManualOrderPaymentIntent({
			v2Enabled: true,
			payment_lines: [{ id: 'line-1', methodId: 'cash' }],
		})).toBe(true);
	});

	it('detecta métodos legacy sin depender de charge_now', () => {
		expect(hasManualOrderPaymentIntent({
			v2Enabled: false,
			charge_now: false,
			payment_type: 'tarjeta',
			payment_mode: 'single',
		})).toBe(true);
		expect(hasManualOrderPaymentIntent({
			v2Enabled: false,
			charge_now: true,
			payment_type: 'pendiente',
			payment_mode: 'single',
		})).toBe(false);
	});
});
