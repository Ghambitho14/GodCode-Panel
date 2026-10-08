import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();

vi.mock('@/integrations/supabase', () => ({
	supabase: { functions: { invoke: (...args) => invoke(...args) } },
}));

const { sendCouponEmails, saveCouponSender, COUPON_EMAIL_BATCH_SIZE } = await import(
	'@/modules/cash/services/couponEmailService'
);

const ids = (n) => Array.from({ length: n }, (_, i) => `acc-${i + 1}`);
const draft = { discountType: 'percent', discountValue: 10, validUntil: '2026-10-20T03:00:00.000Z' };

beforeEach(() => {
	invoke.mockReset();
});

describe('couponEmailService', () => {
	it('manda en tandas con el mismo campaignId y avisa el avance', async () => {
		invoke.mockImplementation(async (_fn, { body }) => ({
			data: { results: body.accountIds.map((accountId) => ({ accountId, status: 'sent', code: 'X-AAAAAA' })) },
			error: null,
		}));
		const progress = [];

		const results = await sendCouponEmails({
			campaignId: 'camp-1',
			accountIds: ids(45),
			draft,
			onProgress: (done, total) => progress.push(`${done}/${total}`),
		});

		expect(COUPON_EMAIL_BATCH_SIZE).toBe(20);
		expect(invoke).toHaveBeenCalledTimes(3);
		const bodies = invoke.mock.calls.map(([, opts]) => opts.body);
		expect(bodies.map((b) => b.accountIds.length)).toEqual([20, 20, 5]);
		expect(new Set(bodies.map((b) => b.campaignId))).toEqual(new Set(['camp-1']));
		expect(bodies[0]).toMatchObject({ action: 'send-coupon', discountType: 'percent', discountValue: 10 });
		expect(progress).toEqual(['20/45', '40/45', '45/45']);
		expect(results).toHaveLength(45);
	});

	it('una tanda caída marca sus cuentas como error y sigue con las demás', async () => {
		let call = 0;
		invoke.mockImplementation(async (_fn, { body }) => {
			call += 1;
			if (call === 1) return { data: null, error: { message: 'Edge Function returned a non-2xx status code' } };
			return { data: { results: body.accountIds.map((accountId) => ({ accountId, status: 'sent' })) }, error: null };
		});

		const results = await sendCouponEmails({ campaignId: 'camp-1', accountIds: ids(25), draft });

		expect(results.filter((r) => r.status === 'failed')).toHaveLength(20);
		expect(results.filter((r) => r.status === 'sent')).toHaveLength(5);
	});

	it('si la función no está desplegada lo dice en vez del error genérico', async () => {
		invoke.mockResolvedValue({
			data: null,
			error: { message: 'Edge Function returned a non-2xx status code', context: { status: 404, json: async () => ({}) } },
		});

		await expect(saveCouponSender({ apiKey: 'x', fromEmail: 'a@b.cl' })).rejects.toThrow(
			'El envío de cupones por correo todavía no está activado en el servidor.',
		);
	});

	it('muestra el error real que mandó la función', async () => {
		invoke.mockResolvedValue({
			data: null,
			error: {
				message: 'Edge Function returned a non-2xx status code',
				context: { json: async () => ({ error: 'La API key de Resend empieza con «re_»' }) },
			},
		});

		await expect(saveCouponSender({ apiKey: 'x', fromEmail: 'a@b.cl' })).rejects.toThrow(
			'La API key de Resend empieza con «re_»',
		);
	});
});
