import { describe, expect, it } from 'vitest';
import { hasManualOrderPaymentIntent } from '@/modules/cash/hooks/manual-order/manualOrderShared';

describe('detección automática de pago en pedido manual', () => {
	it('deja pendiente una venta V2 sin líneas de pago', () => {
		expect(hasManualOrderPaymentIntent({ v2Enabled: true, payment_lines: [] })).toBe(false);
	});

	it('no marca efectivo como pagado solo por seleccionar el método', () => {
		expect(hasManualOrderPaymentIntent({
			v2Enabled: true,
			payment_lines: [{
				id: 'line-1',
				methodId: 'cash',
				rail: 'cash',
				settlementTrigger: 'cash_confirmation',
			}],
		})).toBe(false);
	});

	it('marca efectivo como pago cuando se confirma lo recibido', () => {
		expect(hasManualOrderPaymentIntent({
			v2Enabled: true,
			payment_lines: [{
				id: 'line-1',
				methodId: 'cash',
				rail: 'cash',
				settlementTrigger: 'cash_confirmation',
				tenderedAmountMinor: 1000,
			}],
		})).toBe(true);
	});

	it('exige comprobante para pagos que se liquidan al subir evidencia', () => {
		const payment_lines = [{
			id: 'line-1',
			methodId: 'pago_movil',
			rail: 'online',
			settlementTrigger: 'evidence_uploaded',
		}];
		expect(hasManualOrderPaymentIntent({ v2Enabled: true, payment_lines })).toBe(false);
		expect(hasManualOrderPaymentIntent({
			v2Enabled: true,
			payment_lines,
			receiptFile: new File(['proof'], 'proof.png', { type: 'image/png' }),
		})).toBe(true);
	});

	it('detecta métodos legacy sin depender solo de charge_now', () => {
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
