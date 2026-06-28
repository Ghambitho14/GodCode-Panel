import { describe, expect, it } from 'vitest';
import { getOrderFulfillmentDisplayLabel } from '@/shared/utils/orderUtils';
import { orderChannelForTicket } from '@/modules/cash/admin/utils/receiptPrinting';

describe('getOrderFulfillmentDisplayLabel', () => {
	it('devuelve Web para delivery del menú', () => {
		const order = {
			channel: 'delivery',
			payment_method_specific: 'transferencia',
		};
		expect(getOrderFulfillmentDisplayLabel(order)).toBe('Web');
	});

	it('devuelve PDV para retiro manual', () => {
		const order = {
			channel: 'pickup',
			client_name: 'Retiro',
		};
		expect(getOrderFulfillmentDisplayLabel(order)).toBe('PDV');
	});

	it('devuelve Mesa aunque tenga payment_method_specific', () => {
		const order = {
			channel: 'salon',
			client_name: 'Juan',
			payment_method_specific: 'efectivo',
		};
		expect(getOrderFulfillmentDisplayLabel(order)).toBe('Mesa');
	});
});

describe('orderChannelForTicket', () => {
	it('respeta override PDV del pedido manual', () => {
		const order = {
			channel: 'delivery',
			payment_method_specific: 'transferencia',
		};
		expect(orderChannelForTicket(order, 'PDV')).toBe('PDV');
	});

	it('usa WEB para menú con pago en tienda', () => {
		const order = {
			channel: 'pickup',
			payment_method_specific: 'efectivo',
			payment_type: 'tienda',
		};
		expect(orderChannelForTicket(order, null)).toBe('WEB');
	});

	it('usa PDV para pedido manual sin payment_method_specific', () => {
		const order = {
			channel: 'pickup',
			payment_type: 'tienda',
		};
		expect(orderChannelForTicket(order, null)).toBe('PDV');
	});
});
