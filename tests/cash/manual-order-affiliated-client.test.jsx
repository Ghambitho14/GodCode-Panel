import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';

import ClientForm from '@/modules/cash/components/manual-order/ClientForm';
import { useManualOrderCheckoutFlow } from '@/modules/cash/components/manual-order/ManualOrderCheckout';
import { useManualOrderForm } from '@/modules/cash/hooks/manual-order/useManualOrderForm';

const fetchMenuClientAccountsCached = vi.fn();

vi.mock('@/modules/cash/services/menuAccountsService', async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		fetchMenuClientAccountsCached: (...args) => fetchMenuClientAccountsCached(...args),
	};
});

vi.mock('@/modules/cash/admin/pages/AdminProvider', () => ({
	useAdmin: () => ({ companyProfile: { country_code: 'CL' }, companyId: 'company-1', selectedBranch: null }),
}));

vi.mock('@/modules/cash/hooks/useBranchMoney', () => ({
	useBranchMoney: () => ({ formatMoney: (value) => `$${value}`, locale: 'es-CL' }),
}));

vi.mock('@/modules/cash/services/geocodeService', () => ({
	geocodeAddress: vi.fn(async () => ({ ok: false, message: '' })),
}));

vi.mock('@/modules/cash/services/placesService', () => ({
	geocodeToCoords: vi.fn(async () => null),
	reverseGeocodeLocality: vi.fn(async () => ({ state: '' })),
}));

const AFILIADO = { id: 'cli-1', name: 'Ada Registrada', phone: '+56 9 1111 1111', rut: '11.111.111-1' };
const RAPIDO = { id: 'cli-2', name: 'Pedro Rápido', phone: '+56 9 2222 2222', rut: '' };

const baseOrder = {
	order_type: 'pickup',
	local_fulfillment_mode: 'retiro',
	mesa_party_mode: 'cliente',
	client_kind: 'quick',
	client_name: '',
	client_rut: '',
	client_phone: '',
	selected_client_id: '',
	delivery_address: '',
	delivery_reference: '',
	delivery_km: '',
	delivery_fee: 0,
	delivery_named_area_id: '',
	total: 10000,
	items_subtotal: 10000,
};

const noop = () => {};

function renderClientForm(overrides = {}, handlers = {}) {
	return render(
		<ClientForm
			manualOrder={{ ...baseOrder, ...overrides }}
			branchDeliveryCfg={null}
			clients={[AFILIADO, RAPIDO]}
			updateOrderType={noop}
			updateLocalFulfillmentMode={noop}
			updateMesaPartyMode={noop}
			updateDeliveryAddress={noop}
			updateDeliveryReference={noop}
			updateDeliveryKm={noop}
			updateDeliveryFee={noop}
			updateDeliveryNamedAreaId={noop}
			updateClientName={noop}
			applyClientRecord={noop}
			handleRutChange={noop}
			handlePhoneChange={noop}
			rutValid
			phoneValid
			getInputStyle={() => ({})}
			branch={{ id: 'branch-1', company_id: 'company-1' }}
			showNotify={noop}
			updateClientKind={handlers.updateClientKind ?? noop}
			{...handlers.extraProps}
		/>,
	);
}

// Vitest corre sin `globals`, así que el autolimpiado de testing-library no entra solo.
afterEach(cleanup);

beforeEach(() => {
	fetchMenuClientAccountsCached.mockReset();
	fetchMenuClientAccountsCached.mockResolvedValue({
		ok: true,
		accounts: [{ id: 'acc-1', clientId: AFILIADO.id, isActive: true, lastLoginAt: null, createdAt: null }],
		error: null,
	});
});

/**
 * El paso de cliente arranca siempre en comprador rápido. El interruptor de
 * cliente afiliado cambia la fuente: solo fichas con cuenta en el menú, elegidas
 * de una lista, sin crear ni completar datos a mano.
 */
describe('Pedido manual: comprador rápido vs cliente afiliado', () => {
	it('abre en comprador rápido con el interruptor apagado', async () => {
		renderClientForm();

		const toggle = await screen.findByRole('switch', { name: 'Cliente afiliado' });
		expect(toggle.getAttribute('aria-checked')).toBe('false');
		expect(screen.getByPlaceholderText('Buscar o escribir nombre')).toBeTruthy();
	});

	it('el interruptor pide el modo afiliado', async () => {
		const updateClientKind = vi.fn();
		renderClientForm({}, { updateClientKind });

		fireEvent.click(await screen.findByRole('switch', { name: 'Cliente afiliado' }));

		expect(updateClientKind).toHaveBeenCalledWith('affiliated');
	});

	it('en modo afiliado solo sugiere fichas con cuenta y esconde los datos manuales', async () => {
		renderClientForm({ client_kind: 'affiliated' });

		const search = await screen.findByPlaceholderText('Buscar cliente con cuenta');
		fireEvent.focus(search);

		expect(await screen.findByText('Ada Registrada')).toBeTruthy();
		expect(screen.queryByText('Pedro Rápido')).toBeNull();
		// El contacto sale de la ficha de la cuenta: nada de teclearlo aquí.
		expect(screen.queryByRole('switch', { name: 'Teléfono' })).toBeNull();
		expect(screen.getByText('Elige un cliente de la lista para continuar.')).toBeTruthy();
	});

	it('con un afiliado elegido muestra sus datos y deja cambiarlo', async () => {
		renderClientForm({
			client_kind: 'affiliated',
			selected_client_id: AFILIADO.id,
			client_name: AFILIADO.name,
		});

		expect(await screen.findByText(`${AFILIADO.rut} · ${AFILIADO.phone}`)).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Cambiar' })).toBeTruthy();
	});
});

describe('useManualOrderForm: modo de cliente', () => {
	it('arranca en comprador rápido y limpia la identidad al cruzar de modo', async () => {
		const { result } = renderHook(() => useManualOrderForm(null, 'CL', {}, false));

		expect(result.current.form.client_kind).toBe('quick');

		await act(async () => {
			result.current.updateClientName('Pedro a mano');
			result.current.setIncludeDocument(true);
		});
		expect(result.current.form.client_name).toBe('Pedro a mano');

		await act(async () => {
			result.current.updateClientKind('affiliated');
		});

		expect(result.current.form.client_kind).toBe('affiliated');
		expect(result.current.form.client_name).toBe('');
		expect(result.current.form.selected_client_id).toBe('');
		expect(result.current.includeDocument).toBe(false);
	});
});

const flowArgs = (manualOrder) => ({
	manualOrder: { ...baseOrder, items: [{ id: 'p1', quantity: 1 }], ...manualOrder },
	couponPreview: null,
	branchDeliveryCfg: null,
	branchDeliveryCfgLoading: false,
	branchConfigError: null,
	effectiveOpenMesaMode: false,
	openMesaMode: false,
	openMesaChargeNow: false,
	isEditMode: false,
	rutValid: true,
	phoneValid: true,
	orderStep: 2,
	setOrderStep: noop,
	wizardStepCount: 3,
	isCompactNav: false,
	showClassicPaymentStep: true,
	showNotify: noop,
});

/** El paso no avanza con un nombre escrito: en modo afiliado hace falta la ficha. */
describe('Pedido manual: el modo afiliado exige elegir cliente', () => {
	it('bloquea el paso mientras no haya un afiliado seleccionado', () => {
		const { result } = renderHook(() => useManualOrderCheckoutFlow(flowArgs({
			client_kind: 'affiliated',
			client_name: 'Ada Registrada',
			selected_client_id: '',
		})));

		expect(result.current.isClientStepValid()).toBe(false);
	});

	it('lo libera al elegir la ficha con cuenta', () => {
		const { result } = renderHook(() => useManualOrderCheckoutFlow(flowArgs({
			client_kind: 'affiliated',
			client_name: 'Ada Registrada',
			selected_client_id: AFILIADO.id,
		})));

		expect(result.current.isClientStepValid()).toBe(true);
	});

	it('no le pide nada de eso al comprador rápido', () => {
		const { result } = renderHook(() => useManualOrderCheckoutFlow(flowArgs({
			client_kind: 'quick',
			client_name: 'Pedro a mano',
			selected_client_id: '',
		})));

		expect(result.current.isClientStepValid()).toBe(true);
	});
});
