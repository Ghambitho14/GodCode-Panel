import React from 'react';
import { cleanup, render, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import CategoryModal from '@/modules/cash/admin/products/components/CategoryModal';

const submit = () => fireEvent.submit(document.querySelector('form'));
const findButton = (text) =>
	[...document.querySelectorAll('button')].find((b) => b.textContent.includes(text));

/**
 * CategoryModal traia el estado ocupado preparado (prop `saving`) pero Admin.jsx
 * lo montaba SIN esa prop, asi que en la practica nunca se bloqueaba nada:
 * handleSubmit llamaba a onSave sin await y el boton "Guardar" seguia vivo
 * durante todo el viaje a la red. Cada clic extra reejecutaba
 * admin_create_category_with_overrides y creaba una categoria duplicada.
 */
describe('estado ocupado en el modal de categorias', () => {
	afterEach(() => cleanup());

	const renderModal = (onSave, onClose = () => {}) =>
		render(
			<CategoryModal
				isOpen
				onClose={onClose}
				onSave={onSave}
				category={null}
				defaultOrder={1}
			/>,
		);

	it('no envia dos veces si se pulsa repetido', async () => {
		let resolver;
		const onSave = vi.fn(() => new Promise((r) => { resolver = r; }));
		renderModal(onSave);
		submit();
		submit();
		submit();
		expect(onSave).toHaveBeenCalledTimes(1);
		resolver();
	});

	it('bloquea Guardar y Cancelar mientras viaja la peticion', async () => {
		let resolver;
		const onSave = vi.fn(() => new Promise((r) => { resolver = r; }));
		renderModal(onSave);
		submit();
		await waitFor(() => expect(findButton('Guardando…')).toBeTruthy());
		expect(findButton('Guardando…').disabled).toBe(true);
		expect(findButton('Cancelar').disabled).toBe(true);
		resolver();
		await waitFor(() => expect(findButton('Guardar')).toBeTruthy());
	});

	it('no cierra el dialogo mientras se esta guardando', async () => {
		let resolver;
		const onClose = vi.fn();
		const onSave = vi.fn(() => new Promise((r) => { resolver = r; }));
		renderModal(onSave, onClose);
		submit();
		await waitFor(() => expect(onSave).toHaveBeenCalled());
		fireEvent.keyDown(window, { key: 'Escape' });
		expect(onClose).not.toHaveBeenCalled();
		resolver();
	});

	/* El desbloqueo vive en un `finally`, igual que en LocalExpenseModal y en
	   los modales de caja: si onSave falla, el boton vuelve a estar disponible
	   para reintentar en vez de quedarse muerto. */
	it('vuelve a habilitar el boton cuando termina el guardado', async () => {
		let resolver;
		const onSave = vi.fn(() => new Promise((r) => { resolver = r; }));
		renderModal(onSave);
		submit();
		await waitFor(() => expect(findButton('Guardando…')).toBeTruthy());
		resolver();
		await waitFor(() => expect(findButton('Guardar').disabled).toBe(false));
	});
});
