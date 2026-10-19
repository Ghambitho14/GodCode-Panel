import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Comanda «MODIFICADO»: cuando un pedido en cocina cambia de tipo (p. ej. entra como
 * retiro y se pasa a delivery) o de productos, la cocina recibe otra comanda marcada.
 */

const fetchOrderWithItems = vi.fn();
const printOrderTicket = vi.fn();

vi.mock('@/modules/cash/services/analyticsService', () => ({
	fetchOrderWithItems: (...args) => fetchOrderWithItems(...args),
}));
vi.mock('@/modules/cash/admin/printing/printOrderTicket', () => ({
	printOrderTicket: (...args) => printOrderTicket(...args),
}));

import { buildTicketHtml } from '@/modules/cash/admin/printing/ticketHtml';
import { kitchenTicketNeedsReprint, reprintKitchenTicketAfterEdit } from '@/modules/cash/admin/printing/kitchenReprint';

const BRANCH = { id: 'branch-1', company_id: 'company-1', name: 'Centro', address: 'Av. Uno 123' };

const pickupOrder = {
	id: 2715,
	company_id: 'company-1',
	shift_sequence: 221,
	status: 'active',
	channel: 'pickup',
	order_type: 'sale',
	delivery_fee: 0,
	delivery_address: null,
	client_name: 'Ana',
	created_at: '2026-10-17T21:19:00Z',
	currency: 'CLP',
	items: [{ name: 'Pizza', quantity: 1, price: 9000 }],
};

const deliveryOrder = {
	...pickupOrder,
	channel: 'delivery',
	delivery_fee: 2000,
	delivery_address: { address: 'Av. Siempre Viva 742' },
};

const render = (order, variant, printOptions = {}) =>
	new DOMParser().parseFromString(buildTicketHtml(order, 'Centro', null, variant, printOptions), 'text/html');

beforeEach(() => {
	fetchOrderWithItems.mockReset();
	printOrderTicket.mockReset();
});

describe('marca MODIFICADO en la comanda', () => {
	it('el diseño Salón la lleva bajo «COCINA» solo cuando se pide', () => {
		const doc = render(deliveryOrder, 'kitchen', { modified: true });
		expect(doc.querySelector('.c-brand').textContent).toBe('COCINA');
		expect(doc.querySelector('.c-modified').textContent).toBe('MODIFICADO');
		expect(doc.querySelector('.c-where').textContent).toBe('DELIVERY');
		expect(render(deliveryOrder, 'kitchen').querySelector('.c-modified')).toBeNull();
	});

	it('el diseño Clásico la lleva sobre la banda del pedido', () => {
		const doc = render(deliveryOrder, 'kitchen', { modified: true, ticketDesign: 'classic' });
		expect(doc.querySelector('.k-modified').textContent).toBe('MODIFICADO');
		expect(doc.querySelector('.k-band-order').textContent).toBe('#221 - COCINA - DELIVERY - PDV');
		expect(render(deliveryOrder, 'kitchen', { ticketDesign: 'classic' }).querySelector('.k-modified')).toBeNull();
	});

	it('el ticket de caja no se marca', () => {
		for (const ticketDesign of [undefined, 'classic']) {
			expect(render(deliveryOrder, 'cashier', { modified: true, ticketDesign }).body.textContent).not.toContain('MODIFICADO');
		}
	});
});

describe('kitchenTicketNeedsReprint', () => {
	it('en cocina, pasar de retiro a delivery pide otra comanda', () => {
		expect(kitchenTicketNeedsReprint(pickupOrder, deliveryOrder)).toBe(true);
		expect(kitchenTicketNeedsReprint(deliveryOrder, pickupOrder)).toBe(true);
	});

	it('en cocina, cambiar productos pide otra comanda aunque el tipo siga igual', () => {
		expect(kitchenTicketNeedsReprint(pickupOrder, pickupOrder, { itemsChanged: true })).toBe(true);
		expect(kitchenTicketNeedsReprint(pickupOrder, pickupOrder)).toBe(false);
	});

	it('fuera de cocina no reimprime', () => {
		for (const status of ['pending', 'completed', 'picked_up', 'cancelled']) {
			const prev = { ...pickupOrder, status };
			const next = { ...deliveryOrder, status };
			expect(kitchenTicketNeedsReprint(prev, next, { itemsChanged: true })).toBe(false);
		}
	});
});

describe('reprintKitchenTicketAfterEdit', () => {
	it('relee el pedido guardado y lo imprime en cocina marcado MODIFICADO', async () => {
		fetchOrderWithItems.mockResolvedValue(deliveryOrder);
		const printed = await reprintKitchenTicketAfterEdit({
			previousOrder: pickupOrder,
			updatedOrder: { id: 2715, status: 'active' },
			itemsChanged: false,
			branch: BRANCH,
		});
		expect(printed).toBe(true);
		expect(fetchOrderWithItems).toHaveBeenCalledWith({ orderId: 2715, companyId: 'company-1' });
		expect(printOrderTicket).toHaveBeenCalledTimes(1);
		expect(printOrderTicket).toHaveBeenCalledWith(deliveryOrder, 'Centro', null, {
			variant: 'kitchen',
			branchAddress: 'Av. Uno 123',
			branch: BRANCH,
			modified: true,
		});
	});

	it('si nada cambió para la cocina no imprime', async () => {
		fetchOrderWithItems.mockResolvedValue({ ...pickupOrder, client_name: 'Ana María' });
		const printed = await reprintKitchenTicketAfterEdit({
			previousOrder: pickupOrder,
			updatedOrder: { id: 2715, status: 'active' },
			branch: BRANCH,
		});
		expect(printed).toBe(false);
		expect(printOrderTicket).not.toHaveBeenCalled();
	});

	it('un pedido que no está en cocina ni se relee', async () => {
		const printed = await reprintKitchenTicketAfterEdit({
			previousOrder: { ...pickupOrder, status: 'pending' },
			updatedOrder: { id: 2715, status: 'pending' },
			itemsChanged: true,
			branch: BRANCH,
		});
		expect(printed).toBe(false);
		expect(fetchOrderWithItems).not.toHaveBeenCalled();
		expect(printOrderTicket).not.toHaveBeenCalled();
	});

	it('si no se puede releer, imprime con lo que devolvió el guardado', async () => {
		fetchOrderWithItems.mockResolvedValue(null);
		await reprintKitchenTicketAfterEdit({
			previousOrder: pickupOrder,
			updatedOrder: { status: 'active', channel: 'delivery', delivery_fee: 2000 },
			branch: BRANCH,
		});
		expect(printOrderTicket).toHaveBeenCalledTimes(1);
		expect(printOrderTicket.mock.calls[0][0]).toMatchObject({ id: 2715, channel: 'delivery', items: pickupOrder.items });
	});

	it('un fallo al releer no rompe el guardado', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		fetchOrderWithItems.mockRejectedValue(new Error('offline'));
		await expect(reprintKitchenTicketAfterEdit({
			previousOrder: pickupOrder,
			updatedOrder: { id: 2715, status: 'active' },
			itemsChanged: true,
			branch: BRANCH,
		})).resolves.toBe(false);
		expect(printOrderTicket).not.toHaveBeenCalled();
		warn.mockRestore();
	});
});
