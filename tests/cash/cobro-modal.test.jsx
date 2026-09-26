import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/cash/hooks/useOrderMoney', () => ({
	useOrderMoney: () => ({
		country: 'VE',
		currency: 'USD',
		exchangeRate: null,
		isVenezuela: true,
		formatMoney: (n) => `USD ${Number(n || 0).toFixed(2).replace('.', ',')}`,
		formatOrderAmount: ({ amountUsd }) => `USD ${Number(amountUsd || 0).toFixed(2).replace('.', ',')}`,
	}),
}));
vi.mock('@/shared/hooks/useLockBodyScroll', () => ({ useLockBodyScroll: () => {} }));
// El equivalente en bolívares pide la tasa BCV por red; aquí no aporta nada.
vi.mock('@/modules/cash/components/manual-order/DualCurrencyAmount', () => ({ default: () => null }));

import CloseTableModal from '@/modules/cash/components/CloseTableModal';

const branch = {
	id: 'branch-1',
	country: 'VE',
	currency: 'USD',
	payment_methods: ['efectivo', 'card', 'pago_movil', 'bank_transfer'],
	delivery_settings: {},
	manual_order_settings: { version: 1 },
};

const v2Order = {
	id: 1925,
	shift_sequence: 200,
	manual_order_mode: 'quick_sale',
	channel: 'pickup',
	order_type: 'pickup',
	client_name: 'Holagodcode',
	payment_type: 'pendiente',
	payment_status: 'pending',
	currency: 'USD',
	subtotal: 24,
	total: 24,
	total_minor: 2400,
	payment_balance_minor: 2400,
	items: [
		{ id: 'a', name: 'Cuatro Quesos & Miel Picante', price: 10, quantity: 1 },
		{ id: 'b', name: 'La Corner Champignon', price: 14, quantity: 1 },
	],
};

const legacyOrder = {
	...v2Order,
	id: 'legacy-1',
	manual_order_mode: null,
	payment_balance_minor: null,
	total_minor: null,
};

function renderCobro(props = {}) {
	const onConfirm = props.onConfirm ?? vi.fn().mockResolvedValue(true);
	const onClose = props.onClose ?? vi.fn();
	render(
		<CloseTableModal
			isOpen
			intent="pay"
			order={v2Order}
			branch={branch}
			showNotify={() => {}}
			{...props}
			onConfirm={onConfirm}
			onClose={onClose}
		/>,
	);
	return { onConfirm, onClose };
}

const cta = () => screen.getByRole('button', { name: /Registrar pago|Confirmar/ });

describe('Cobro (CloseTableModal)', () => {
	afterEach(() => cleanup());

	it('muestra el saldo con el formato del país y no deja registrar sin método', () => {
		renderCobro();
		expect(screen.getByRole('dialog', { name: /^Cobrar\s+PDV #200$/ })).toBeInTheDocument();
		// Antes el saldo salía "USD 24.00" junto a un total "USD 24,00".
		expect(screen.getByText('Falta USD 24,00')).toBeInTheDocument();
		expect(cta()).toBeDisabled();
		expect(screen.getByText('Elige un método de pago para continuar.')).toBeInTheDocument();
	});

	it('cobra en efectivo con vuelto y envía la línea con lo recibido', async () => {
		const { onConfirm, onClose } = renderCobro();
		fireEvent.click(screen.getByRole('button', { name: /^Efectivo/ }));
		expect(screen.getByText('Cuadra exacto')).toBeInTheDocument();
		expect(cta()).toBeEnabled();

		// Intl separa código y cifra con un espacio duro; getByRole no lo normaliza.
		fireEvent.click(screen.getByRole('button', { name: /^USD\s30,00$/ }));
		expect(screen.getByText('Vuelto USD 6,00')).toBeInTheDocument();

		fireEvent.click(cta());
		await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
		const [, patch] = onConfirm.mock.calls[0];
		expect(patch.payment_lines).toHaveLength(1);
		expect(patch.payment_lines[0]).toMatchObject({ methodId: 'efectivo', amountMinor: 2400, tenderedAmountMinor: 3000 });
		await waitFor(() => expect(onClose).toHaveBeenCalled());
	});

	it('explica por qué un método en otra moneda no se puede usar sin tasa', () => {
		renderCobro();
		const pagoMovil = screen.getByRole('button', { name: /Pago móvil/ });
		expect(pagoMovil).toBeDisabled();
		expect(pagoMovil).toHaveTextContent('Falta la tasa VES/USD');
	});

	it('al dividir, la línea en cero ofrece completar con lo que falta', () => {
		renderCobro();
		fireEvent.click(screen.getByRole('button', { name: /^Efectivo/ }));
		fireEvent.click(screen.getByRole('button', { name: /^Tarjeta/ }));
		const [cashAmount] = screen.getAllByLabelText(/^Monto/);
		fireEvent.change(cashAmount, { target: { value: '10' } });
		fireEvent.blur(cashAmount);
		expect(screen.getByText('Falta USD 14,00')).toBeInTheDocument();

		fireEvent.click(screen.getByRole('button', { name: /^Resto\sUSD\s14,00$/ }));
		expect(screen.getByText('Cuadra exacto')).toBeInTheDocument();
		expect(cta()).toBeEnabled();
	});

	it('en el cobro clásico la transferencia exige comprobante', () => {
		renderCobro({ order: legacyOrder });
		fireEvent.click(screen.getByRole('button', { name: /^Tarjeta/ }));
		expect(cta()).toBeEnabled();

		fireEvent.click(screen.getByRole('button', { name: /^Transferencia/ }));
		expect(screen.getByText('Obligatorio')).toBeInTheDocument();
		expect(cta()).toBeDisabled();
		expect(screen.getByText('Adjunta el comprobante para registrar el pago.')).toBeInTheDocument();
	});

	it('en el cobro clásico en efectivo pide lo recibido antes de registrar', () => {
		renderCobro({ order: legacyOrder });
		fireEvent.click(screen.getByRole('button', { name: /^Efectivo/ }));
		expect(cta()).toBeDisabled();
		fireEvent.click(screen.getByRole('button', { name: 'Exacto' }));
		expect(cta()).toBeEnabled();
	});

	it('si el pedido ya está pagado solo pide confirmar la entrega', () => {
		renderCobro({
			intent: 'close',
			order: { ...v2Order, payment_type: 'tienda', payment_status: 'paid', payment_balance_minor: 0 },
		});
		expect(screen.getByText('Pago registrado')).toBeInTheDocument();
		expect(screen.queryByRole('group', { name: 'Métodos de pago' })).not.toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Confirmar entrega' })).toBeEnabled();
	});

	it('no se cierra al soltar sobre el fondo un arrastre que empezó dentro', () => {
		const { onClose } = renderCobro();
		const overlay = document.querySelector('.cobro-overlay');
		fireEvent.pointerDown(screen.getByRole('dialog'));
		fireEvent.click(overlay);
		expect(onClose).not.toHaveBeenCalled();

		fireEvent.pointerDown(overlay);
		fireEvent.click(overlay);
		expect(onClose).toHaveBeenCalledTimes(1);
	});
});
