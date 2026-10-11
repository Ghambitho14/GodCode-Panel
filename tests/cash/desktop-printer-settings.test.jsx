import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DesktopPrinterSettings from '@/modules/cash/components/DesktopPrinterSettings';

const PRINTERS = [
	{ name: 'EPSON_TM_T20', displayName: 'EPSON TM-T20', isDefault: true },
	{ name: 'XP-80C', displayName: 'XP-80C', isDefault: false },
];

/** Lo que expone `desktop/preload.cjs`. */
function stubDesktop(config = { cashierPrinter: '', kitchenPrinter: null, autoPrint: true }) {
	const bridge = {
		version: '1.0.0',
		listPrinters: vi.fn().mockResolvedValue(PRINTERS),
		getConfig: vi.fn().mockResolvedValue(config),
		setConfig: vi.fn(async (patch) => ({ ...config, ...patch })),
		printTicket: vi.fn().mockResolvedValue({ ok: true }),
	};
	window.godcodeDesktop = bridge;
	return bridge;
}

const branch = { id: 'b1', name: 'Pudahuel', currency: 'CLP' };

afterEach(() => {
	cleanup();
	delete window.godcodeDesktop;
});

describe('impresora de este equipo', () => {
	it('en el navegador (sin app de escritorio) no se muestra', () => {
		const { container } = render(<DesktopPrinterSettings selectedBranch={branch} />);
		expect(container).toBeEmptyDOMElement();
	});

	it('lista las impresoras de Windows y marca la predeterminada', async () => {
		stubDesktop();
		render(<DesktopPrinterSettings selectedBranch={branch} />);
		const cashier = await screen.findByLabelText('Ticket de caja');
		expect(cashier).toHaveValue('');
		expect(screen.getByRole('option', { name: 'Predeterminada de Windows (EPSON TM-T20)' })).toBeInTheDocument();
		expect(screen.getAllByRole('option', { name: 'EPSON TM-T20 · predeterminada' })).toHaveLength(2);
		expect(screen.getByLabelText('Comanda de cocina')).toHaveDisplayValue('La misma que caja');
	});

	it('elegir impresora o apagar la impresion automatica se guarda en el equipo', async () => {
		const bridge = stubDesktop();
		const showNotify = vi.fn();
		render(<DesktopPrinterSettings selectedBranch={branch} showNotify={showNotify} />);

		fireEvent.change(await screen.findByLabelText('Ticket de caja'), { target: { value: 'XP-80C' } });
		await waitFor(() => expect(bridge.setConfig).toHaveBeenCalledWith({ cashierPrinter: 'XP-80C' }));

		fireEvent.change(screen.getByLabelText('Comanda de cocina'), { target: { value: 'EPSON_TM_T20' } });
		await waitFor(() => expect(bridge.setConfig).toHaveBeenCalledWith({ kitchenPrinter: 'EPSON_TM_T20' }));

		fireEvent.click(screen.getByRole('checkbox', { name: /Imprimir automáticamente/ }));
		await waitFor(() => expect(bridge.setConfig).toHaveBeenCalledWith({ autoPrint: false }));
		expect(showNotify).toHaveBeenCalledWith('Guardado en este equipo', 'success');
	});

	it('una impresora guardada que ya no esta se sigue viendo, marcada como no encontrada', async () => {
		stubDesktop({ cashierPrinter: 'Vieja', kitchenPrinter: null, autoPrint: true });
		render(<DesktopPrinterSettings selectedBranch={branch} />);
		expect(await screen.findByLabelText('Ticket de caja')).toHaveDisplayValue('Vieja (no encontrada)');
	});

	it('probar imprime un ticket de ejemplo en la impresora de cada tipo', async () => {
		const bridge = stubDesktop();
		render(<DesktopPrinterSettings selectedBranch={branch} showNotify={vi.fn()} />);
		await screen.findByLabelText('Ticket de caja');

		const [cashierTest, kitchenTest] = screen.getAllByRole('button', { name: /Probar/ });
		fireEvent.click(cashierTest);
		await waitFor(() => expect(bridge.printTicket).toHaveBeenCalledTimes(1));
		expect(bridge.printTicket).toHaveBeenLastCalledWith(
			expect.objectContaining({ variant: 'cashier', auto: false, html: expect.stringContaining('Pudahuel') }),
		);

		await waitFor(() => expect(kitchenTest).toBeEnabled());
		fireEvent.click(kitchenTest);
		await waitFor(() => expect(bridge.printTicket).toHaveBeenCalledTimes(2));
		expect(bridge.printTicket).toHaveBeenLastCalledWith(expect.objectContaining({ variant: 'kitchen', auto: false }));
	});
});
