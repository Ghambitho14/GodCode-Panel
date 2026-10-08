import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchCouponSenderStatus = vi.fn();
const sendCouponEmails = vi.fn();
const previewCouponEmail = vi.fn();

vi.mock('@/modules/cash/services/couponEmailService', () => ({
	fetchCouponSenderStatus: (...args) => fetchCouponSenderStatus(...args),
	sendCouponEmails: (...args) => sendCouponEmails(...args),
	previewCouponEmail: (...args) => previewCouponEmail(...args),
}));

vi.mock('@/modules/cash/hooks/useBranchMoney', () => ({
	useBranchMoney: () => ({ formatMoney: (value) => `$${value}`, locale: 'es-CL' }),
}));

const { default: SendCouponEmailModal } = await import('@/modules/cash/components/SendCouponEmailModal');

const RECIPIENTS = [
	{ accountId: 'acc-1', name: 'Ada', canReceiveEmail: true, emailOptOut: false },
	{ accountId: 'acc-2', name: 'Bea', canReceiveEmail: true, emailOptOut: false },
	{ accountId: 'acc-3', name: 'Carla', canReceiveEmail: true, emailOptOut: true },
];

beforeEach(() => {
	fetchCouponSenderStatus.mockResolvedValue({ ready: true, mode: 'godcode', from: '"Oishi Sushi" <cupones@godcode.me>' });
	sendCouponEmails.mockReset();
	previewCouponEmail.mockReset();
});

afterEach(() => cleanup());

const open = (props = {}) =>
	render(
		<SendCouponEmailModal open recipients={RECIPIENTS} onClose={() => {}} showNotify={() => {}} {...props} />,
	);

describe('SendCouponEmailModal', () => {
	it('muestra desde qué correo sale y avisa a quién se omite', async () => {
		open();

		expect(await screen.findByText('"Oishi Sushi" <cupones@godcode.me>')).toBeInTheDocument();
		expect(screen.getByText('Carla no recibe correos y se omite.')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Enviar a 2' })).toBeEnabled();
	});

	it('manda solo a quienes pueden recibir y muestra el resultado de cada uno', async () => {
		sendCouponEmails.mockResolvedValue([
			{ accountId: 'acc-1', status: 'sent', code: 'OISHI-7KQ2MX' },
			{ accountId: 'acc-2', status: 'failed', reason: 'Resend respondió 500' },
		]);
		const onSent = vi.fn();
		open({ onSent });
		await screen.findByText('"Oishi Sushi" <cupones@godcode.me>');

		fireEvent.change(screen.getByLabelText('Porcentaje (%)'), { target: { value: '15' } });
		fireEvent.click(screen.getByRole('button', { name: 'Enviar a 2' }));

		await waitFor(() => expect(sendCouponEmails).toHaveBeenCalledTimes(1));
		const [{ campaignId, accountIds, draft }] = sendCouponEmails.mock.calls[0];
		expect(campaignId).toMatch(/^[0-9a-f-]{36}$/);
		expect(accountIds).toEqual(['acc-1', 'acc-2']);
		expect(draft).toMatchObject({ discountType: 'percent', discountValue: 15, minOrderSubtotal: 0, message: '' });
		expect(new Date(draft.validUntil).getTime()).toBeGreaterThan(Date.now());

		expect(await screen.findByText('Enviado · OISHI-7KQ2MX')).toBeInTheDocument();
		expect(screen.getByText('Resend respondió 500')).toBeInTheDocument();
		expect(screen.getByText('Se dio de baja de los correos')).toBeInTheDocument();
		expect(onSent).toHaveBeenCalled();
	});

	it('sin correo configurado en el servidor no deja enviar', async () => {
		fetchCouponSenderStatus.mockResolvedValue({ ready: false, mode: 'godcode', from: '' });
		open();

		expect(await screen.findByText(/todavía no está configurado/)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Enviar a 2' })).toBeDisabled();
	});
});
