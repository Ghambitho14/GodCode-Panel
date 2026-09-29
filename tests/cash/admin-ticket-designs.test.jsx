import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTicketHtml } from '@/modules/cash/admin/printing/ticketHtml';
import {
	buildTicketPreviewOrder,
	resolveCashierTicketDesign,
} from '@/modules/cash/admin/printing/ticketDesigns';

const saveTicketSettings = vi.fn(async () => ({}));
vi.mock('@/modules/cash/services/branchSettingsService', () => ({
	branchSettingsService: { saveTicketSettings: (...args) => saveTicketSettings(...args) },
}));

const { default: AdminMenuTicketSection } = await import('@/modules/cash/components/AdminMenuTicketSection');

afterEach(() => {
	cleanup();
	saveTicketSettings.mockClear();
});

const branchWith = (ticketDesign) => ({
	id: 'b1',
	name: 'Pudahuel',
	currency: 'CLP',
	manual_order_settings: { enabled: false, version: 1, ...(ticketDesign ? { ticketDesign } : {}) },
});

describe('diseño del ticket de caja', () => {
	it('por defecto es Salón; la sucursal puede elegir Clásico; un valor raro vuelve al defecto', () => {
		expect(resolveCashierTicketDesign({ branch: branchWith() })).toBe('salon');
		expect(resolveCashierTicketDesign({ branch: branchWith('classic') })).toBe('classic');
		expect(resolveCashierTicketDesign({ branch: branchWith('otro') })).toBe('salon');
		expect(resolveCashierTicketDesign({ branch: branchWith('classic'), ticketDesign: 'salon' })).toBe('salon');
	});

	it('la impresión usa el diseño de la sucursal', () => {
		const order = buildTicketPreviewOrder();
		const salon = buildTicketHtml(order, 'X', null, 'cashier', { branch: branchWith() });
		const classic = buildTicketHtml(order, 'X', null, 'cashier', { branch: branchWith('classic') });
		expect(salon).toContain('c-num-box');
		expect(salon).not.toContain('c-band-order');
		expect(classic).toContain('c-band-order');
		expect(classic).not.toContain('c-num-box');
	});

	it('en delivery el código de verificación no se imprime salvo que la sucursal lo active', () => {
		const order = buildTicketPreviewOrder({ fulfillment: 'delivery' });
		const withCode = { ...branchWith(), manual_order_settings: { ticketShowDeliveryCode: true } };
		for (const ticketDesign of ['salon', 'classic']) {
			const off = buildTicketHtml(order, 'X', null, 'cashier', { branch: branchWith(), ticketDesign });
			const on = buildTicketHtml(order, 'X', null, 'cashier', { branch: withCode, ticketDesign });
			expect(off).not.toContain('4821');
			expect(on).toContain('COD. VERIF: 4821');
		}
		// La comanda tampoco lo muestra en la línea de referencia.
		expect(buildTicketHtml(order, 'X', null, 'kitchen', { branch: branchWith() })).not.toContain('CL-4821');
	});

	it('la dirección va primero y antes del cargo de envío', () => {
		const html = buildTicketHtml(buildTicketPreviewOrder({ fulfillment: 'delivery' }), 'X', null, 'cashier', {});
		expect(html.indexOf('Av. Siempre Viva 742')).toBeLessThan(html.indexOf('Cargo envío'));
	});
});

describe('Opciones de sucursal › Ticket', () => {
	it('muestra los dos diseños y la comanda, marca el que está en uso y guarda el elegido', async () => {
		const onSaved = vi.fn();
		render(<AdminMenuTicketSection selectedBranch={branchWith()} companyName="Oishi Sushi" onSaved={onSaved} />);

		for (const name of ['Salón', 'Clásico']) {
			for (const tipo of ['Retiro', 'Delivery']) {
				expect(screen.getByTitle(`Vista previa del ticket ${name} · ${tipo}`)).toBeInTheDocument();
			}
		}
		expect(screen.getByTitle('Vista previa de la comanda de cocina · Delivery')).toBeInTheDocument();
		expect(screen.getByRole('radio', { name: /Salón/ })).toBeChecked();
		expect(screen.queryByText('Cambios sin guardar')).toBeNull();

		fireEvent.click(screen.getByRole('radio', { name: /Clásico/ }));
		fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));

		await waitFor(() => expect(onSaved).toHaveBeenCalled());
		expect(saveTicketSettings).toHaveBeenCalledWith('b1', { ticketDesign: 'classic', ticketShowDeliveryCode: false });
	});

	it('sin sucursal elegida pide elegir una', () => {
		render(<AdminMenuTicketSection selectedBranch={{ id: 'all' }} />);
		expect(screen.getByText(/Elige una sucursal/)).toBeInTheDocument();
	});
});
