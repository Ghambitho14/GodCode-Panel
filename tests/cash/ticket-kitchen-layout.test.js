import { describe, expect, it } from 'vitest';
import { buildTicketHtml } from '@/modules/cash/admin/printing/ticketHtml';

const order = {
	id: 2087,
	order_number: 1881,
	shift_sequence: 200,
	created_at: '2026-09-29T04:33:31Z',
	client_name: 'Marcos',
	client_phone: '+56 9 1234 5678',
	currency: 'CLP',
	order_type: 'pickup',
	payment_type: 'cash',
	payment_method_specific: 'efectivo',
	total: 19900,
	items: [
		{ name: '30 Piezas', quantity: 1, price: 18900, note: 'Bien cortado', extras: [
			{ kind: 'change', name: 'Cambiar camarón por pollo', quantity: 1, price: 0 },
			{ kind: 'change', name: 'Cambiar kanikama por salmón', quantity: 1, price: 1000 },
		] },
	],
};

const render = (o, printOptions = {}) => {
	const html = buildTicketHtml(o, 'Oishi', null, 'kitchen', { companyName: 'Oishi Sushi', orderChannel: 'PDV', ...printOptions });
	return new DOMParser().parseFromString(html, 'text/html');
};

describe('comanda de cocina (diseño Salón)', () => {
	it('tiene la caja del turno, el tipo y los datos del pedido como el ticket de caja', () => {
		const doc = render(order);
		expect(doc.querySelector('.c-brand').textContent).toBe('COCINA');
		expect(doc.querySelector('.c-num-box').textContent.trim()).toBe('200');
		expect(doc.querySelector('.c-where').textContent).toBe('RETIRO');
		const info = doc.querySelector('.c-info').textContent.replace(/\s+/g, ' ');
		expect(info).toContain('Número. 1881');
		expect(info).toContain('Cliente. Marcos');
		expect(doc.body.textContent).not.toContain('2087');
	});

	it('no lleva precios, totales, pago, teléfono ni la empresa', () => {
		const doc = render(order);
		const text = doc.body.textContent;
		expect(doc.querySelector('.c-p')).toBeNull();
		expect(doc.querySelector('.c-money')).toBeNull();
		expect(doc.querySelector('.c-legal')).toBeNull();
		for (const absent of ['Importe', 'TOTAL', '18.900', '1.000', 'Pago.', 'Tel.', 'OISHI', 'Oishi']) {
			expect(text).not.toContain(absent);
		}
	});

	it('los cambios y las notas van bajo el producto', () => {
		const doc = render(order);
		expect([...doc.querySelectorAll('.c-mods .c-mod .c-d')].map((d) => d.textContent)).toEqual([
			'* CAMBIAR CAMARÓN POR POLLO',
			'* CAMBIAR KANIKAMA POR SALMÓN',
		]);
		expect(doc.querySelector('.c-item-note').textContent).toBe('NOTA: BIEN CORTADO');
	});

	it('la nota general del pedido va al pie de la hoja', () => {
		const items = order.items.map((item) => ({ ...item, note: undefined }));
		const doc = render({ ...order, items, note: 'Sin palillos' });
		expect(doc.querySelector('.c-note').textContent).toBe('NOTA: Sin palillos');
	});

	it('el código de entrega de delivery solo va si la sucursal lo activó', () => {
		const delivery = { ...order, order_type: 'delivery', handoff_code: '4821' };
		expect(render(delivery).body.textContent).not.toContain('4821');
		const doc = render(delivery, { showDeliveryCode: true });
		expect(doc.querySelector('.c-info').textContent.replace(/\s+/g, ' ')).toContain('Código. 4821');
		// Sin la caja de envío: lleva el cargo y repetiría el código.
		expect(doc.querySelector('.c-delivery-box')).toBeNull();
		expect(doc.body.textContent.match(/4821/g)).toHaveLength(1);
	});

	it('si la sucursal eligió el Clásico, la comanda sale en el diseño clásico', () => {
		const doc = render(order, { ticketDesign: 'classic' });
		expect(doc.querySelector('.k-band-order').textContent).toBe('#200 - COCINA - RETIRO - PDV');
		expect(doc.querySelector('.c-num-box')).toBeNull();
	});
});
