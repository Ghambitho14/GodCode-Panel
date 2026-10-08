import { supabase } from '@/integrations/supabase';

/**
 * Cupones por correo y remitente de la empresa (Edge Function `coupon-emails`).
 * El remitente se lee aquí, pero lo configura soporte desde el super admin de GodCode.
 *
 * El correo de cada cliente y la API key de Resend nunca llegan al navegador: el
 * panel manda ids de cuentas y recibe un resultado por cuenta.
 */

const FN_NAME = 'coupon-emails';
/** La función admite 50 por llamada; en tandas más chicas la barra de progreso avanza. */
export const COUPON_EMAIL_BATCH_SIZE = 20;

const SERVER_ERRORS = {
	email_sender_key_missing: 'Falta configurar la llave de cifrado del correo en el servidor.',
	email_unsubscribe_secret_missing: 'Falta configurar el enlace de baja en el servidor.',
};

/**
 * `supabase.functions.invoke` deja el cuerpo de un 4xx en `error.context` (un Response):
 * se lee para mostrar el mensaje real («Elige al menos un cliente», etc.).
 */
async function invoke(action, payload, fallbackMessage) {
	const response = await supabase.functions.invoke(FN_NAME, {
		method: 'POST',
		body: { action, ...payload },
	});
	if (!response.error) return response.data ?? {};

	let message = null;
	const ctx = response.error.context;
	// 404 de la puerta de Supabase: la función no existe en el servidor (sin desplegar).
	if (ctx?.status === 404) throw new Error('El envío de cupones por correo todavía no está activado en el servidor.');
	if (ctx && typeof ctx.json === 'function') {
		try {
			message = (await ctx.json())?.error ?? null;
		} catch {
			// Sin cuerpo JSON: queda el mensaje genérico.
		}
	}
	const raw = String(message || response.data?.error || response.error.message || fallbackMessage);
	throw new Error(SERVER_ERRORS[raw] ?? raw);
}

/**
 * @returns {Promise<{ mode: 'own'|'godcode', from: string, replyTo: string|null, customDomain: string|null, canConfigure: boolean, ready: boolean, own: null|{ fromEmail: string, fromName: string, replyTo: string, apiKeyLast4: string, verifiedAt: string|null, lastError: string|null } }>}
 */
export function fetchCouponSenderStatus() {
	return invoke('sender-status', {}, 'No se pudo leer el remitente de los cupones');
}

/**
 * @param {{ discountType: 'percent'|'fixed_amount', discountValue: number, minOrderSubtotal?: number, validUntil: string, message?: string }} draft
 * @returns {Promise<{ subject: string, html: string, from: string }>}
 */
export function previewCouponEmail(draft) {
	return invoke('preview', draft, 'No se pudo armar la vista previa');
}

/**
 * Manda el cupón en tandas. Cada tanda reusa el mismo `campaignId`: si una se
 * reintenta, la función no le manda un segundo cupón a quien ya lo recibió.
 * @param {{ campaignId: string, accountIds: string[], draft: object, onProgress?: (done: number, total: number) => void }} params
 * @returns {Promise<Array<{ accountId: string, status: 'sent'|'skipped'|'failed', code?: string, reason?: string }>>}
 */
export async function sendCouponEmails({ campaignId, accountIds, draft, onProgress }) {
	const ids = [...new Set((accountIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean))];
	const results = [];
	for (let i = 0; i < ids.length; i += COUPON_EMAIL_BATCH_SIZE) {
		const batch = ids.slice(i, i + COUPON_EMAIL_BATCH_SIZE);
		try {
			const data = await invoke('send-coupon', { campaignId, accountIds: batch, ...draft }, 'No se pudo enviar el cupón');
			results.push(...(Array.isArray(data.results) ? data.results : []));
		} catch (err) {
			// Una tanda caída no borra lo ya enviado: sus cuentas salen como error.
			const reason = err instanceof Error ? err.message : 'No se pudo enviar';
			batch.forEach((accountId) => results.push({ accountId, status: 'failed', reason }));
		}
		onProgress?.(Math.min(i + batch.length, ids.length), ids.length);
	}
	return results;
}
