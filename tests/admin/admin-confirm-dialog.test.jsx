import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AdminConfirmDialog, AdminConfirmDialogHost } from '@/modules/cash/components/AdminConfirmDialog';
import { alertDialog, confirmDialog } from '@/modules/cash/admin/utils/confirmDialog';

describe('AdminConfirmDialog', () => {
	afterEach(cleanup);

	it('muestra título y texto, y Esc cancela', () => {
		const onCancel = vi.fn();
		render(
			<AdminConfirmDialog open title="¿Eliminar el cupón?" text="No se puede deshacer." danger onCancel={onCancel} onConfirm={() => {}} />,
		);
		expect(screen.getByRole('dialog', { name: '¿Eliminar el cupón?' })).toBeTruthy();
		expect(screen.getByText('No se puede deshacer.')).toBeTruthy();
		// En acciones destructivas el foco arranca en Cancelar
		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancelar' }));
		fireEvent.keyDown(window, { key: 'Escape' });
		expect(onCancel).toHaveBeenCalledTimes(1);
	});

	it('mientras está ocupado no se puede cerrar', () => {
		const onCancel = vi.fn();
		render(<AdminConfirmDialog open title="Guardando" busy onCancel={onCancel} onConfirm={() => {}} />);
		fireEvent.keyDown(window, { key: 'Escape' });
		expect(onCancel).not.toHaveBeenCalled();
		expect(screen.getByRole('button', { name: 'Un momento…' }).disabled).toBe(true);
	});
});

describe('confirmDialog / alertDialog', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it('sin host usa el diálogo del navegador', async () => {
		vi.spyOn(window, 'confirm').mockReturnValue(false);
		await expect(confirmDialog({ title: 'Hola', text: 'Mundo' })).resolves.toBe(false);
		expect(window.confirm).toHaveBeenCalledWith('Hola\n\nMundo');
	});

	it('con host, la promesa espera al botón', async () => {
		render(<AdminConfirmDialogHost />);
		let result;
		act(() => {
			void confirmDialog({ title: '¿Cancelar el pedido #12?', confirmLabel: 'Cancelar pedido', cancelLabel: 'Volver', danger: true }).then((v) => {
				result = v;
			});
		});
		expect(screen.getByRole('dialog', { name: '¿Cancelar el pedido #12?' })).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Cancelar pedido' }));
		await act(async () => {});
		expect(result).toBe(true);
		expect(screen.queryByRole('dialog')).toBeNull();

		act(() => {
			void confirmDialog('¿Seguro?').then((v) => {
				result = v;
			});
		});
		fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
		await act(async () => {});
		expect(result).toBe(false);
	});

	it('el aviso tiene un solo botón y se cierra con Entendido', async () => {
		render(<AdminConfirmDialogHost />);
		let done = false;
		act(() => {
			void alertDialog({ title: 'La imagen es muy pesada', text: 'Máximo 20 MB.' }).then(() => {
				done = true;
			});
		});
		expect(screen.getByRole('alertdialog')).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull();
		fireEvent.click(screen.getByRole('button', { name: 'Entendido' }));
		await act(async () => {});
		expect(done).toBe(true);
	});
});
