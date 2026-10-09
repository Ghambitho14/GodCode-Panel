import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/shared/hooks/useSignedImageUrl', () => ({
	useSignedImageUrl: () => ({ url: '' }),
}));

import ProductVariantsEditor from '@/modules/cash/admin/products/components/ProductVariantsEditor';
import { createVariantGroupDraft, createVariantOptionDraft } from '@/modules/cash/admin/products/services/productVariants';

afterEach(() => cleanup());

describe('ProductVariantsEditor', () => {
	it('sin grupos explica el caso y permite agregar el primero', () => {
		const onChange = vi.fn();
		render(<ProductVariantsEditor groups={[]} onChange={onChange} currency="USD" productName="Hamburguesa" />);
		expect(screen.getByText(/Sin variantes/)).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: /Agregar grupo de variantes/ }));
		expect(onChange).toHaveBeenCalledTimes(1);
		const next = onChange.mock.calls[0][0];
		expect(next).toHaveLength(1);
		expect(next[0].options).toHaveLength(1);
	});

	it('edita nombre y diferencia, agrega opciones y muestra el nombre que verá el cliente', () => {
		const onChange = vi.fn();
		const group = createVariantGroupDraft({
			name: 'Proteína',
			options: [createVariantOptionDraft({ name: 'Pollo' }), createVariantOptionDraft({ name: '' })],
		});
		render(<ProductVariantsEditor groups={[group]} onChange={onChange} currency="USD" productName="Hamburguesa" />);

		expect(screen.getByText('El cliente verá «Hamburguesa (Pollo)»')).toBeTruthy();

		const [, secondName] = screen.getAllByLabelText('Nombre de la opción');
		fireEvent.change(secondName, { target: { value: 'Mixta' } });
		expect(onChange.mock.calls[0][0][0].options[1].name).toBe('Mixta');

		const [, secondDelta] = screen.getAllByLabelText(/Diferencia de precio/);
		fireEvent.change(secondDelta, { target: { value: '1.5' } });
		expect(onChange.mock.calls[1][0][0].options[1].priceDelta).toBe('1.5');

		fireEvent.click(screen.getByRole('button', { name: /Agregar opción/ }));
		expect(onChange.mock.calls[2][0][0].options).toHaveLength(3);
	});

	it('con tamaños, el ejemplo de línea lleva el tamaño como lo compone la base', () => {
		const group = createVariantGroupDraft({ name: 'Proteína', options: [createVariantOptionDraft({ name: 'Pollo' })] });
		render(<ProductVariantsEditor groups={[group]} onChange={() => {}} productName="Pizza" sizeName="Familiar" />);
		expect(screen.getByText('El cliente verá «Pizza (Familiar, Pollo)»')).toBeTruthy();
	});

	it('pinta los errores por grupo y por opción, y el general', () => {
		const group = createVariantGroupDraft({ name: '', options: [createVariantOptionDraft({ name: '' })] });
		const errors = {
			[group.key]: 'Ponle nombre al grupo (ej: Proteína)',
			[group.options[0].key]: 'Escribe el nombre de la opción',
			general: 'Como máximo 24 opciones entre todos los grupos',
		};
		render(<ProductVariantsEditor groups={[group]} onChange={() => {}} errors={errors} />);
		expect(screen.getByText('Ponle nombre al grupo (ej: Proteína)')).toBeTruthy();
		expect(screen.getByText('Escribe el nombre de la opción')).toBeTruthy();
		expect(screen.getByText(/24 opciones/)).toBeTruthy();
		expect(screen.getByLabelText('Nombre del grupo').getAttribute('aria-invalid')).toBe('true');
	});

	it('deshabilitado no deja agregar ni editar', () => {
		render(
			<ProductVariantsEditor
				groups={[createVariantGroupDraft({ name: 'Masa' })]}
				onChange={() => {}}
				disabled
				status={{ kind: 'error', message: 'No se pudieron cargar las variantes' }}
			/>,
		);
		expect(screen.getByText('No se pudieron cargar las variantes')).toBeTruthy();
		expect(screen.getByRole('button', { name: /Agregar otro grupo/ }).hasAttribute('disabled')).toBe(true);
		expect(screen.getByLabelText('Nombre del grupo').hasAttribute('disabled')).toBe(true);
	});
});
