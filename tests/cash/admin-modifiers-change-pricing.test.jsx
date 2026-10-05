import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/cash/hooks/useBranchMoney', () => ({
	useBranchMoney: () => ({ formatMoney: (n) => `$${n}`, fractionDigits: 0 }),
}));
// El armador guarda lo pendiente al desmontarse, también en modo borrador.
vi.mock('@/integrations/supabase', () => ({
	supabase: { from: () => ({ upsert: async () => ({ error: null }) }) },
	TABLES: {},
}));

import AdminMenuModifiers from '@/modules/cash/components/AdminMenuModifiers';

afterEach(() => cleanup());

/** Sin empresa el armador trabaja con borrador local: basta con cargar el ejemplo. */
const openCambiarDeProteina = () => {
	render(<AdminMenuModifiers />);
	fireEvent.click(screen.getByRole('button', { name: 'Cargar ejemplo' }));
	fireEvent.click(screen.getByRole('button', { name: /^Proteína/ }));
	fireEvent.click(screen.getByRole('button', { name: /^Cambiar/ }));
};

describe('armador: cómo se cobra el cambio', () => {
	it('por defecto cobra el precio de la opción nueva y no muestra jerarquía', () => {
		openCambiarDeProteina();
		const modes = screen.getByRole('radiogroup', { name: 'Cómo se cobra el cambio' });
		expect(within(modes).getByRole('radio', { name: /Precio de la opción nueva/ })).toBeChecked();
		expect(screen.queryByText(/Jerarquía \(de más cara a más barata\)/)).toBeNull();
	});

	it('por jerarquía muestra las opciones ordenadas por valor', () => {
		openCambiarDeProteina();
		fireEvent.click(screen.getByRole('radio', { name: /Por jerarquía/ }));
		expect(screen.getByText(/Jerarquía \(de más cara a más barata\)/)).toBeInTheDocument();

		fireEvent.change(screen.getByLabelText('Valor de Camarón'), { target: { value: '1000' } });
		fireEvent.change(screen.getByLabelText('Valor de Salmón'), { target: { value: '800' } });

		const order = screen.getAllByLabelText(/^Valor de /).map((el) => el.getAttribute('aria-label'));
		expect(order).toEqual(['Valor de Camarón', 'Valor de Salmón', 'Valor de Pollo']);
		expect(screen.getByText(/Pollo → Camarón cobra \$1000; Camarón → Pollo es gratis\./)).toBeInTheDocument();
	});
});
