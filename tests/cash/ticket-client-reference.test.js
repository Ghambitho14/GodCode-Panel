import { describe, expect, it } from 'vitest';
import { clientReferenceLineHtml } from '@/modules/cash/admin/printing/ticketFormatters';
import { ORDERS_LIST_SELECT, ORDERS_PANEL_SELECT } from '@/shared/utils/orderUtils';

describe('REF del ticket', () => {
	it('usa el número de la empresa, no el id global', () => {
		expect(clientReferenceLineHtml({ id: 2087, order_number: 1881 })).toBe('REF-1881');
	});

	it('el código de entrega solo reemplaza al REF si la sucursal lo imprime', () => {
		const order = { id: 2087, order_number: 1881, handoff_code: '4821' };
		expect(clientReferenceLineHtml(order)).toBe('REF-1881');
		expect(clientReferenceLineHtml(order, { showDeliveryCode: true })).toBe('CL-4821');
	});

	it('el panel trae order_number al cargar pedidos', () => {
		expect(ORDERS_LIST_SELECT).toMatch(/\border_number\b/);
		expect(ORDERS_PANEL_SELECT).toMatch(/\border_number\b/);
	});
});
