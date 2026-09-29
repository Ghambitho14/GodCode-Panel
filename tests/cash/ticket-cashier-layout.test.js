import { describe, expect, it } from 'vitest';
import { buildTicketHtml } from '@/modules/cash/admin/printing/ticketHtml';

const order = {
	id: 2087,
	order_number: 1881,
	shift_sequence: 200,
	created_at: '2026-09-29T04:33:31Z',
	client_name: 'Marcos',
	currency: 'CLP',
	order_type: 'pickup',
	items: [
		{ name: '30 Piezas', quantity: 1, price: 18900, extras: [
			{ kind: 'change', name: 'Cambiar camarón por pollo', quantity: 1, price: 0 },
			{ kind: 'change', name: 'Cambiar kanikama por salmón', quantity: 1, price: 1000 },
		] },
	],
};

const render = (o) => {
	const html = buildTicketHtml(o, 'Oishi', null, 'cashier', { companyName: 'Oishi Sushi', orderChannel: 'PDV' });
	return new DOMParser().parseFromString(html, 'text/html');
};

describe('ticket de caja', () => {
	it('lleva el número del turno solo en la caja de arriba, y el de la empresa en los datos', () => {
		const doc = render(order);
		expect(doc.querySelector('.c-num-box').textContent.trim()).toBe('200');
		expect(doc.querySelector('.c-bottom-num')).toBeNull();
		expect(doc.querySelector('.c-where').textContent).toBe('RETIRO');
		const info = doc.querySelector('.c-info').textContent.replace(/\s+/g, ' ');
		expect(info).toContain('Número. 1881');
		expect(info).toContain('Cliente. Marcos');
		expect(doc.body.textContent).not.toContain('2087');
	});

	it('los cambios van con asterisco dentro de la raya punteada y solo muestran precio si cobran', () => {
		const doc = render(order);
		expect(doc.querySelectorAll('.c-mods')).toHaveLength(1);
		const mods = [...doc.querySelectorAll('.c-mods .c-mod')];
		expect(mods.map((m) => m.querySelector('.c-d').textContent)).toEqual([
			'* CAMBIAR CAMARÓN POR POLLO',
			'* CAMBIAR KANIKAMA POR SALMÓN',
		]);
		expect(mods[0].querySelector('.c-p').textContent).toBe('');
		expect(mods[1].querySelector('.c-p').textContent).toMatch(/1\.000/);
	});

	it('sin número de empresa no cae al id global', () => {
		const doc = render({ ...order, order_number: null });
		expect(doc.querySelector('.c-info').textContent).toContain('—');
		expect(doc.body.textContent).not.toContain('2087');
	});
});
