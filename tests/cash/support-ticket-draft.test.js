import { afterEach, describe, expect, it } from 'vitest';

import {
	buildCouponSenderTicketDraft,
	clearSupportTicketDraft,
	peekSupportTicketDraft,
	queueSupportTicketDraft,
} from '@/modules/cash/utils/supportTicketDraft';

afterEach(() => {
	clearSupportTicketDraft();
});

describe('supportTicketDraft', () => {
	it('mirar no borra el borrador; borrar sí', () => {
		queueSupportTicketDraft({ subject: 'Hola', description: 'Texto', category: 'technical' });

		expect(peekSupportTicketDraft()).toEqual({ subject: 'Hola', description: 'Texto', category: 'technical' });
		expect(peekSupportTicketDraft()).not.toBeNull();

		clearSupportTicketDraft();
		expect(peekSupportTicketDraft()).toBeNull();
	});

	it('guarda una copia: cambiar el objeto original no cambia el borrador', () => {
		const draft = { subject: 'A', description: 'B' };
		queueSupportTicketDraft(draft);
		draft.subject = 'Otro';

		expect(peekSupportTicketDraft().subject).toBe('A');
	});
});

describe('buildCouponSenderTicketDraft', () => {
	const base = { customDomain: 'oishisushi.shop', from: '"Oishi Sushi" <cupones@godcode.me>', mode: 'godcode', own: null };

	it('pide conectar el dominio propio, en categoría técnica', () => {
		const draft = buildCouponSenderTicketDraft(base);

		expect(draft.subject).toBe('Cupones desde mi dominio (oishisushi.shop)');
		expect(draft.category).toBe('technical');
		expect(draft.description).toContain('oishisushi.shop');
		expect(draft.description).toContain('cupones@godcode.me');
		expect(draft.description).toContain('¿Me ayudan a conectarlo?');
	});

	it('el aviso de no pegar la API key va aparte, no dentro del ticket', () => {
		const draft = buildCouponSenderTicketDraft(base);

		expect(draft.notice).toMatch(/No pegues tu API key/);
		expect(draft.description).not.toMatch(/API key/);
	});

	it('con Resend propio fallando, suma el último error', () => {
		const draft = buildCouponSenderTicketDraft({
			...base,
			mode: 'own',
			from: 'cupones@oishisushi.shop',
			own: { lastError: 'API key is invalid' },
		});

		expect(draft.subject).toBe('Correo de los cupones (oishisushi.shop)');
		expect(draft.description).toContain('Último error de Resend: API key is invalid');
	});

	it('recorta el asunto a 120 caracteres', () => {
		const draft = buildCouponSenderTicketDraft({ ...base, customDomain: `${'a'.repeat(200)}.shop` });

		expect(draft.subject).toHaveLength(120);
	});
});
