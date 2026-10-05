import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { changePricingMode, changeSurcharge, changeValue } from '@/modules/cash/utils/modifierPricing';

// Precios de «cambiar» de la proteína de Oishi.
const items = {
	pollo: { enabled: true, price: 0 },
	kanikama: { enabled: true, price: 0 },
	champinon: { enabled: true, price: 600 },
	camaron: { enabled: true, price: 1000 },
	salmon: { enabled: true, price: 1000 },
};
// Sin configurar: como funcionaba antes (precio del destino).
const porDestino = { enabled: true, label: 'Cambiar', items };
const porJerarquia = { ...porDestino, pricing: 'difference' };

describe('cobro de cambios: precio de la opción nueva (por defecto)', () => {
	it('un grupo sin configurar cobra siempre el precio del destino', () => {
		expect(changePricingMode(porDestino)).toBe('target');
		expect(changeSurcharge(porDestino, 'camaron', 'salmon')).toBe(1000);
		expect(changeSurcharge(porDestino, 'camaron', 'champinon')).toBe(600);
		expect(changeSurcharge(porDestino, 'salmon', 'pollo')).toBe(0);
	});
});

describe('cobro de cambios: por jerarquía', () => {
	it('bajar o quedar en el mismo valor es gratis', () => {
		expect(changePricingMode(porJerarquia)).toBe('difference');
		expect(changeSurcharge(porJerarquia, 'camaron', 'pollo')).toBe(0);
		expect(changeSurcharge(porJerarquia, 'camaron', 'champinon')).toBe(0);
		expect(changeSurcharge(porJerarquia, 'camaron', 'salmon')).toBe(0);
		expect(changeSurcharge(porJerarquia, 'pollo', 'kanikama')).toBe(0);
	});

	it('subir cobra la diferencia', () => {
		expect(changeSurcharge(porJerarquia, 'pollo', 'camaron')).toBe(1000);
		expect(changeSurcharge(porJerarquia, 'champinon', 'salmon')).toBe(400);
		expect(changeSurcharge(porJerarquia, 'kanikama', 'champinon')).toBe(600);
	});

	it('una opción sin valor cuenta como 0', () => {
		expect(changeValue(porJerarquia, 'no-existe')).toBe(0);
		expect(changeSurcharge(porJerarquia, 'no-existe', 'salmon')).toBe(1000);
		expect(changeSurcharge(undefined, 'pollo', 'salmon')).toBe(0);
	});
});

const group = {
	id: 'g1',
	name: 'Proteína',
	scope: 'all',
	options: [
		{ id: 'pollo', name: 'Pollo apanado' },
		{ id: 'kanikama', name: 'Kanikama' },
		{ id: 'champinon', name: 'Champiñón' },
		{ id: 'camaron', name: 'Camarón' },
		{ id: 'salmon', name: 'Salmón' },
	],
	actions: { cambiar: porDestino },
};

// 30 Piezas: camarón, kanikama y pollo en la parte Proteína.
const recipe = ['Camarón', 'Kanikama', 'Pollo'].map((name, i) => ({
	part: 'Proteína', inventory_item_id: `i${i}`, inventory_items: { name },
}));

vi.mock('@/integrations/supabase', () => {
	const result = (table) => ({ data: table === 'groups' ? [group] : recipe, error: null });
	const builder = (table) => {
		const b = {
			select: () => b,
			order: () => b,
			eq: () => b,
			then: (resolve, reject) => Promise.resolve(result(table)).then(resolve, reject),
		};
		return b;
	};
	return {
		TABLES: { menu_modifier_groups: 'groups', product_inventory_recipe: 'recipe' },
		supabase: { from: (table) => builder(table) },
	};
});

const { default: ManualOrderChangesModal } = await import('@/modules/cash/components/manual-order/ManualOrderChangesModal');

afterEach(() => cleanup());

const renderModal = () => render(
	<ManualOrderChangesModal
		item={{ id: 'p30', name: '30 Piezas', quantity: 1, extras: [] }}
		formatMoney={(n) => `$${n}`}
		onSave={vi.fn()}
		onClose={vi.fn()}
	/>,
);

describe('caja: quitar con precio', () => {
	it('quitar cobra su precio; sin precio es gratis', async () => {
		group.actions = {
			quitar: {
				enabled: true,
				label: 'Quitar',
				items: { camaron: { enabled: true, price: 500 }, kanikama: { enabled: true, price: 0 } },
			},
		};
		renderModal();
		fireEvent.click(await screen.findByRole('button', { name: /Proteína/ }));
		fireEvent.click(screen.getByRole('button', { name: /Quitar/ }));
		expect(priceOf('Camarón')).toMatch(/\+\$500/);
		expect(priceOf('Kanikama')).not.toMatch(/\+\$/);

		fireEvent.click(screen.getByRole('button', { name: /^Camarón/ }));
		expect(screen.getByRole('button', { name: /Guardar 1 · \+\$500/ })).toBeInTheDocument();
	});
});

const openTargets = async (cambiar, fromName) => {
	group.actions = { cambiar };
	render(
		<ManualOrderChangesModal
			item={{ id: 'p30', name: '30 Piezas', quantity: 1, extras: [] }}
			formatMoney={(n) => `$${n}`}
			onSave={vi.fn()}
			onClose={vi.fn()}
		/>,
	);
	fireEvent.click(await screen.findByRole('button', { name: /Proteína/ }));
	fireEvent.click(screen.getByRole('button', { name: /Cambiar/ }));
	fireEvent.click(screen.getByRole('button', { name: new RegExp(fromName) }));
};

const priceOf = (name) => screen.getByRole('button', { name: new RegExp(`^${name}`) }).textContent;

describe('caja: precio de cada destino', () => {
	it('por defecto cobra el precio del destino aunque baje', async () => {
		await openTargets(porDestino, 'Camarón');
		expect(priceOf('Champiñón')).toMatch(/\+\$600/);
		expect(priceOf('Salmón')).toMatch(/\+\$1000/);
		expect(priceOf('Pollo apanado')).not.toMatch(/\+\$/);
	});

	it('por jerarquía, desde camarón nada cobra', async () => {
		await openTargets(porJerarquia, 'Camarón');
		for (const name of ['Pollo apanado', 'Kanikama', 'Champiñón', 'Salmón']) {
			expect(priceOf(name)).not.toMatch(/\+\$/);
		}
	});

	it('por jerarquía, desde pollo cobra la diferencia al subir', async () => {
		await openTargets(porJerarquia, 'Pollo apanado');
		expect(priceOf('Kanikama')).not.toMatch(/\+\$/);
		expect(priceOf('Champiñón')).toMatch(/\+\$600/);
		expect(priceOf('Camarón')).toMatch(/\+\$1000/);
		expect(priceOf('Salmón')).toMatch(/\+\$1000/);
	});
});
