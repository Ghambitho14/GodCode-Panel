import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * Editar los tamaños de un producto que ya existe, de punta a punta en el modal: se cargan los
 * de la sucursal, se pueden renombrar, cambiar de precio, agregar y quitar, y al guardar viaja
 * la lista completa (con los ids de los que ya existían) para `admin_set_product_sizes`.
 */
const db = vi.hoisted(() => ({ tables: {}, failOn: null }));

vi.mock('@/integrations/supabase', async () => {
	const { TABLES } = await import('@/integrations/supabase/tables');
	const from = (table) => {
		const builder = {
			select: () => builder,
			eq: () => builder,
			order: () => builder,
			range: () => builder,
			in: () => builder,
			limit: () => builder,
			then: (resolve, reject) => {
				const result = db.failOn === table
					? { data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${table}'` } }
					: { data: db.tables[table] ?? [], error: null };
				return Promise.resolve(result).then(resolve, reject);
			},
		};
		return builder;
	};
	return { supabase: { from }, TABLES };
});
vi.mock('@/shared/utils/fetchAllPaginated', () => ({
	fetchAllPaginated: async () => [],
	PANEL_PAGINATION_PAGE_SIZE: 1000,
}));
vi.mock('@/shared/hooks/useSignedImageUrl', () => ({ useSignedImageUrl: () => ({ url: '' }) }));
vi.mock('@/modules/cash/hooks/useBranchMoney', () => ({ useBranchMoney: () => ({ currency: 'CLP' }) }));
vi.mock('@/modules/cash/admin/products/services/productVariants', async (importOriginal) => ({
	...(await importOriginal()),
	listProductVariants: async () => [],
}));

import ProductModal from '@/modules/cash/admin/products/components/ProductModal';

const CATEGORIES = [{ id: 'cat-pizzas', name: 'Pizzas' }];
const MARGARITA = { id: 'prod-margarita', name: 'Margarita', price: 8000, category_id: 'cat-pizzas', is_active: true };

function renderModal(product = MARGARITA) {
	const onSave = vi.fn(async () => {});
	render(
		<ProductModal
			product={product}
			categories={CATEGORIES}
			companyId="company-1"
			branchId="branch-1"
			onSave={onSave}
			onClose={() => {}}
		/>,
	);
	return onSave;
}

beforeEach(() => {
	db.failOn = null;
	db.tables = {
		product_sizes: [
			{ id: 'size-personal', name: 'Personal', price: 8000, sort_order: 0 },
			{ id: 'size-familiar', name: 'Familiar', price: 14000, sort_order: 1 },
		],
	};
});
afterEach(() => cleanup());

describe('modal de producto: editar tamaños', () => {
	it('carga los tamaños de la sucursal con el interruptor encendido y los campos editables', async () => {
		renderModal();
		expect(await screen.findByDisplayValue('Familiar')).toBeTruthy();
		expect(screen.getByDisplayValue('Personal')).toBeTruthy();
		expect(screen.getByRole('switch', { name: 'Quitar tamaños' }).getAttribute('aria-checked')).toBe('true');
		expect(screen.getByLabelText('Nombre del tamaño 1').disabled).toBe(false);
		expect(screen.getByLabelText('Precio del tamaño 2 en CLP').disabled).toBe(false);
	});

	it('renombrar, cambiar un precio, agregar y quitar viajan al guardar con los ids de los que ya existían', async () => {
		const onSave = renderModal();
		await screen.findByDisplayValue('Familiar');

		fireEvent.change(screen.getByLabelText('Nombre del tamaño 1'), { target: { value: 'Individual' } });
		fireEvent.change(screen.getByLabelText('Precio del tamaño 2 en CLP'), { target: { value: '15000' } });
		fireEvent.click(screen.getByRole('button', { name: /Agregar tamaño/ }));
		fireEvent.change(screen.getByLabelText('Nombre del tamaño 3'), { target: { value: 'Mediana' } });
		fireEvent.change(screen.getByLabelText('Precio del tamaño 3 en CLP'), { target: { value: '11000' } });
		fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/ }));

		await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
		const [payload] = onSave.mock.calls[0];
		expect(payload.sizes).toEqual([
			{ id: 'size-personal', name: 'Individual', price: 8000 },
			{ id: 'size-familiar', name: 'Familiar', price: 15000 },
			{ name: 'Mediana', price: 11000 },
		]);
		// El precio base pasa a ser el del tamaño más barato y la oferta se apaga.
		expect(payload.price).toBe(8000);
		expect(payload.has_discount).toBe(false);

		// Quitar uno: deja de viajar y la función lo borra.
		cleanup();
		const onSaveAgain = renderModal();
		await screen.findByDisplayValue('Familiar');
		fireEvent.click(screen.getByRole('button', { name: 'Quitar tamaño Personal' }));
		fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/ }));
		await waitFor(() => expect(onSaveAgain).toHaveBeenCalledTimes(1));
		expect(onSaveAgain.mock.calls[0][0].sizes).toEqual([{ id: 'size-familiar', name: 'Familiar', price: 14000 }]);
		expect(onSaveAgain.mock.calls[0][0].price).toBe(14000);
	});

	it('un producto sin tamaños puede pasar a tenerlos', async () => {
		db.tables.product_sizes = [];
		const onSave = renderModal();
		const toggle = await screen.findByRole('switch', { name: 'Usar varios tamaños' });
		await waitFor(() => expect(toggle.disabled).toBe(false));
		fireEvent.click(toggle);

		// Arranca con una fila con el precio actual, para no empezar en blanco.
		fireEvent.change(screen.getByLabelText('Nombre del tamaño 1'), { target: { value: 'Personal' } });
		fireEvent.click(screen.getByRole('button', { name: /Agregar tamaño/ }));
		fireEvent.change(screen.getByLabelText('Nombre del tamaño 2'), { target: { value: 'Familiar' } });
		fireEvent.change(screen.getByLabelText('Precio del tamaño 2 en CLP'), { target: { value: '14000' } });
		fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/ }));

		await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
		expect(onSave.mock.calls[0][0].sizes).toEqual([
			{ name: 'Personal', price: 8000 },
			{ name: 'Familiar', price: 14000 },
		]);
	});

	it('si la base no tiene la tabla, lo dice y guarda el producto sin tocar los tamaños', async () => {
		db.failOn = 'product_sizes';
		const onSave = renderModal();
		expect(await screen.findByText(/No se pudieron cargar los tamaños/)).toBeTruthy();
		expect(screen.getByRole('switch', { name: 'Usar varios tamaños' }).disabled).toBe(true);

		fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/ }));
		await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
		expect('sizes' in onSave.mock.calls[0][0]).toBe(false);
	});
});
