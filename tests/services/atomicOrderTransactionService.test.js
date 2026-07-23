import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock('@/integrations/supabase', () => ({
	supabase: { rpc: rpcMock },
}));

vi.mock('@/shared/utils/supabaseStorage', () => ({
	createClientUuid: () => '00000000-0000-4000-8000-000000000001',
}));

import { atomicOrderTransactionService } from '@/modules/cash/services/atomicOrderTransactionService';

describe('atomicOrderTransactionService', () => {
	beforeEach(() => {
		rpcMock.mockReset();
	});

	it('crea pedido y caja esperando una única promesa RPC', async () => {
		const confirmed = {
			order: { id: 91, total: 10490, payment_status: 'paid' },
			cashRegistered: true,
			idempotentReplay: false,
		};
		rpcMock.mockResolvedValueOnce({ data: confirmed, error: null });

		const input = {
			p_client_request_id: '00000000-0000-4000-8000-000000000091',
			p_total: 10490,
			p_total_minor: 10490,
		};
		await expect(atomicOrderTransactionService.create(input)).resolves.toEqual(confirmed);
		expect(rpcMock).toHaveBeenCalledTimes(1);
		expect(rpcMock).toHaveBeenCalledWith('create_manual_order_atomic_v1', input);
	});

	it('cobra y cambia el estado en una única RPC', async () => {
		rpcMock.mockResolvedValueOnce({
			data: { order: { id: 91, status: 'picked_up', payment_status: 'paid' } },
			error: null,
		});

		const result = await atomicOrderTransactionService.settleAndTransition(
			{ id: 91, payment_type: 'tarjeta', payment_breakdown: null },
			{
				payment_type: 'tarjeta',
				payment_breakdown: { cash: 0, card: 10490, online: 0 },
			},
			'picked_up',
			'00000000-0000-4000-8000-000000000091',
		);

		expect(result).toMatchObject({ id: 91, status: 'picked_up', payment_status: 'paid' });
		expect(rpcMock).toHaveBeenCalledTimes(1);
		expect(rpcMock).toHaveBeenCalledWith(
			'settle_and_transition_order_atomic_v1',
			expect.objectContaining({
				p_order_id: 91,
				p_target_status: 'picked_up',
				p_payment_type: 'tarjeta',
				p_payment_breakdown: { cash: 0, card: 10490, online: 0 },
			}),
		);
	});

	it('rechaza toda la operación cuando caja no está abierta', async () => {
		rpcMock.mockResolvedValueOnce({
			data: null,
			error: { message: 'cash_shift_required' },
		});

		await expect(atomicOrderTransactionService.create({})).rejects.toMatchObject({
			code: 'cash_shift_required',
			message: 'Debes abrir la caja de esta sucursal antes de cobrar.',
		});
		expect(rpcMock).toHaveBeenCalledTimes(1);
	});

	it('reintenta un fallo de red con la misma llave idempotente', async () => {
		rpcMock
			.mockResolvedValueOnce({ data: null, error: { code: 'PGRST000', message: 'fetch failed' } })
			.mockResolvedValueOnce({
				data: { order: { id: 91 }, idempotentReplay: true, cashRegistered: true },
				error: null,
			});
		const input = {
			p_client_request_id: '00000000-0000-4000-8000-000000000091',
			p_total: 10490,
		};

		const result = await atomicOrderTransactionService.create(input);

		expect(result.idempotentReplay).toBe(true);
		expect(rpcMock).toHaveBeenCalledTimes(2);
		expect(rpcMock.mock.calls[0][1]).toBe(input);
		expect(rpcMock.mock.calls[1][1]).toBe(input);
	});
});
