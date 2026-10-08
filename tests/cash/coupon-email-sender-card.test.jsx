import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchCouponSenderStatus = vi.fn();
const setActiveTab = vi.fn();
const admin = { userRole: 'admin', canAccessTab: () => true };

vi.mock('@/modules/cash/services/couponEmailService', () => ({
	fetchCouponSenderStatus: (...args) => fetchCouponSenderStatus(...args),
}));
vi.mock('@/modules/cash/admin/pages/AdminProvider', () => ({
	useAdmin: () => ({ ...admin, setActiveTab }),
}));
vi.mock('@/modules/cash/hooks/useBranchMoney', () => ({
	useBranchMoney: () => ({ locale: 'es-CL' }),
}));
vi.mock('@/modules/cash/services/ticketsService', () => ({
	listTickets: vi.fn(async () => []),
	createTicket: vi.fn(),
	listMessages: vi.fn(async () => []),
	sendMessage: vi.fn(),
}));

const { default: CouponEmailSenderCard } = await import('@/modules/cash/components/CouponEmailSenderCard');
const { default: TenantTicketsPanel } = await import('@/modules/cash/components/TenantTicketsPanel');
const { clearSupportTicketDraft, peekSupportTicketDraft } = await import('@/modules/cash/utils/supportTicketDraft');

const WITH_DOMAIN = {
	ready: true,
	mode: 'godcode',
	from: '"Oishi Sushi" <cupones@godcode.me>',
	customDomain: 'oishisushi.shop',
	own: null,
};

beforeEach(() => {
	fetchCouponSenderStatus.mockResolvedValue(WITH_DOMAIN);
	setActiveTab.mockReset();
	admin.userRole = 'admin';
	admin.canAccessTab = () => true;
	clearSupportTicketDraft();
});

afterEach(() => cleanup());

describe('CouponEmailSenderCard', () => {
	it('ya no tiene el formulario de Resend', async () => {
		render(<CouponEmailSenderCard />);

		expect(await screen.findByText('"Oishi Sushi" <cupones@godcode.me>')).toBeInTheDocument();
		expect(screen.queryByLabelText('API key de Resend')).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /Conectar Resend|Probar y guardar/ })).not.toBeInTheDocument();
	});

	it('«Pedir ayuda a Soporte» deja el ticket escrito y abre Soporte', async () => {
		render(<CouponEmailSenderCard />);

		fireEvent.click(await screen.findByRole('button', { name: 'Pedir ayuda a Soporte' }));

		expect(setActiveTab).toHaveBeenCalledWith('module:tickets');
		expect(peekSupportTicketDraft()).toMatchObject({
			subject: 'Cupones desde mi dominio (oishisushi.shop)',
			category: 'technical',
		});
	});

	it('sin dominio propio no ofrece ayuda: no hay nada que configurar', async () => {
		fetchCouponSenderStatus.mockResolvedValue({ ...WITH_DOMAIN, customDomain: null });
		render(<CouponEmailSenderCard />);

		expect(await screen.findByText('"Oishi Sushi" <cupones@godcode.me>')).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Pedir ayuda a Soporte' })).not.toBeInTheDocument();
	});

	it('sin acceso a Soporte no muestra el botón', async () => {
		admin.canAccessTab = (tab) => tab !== 'module:tickets';
		render(<CouponEmailSenderCard />);

		expect(await screen.findByText('"Oishi Sushi" <cupones@godcode.me>')).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Pedir ayuda a Soporte' })).not.toBeInTheDocument();
	});

	it('al CEO le muestra el enlace a su cuenta GodCode', async () => {
		admin.userRole = 'ceo';
		render(<CouponEmailSenderCard />);

		const link = await screen.findByRole('link', { name: /Configurar en mi cuenta/ });
		expect(link).toHaveAttribute('href', 'https://www.godcode.me/cuenta?tab=correo');
	});
});

describe('Soporte con el ticket ya escrito', () => {
	it('llena asunto, descripción y categoría, y después olvida el borrador', async () => {
		render(<CouponEmailSenderCard />);
		fireEvent.click(await screen.findByRole('button', { name: 'Pedir ayuda a Soporte' }));
		cleanup();

		render(<TenantTicketsPanel showNotify={() => {}} />);

		expect(await screen.findByLabelText('Asunto')).toHaveValue('Cupones desde mi dominio (oishisushi.shop)');
		expect(screen.getByLabelText('Descripción').value).toContain('oishisushi.shop');
		expect(screen.getByLabelText('Categoría')).toHaveValue('technical');
		expect(screen.getByText(/No pegues tu API key de Resend/)).toBeInTheDocument();
		expect(peekSupportTicketDraft()).toBeNull();

		cleanup();
		render(<TenantTicketsPanel showNotify={() => {}} />);
		expect(await screen.findByLabelText('Asunto')).toHaveValue('');
	});
});
