/**
 * Ticket ya escrito para la pestaña Soporte.
 *
 * Una pantalla deja el borrador y cambia a Soporte; `TenantTicketsPanel` lo lee al
 * montarse y lo borra en su efecto de montaje. Leer y borrar van separados porque en
 * StrictMode React llama dos veces a los inicializadores de `useState`.
 */

const SUBJECT_MAX = 120;

let pendingDraft = null;

/**
 * `notice` es un aviso que se muestra junto al formulario; no va dentro del ticket.
 * @param {{ subject: string, description: string, category?: string, notice?: string }} draft
 */
export function queueSupportTicketDraft(draft) {
	pendingDraft = draft ? { ...draft } : null;
}

/** @returns {{ subject: string, description: string, category?: string, notice?: string } | null} */
export function peekSupportTicketDraft() {
	return pendingDraft;
}

export function clearSupportTicketDraft() {
	pendingDraft = null;
}

/**
 * Pedido de ayuda para que los cupones salgan desde el dominio propio del negocio.
 * @param {{ customDomain: string|null, from?: string, mode?: string, own?: { lastError?: string|null } | null }} status
 */
export function buildCouponSenderTicketDraft(status) {
	const domain = String(status?.customDomain ?? '').trim();
	const lastError = String(status?.own?.lastError ?? '').trim();
	const usingOwn = status?.mode === 'own';

	const subject = (usingOwn || lastError ? `Correo de los cupones (${domain})` : `Cupones desde mi dominio (${domain})`)
		.slice(0, SUBJECT_MAX);

	const lines = [];
	if (usingOwn) {
		lines.push(`Necesito ayuda con el correo de los cupones de mi dominio ${domain} (hoy salen desde ${status.from}).`);
	} else {
		lines.push(
			`Quiero que los cupones que mando a mis clientes salgan desde mi dominio ${domain}`
				+ (status?.from ? ` (hoy salen desde ${status.from})` : '')
				+ '. ¿Me ayudan a conectarlo?',
		);
	}
	if (lastError) lines.push('', `Último error de Resend: ${lastError}`);

	return {
		subject,
		description: lines.join('\n'),
		category: 'technical',
		notice: 'No pegues tu API key de Resend en el ticket: te decimos cómo pasárnosla de forma segura.',
	};
}
