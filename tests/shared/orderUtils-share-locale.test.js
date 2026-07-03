import { describe, expect, it } from 'vitest';
import { buildOrderWhatsAppShareText } from '@/shared/utils/orderUtils';

describe('buildOrderWhatsAppShareText shareLocale', () => {
	it('usa Cédula / RIF y total dual en Venezuela', () => {
		const order = {
			id: 'abc',
			client_name: 'María',
			client_phone: '+58 412 123 4567',
			client_rut: 'V-12345678',
			payment_method_specific: 'pago_movil',
			payment_type: 'online',
			total: 10,
			currency: 'USD',
			items: [],
		};
		const text = buildOrderWhatsAppShareText(order, 'Sucursal VE', {
			branch: { country: 'VE', delivery_settings: { exchangeRate: 100 } },
			exchangeRate: 100,
		});
		expect(text).toContain('Cédula / RIF: V-12345678');
		expect(text).toContain('Bs.');
		expect(text).toContain('$10.00');
	});
});
