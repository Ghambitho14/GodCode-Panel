import { describe, expect, it } from 'vitest';
import { formatOrderAmount } from '@/lib/money/order-amount';

describe('formatOrderAmount', () => {
	it('formatea CLP para Chile', () => {
		const out = formatOrderAmount({
			amountUsd: 15000,
			branch: { currency: 'CLP', country: 'CL' },
			company: { country: 'CL' },
		});
		expect(out).toContain('15');
	});

	it('formatea USD para Venezuela sin tasa', () => {
		const out = formatOrderAmount({
			amountUsd: 10,
			branch: { country: 'VE', currency: 'VES' },
			company: { country: 'VE' },
			paymentMethod: 'pago_movil',
		});
		expect(out).toBe('$10.00');
	});

	it('dual display con tasa y método local', () => {
		const out = formatOrderAmount({
			amountUsd: 10,
			branch: {
				country: 'VE',
				delivery_settings: { exchangeRate: 100 },
			},
			paymentMethod: 'pago_movil',
		});
		expect(out).toContain('$10.00');
		expect(out).toContain('Bs.');
	});

	it('ticket muestra USD ≈ Bs. cuando hay tasa', () => {
		const out = formatOrderAmount({
			amountUsd: 10,
			branch: { country: 'VE' },
			exchangeRate: 40,
			context: 'ticket',
		});
		expect(out).toContain('≈');
		expect(out).toContain('Bs.');
	});

	it('ticket sin tasa en VE queda solo USD', () => {
		const out = formatOrderAmount({
			amountUsd: 10,
			branch: { country: 'VE' },
			context: 'ticket',
		});
		expect(out).not.toContain('≈');
		expect(out).not.toContain('Bs.');
	});
});
