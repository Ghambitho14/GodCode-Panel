import { describe, expect, it } from 'vitest';
import {
	isVenezuelaCountry,
	paymentMethodUsesBolivaresInVenezuela,
	paymentMethodUsesUsdInVenezuela,
	resolvePaymentAmountDisplay,
	resolvePaymentAmountMessageValue,
} from '@/lib/money/venezuela-payment-copy';

describe('venezuela-payment-copy', () => {
	it('detecta país Venezuela', () => {
		expect(isVenezuelaCountry('VE')).toBe(true);
		expect(isVenezuelaCountry('Venezuela')).toBe(true);
		expect(isVenezuelaCountry('CL')).toBe(false);
	});

	it('clasifica métodos locales en bolívares', () => {
		expect(paymentMethodUsesBolivaresInVenezuela('pago_movil')).toBe(true);
		expect(paymentMethodUsesUsdInVenezuela('zelle')).toBe(true);
	});

	it('muestra dual USD/Bs. para pago móvil con tasa', () => {
		const display = resolvePaymentAmountDisplay({
			methodKey: 'pago_movil',
			grandTotal: 10,
			exchangeRate: 640,
			country: 'VE',
		});
		expect(display).toContain('$10.00');
		expect(display).toContain('Bs.');
	});

	it('mensaje WhatsApp prioriza Bs. para métodos locales', () => {
		const msg = resolvePaymentAmountMessageValue({
			methodKey: 'pago_movil',
			grandTotal: 10,
			exchangeRate: 640,
			country: 'VE',
		});
		expect(msg).toMatch(/^Bs\./);
		expect(msg).toContain('$10.00');
	});

	it('zelle solo muestra USD', () => {
		const display = resolvePaymentAmountDisplay({
			methodKey: 'zelle',
			grandTotal: 25,
			exchangeRate: 640,
			country: 'VE',
		});
		expect(display).toBe('$25.00');
	});
});
