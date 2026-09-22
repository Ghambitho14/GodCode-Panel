import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();

vi.mock('@/integrations/supabase', () => ({
	supabase: { functions: { invoke: (...args) => invoke(...args) } },
	TABLES: {},
}));

import { clearRevealedClientPii, revealOrderContact, revealOrdersContact } from '@/modules/cash/services/clientPiiService';
import { deliveryAddressLines, resolveOrderClientPhoneForDisplay, resolveOrderClientRutForDisplay } from '@/shared/utils/orderUtils';
import { PII_MASK, maskSealedPii, orderHasSealedContact } from '@/shared/utils/sealedPii';

const SELLADO = 'enc:v1:AAAA';

const pedidoDeCuenta = {
	id: 1812,
	client_name: 'Jhon B.',
	client_phone: `${SELLADO}tel`,
	client_rut: `${SELLADO}doc`,
	delivery_address: { sealed: `${SELLADO}dir`, named_area_label: 'Centro', delivery_provider: 'uber_direct' },
};
const compraRapida = { id: 1811, client_name: 'Pedro', client_phone: '+56 9 2222 2222', client_rut: '12.345.678-5', delivery_address: null };

beforeEach(() => {
	invoke.mockReset();
	clearRevealedClientPii();
});

describe('pedido de un cliente con cuenta sin revelar', () => {
	it('se reconoce y se muestra enmascarado, nunca el texto cifrado', () => {
		expect(orderHasSealedContact(pedidoDeCuenta)).toBe(true);
		expect(orderHasSealedContact(compraRapida)).toBe(false);
		expect(resolveOrderClientPhoneForDisplay(pedidoDeCuenta)).toBe(PII_MASK);
		expect(resolveOrderClientRutForDisplay(pedidoDeCuenta)).toBe(PII_MASK);
		expect(deliveryAddressLines(pedidoDeCuenta.delivery_address)).toEqual(['Centro', `Dirección ${PII_MASK}`]);
		expect(maskSealedPii(compraRapida.client_phone)).toBe(compraRapida.client_phone);
	});
});

describe('revealOrdersContact', () => {
	it('no llama a la función por una compra rápida', async () => {
		await expect(revealOrdersContact([compraRapida])).resolves.toEqual([compraRapida]);
		expect(invoke).not.toHaveBeenCalled();
	});

	it('revela teléfono, documento y dirección, y conserva lo operativo', async () => {
		invoke.mockResolvedValue({
			data: {
				orders: [{
					id: 1812,
					phone: '+58 412 342 3424',
					rut: 'V-27493256',
					deliveryAddress: { address: 'Av. Principal 123', named_area_label: 'Centro', delivery_provider: 'uber_direct' },
				}],
			},
			error: null,
		});

		const revealed = await revealOrderContact(pedidoDeCuenta);
		expect(revealed).toMatchObject({
			id: 1812,
			client_name: 'Jhon B.',
			client_phone: '+58 412 342 3424',
			client_rut: 'V-27493256',
			delivery_address: { address: 'Av. Principal 123', delivery_provider: 'uber_direct' },
		});
		expect(invoke).toHaveBeenCalledWith('client-pii', {
			method: 'POST',
			body: { action: 'reveal-orders', orderIds: ['1812'] },
		});
	});

	it('recuerda lo revelado en memoria y no vuelve a pedirlo', async () => {
		invoke.mockResolvedValue({ data: { orders: [{ id: 1812, phone: 'x', rut: 'y', deliveryAddress: null }] }, error: null });
		await revealOrderContact(pedidoDeCuenta);
		await revealOrderContact(pedidoDeCuenta);
		expect(invoke).toHaveBeenCalledTimes(1);
	});

	it('pide de a 50 pedidos como máximo', async () => {
		const muchos = Array.from({ length: 120 }, (_, i) => ({ ...pedidoDeCuenta, id: i + 1 }));
		invoke.mockImplementation(async (_fn, { body }) => ({
			data: { orders: body.orderIds.map((id) => ({ id: Number(id), phone: 'p', rut: 'r', deliveryAddress: null })) },
			error: null,
		}));
		const out = await revealOrdersContact(muchos);
		expect(invoke).toHaveBeenCalledTimes(3);
		expect(out.every((o) => o.client_phone === 'p')).toBe(true);
	});

	it('si la función falla, lanza y el pedido sigue enmascarado', async () => {
		invoke.mockResolvedValue({ data: { error: 'pii_key_missing' }, error: { message: 'Edge Function returned a non-2xx status code' } });
		await expect(revealOrderContact(pedidoDeCuenta)).rejects.toThrow('pii_key_missing');
		expect(resolveOrderClientPhoneForDisplay(pedidoDeCuenta)).toBe(PII_MASK);
	});
});
