import { monitor } from '@/shared/monitor';

/**
 * Suscribe un canal Supabase Realtime registrando el estado en el monitor interno.
 *
 * @param {ReturnType<import('@supabase/supabase-js').SupabaseClient['channel']>} channel
 * @param {{ name: string, context?: Record<string, unknown> }} meta
 * @returns {typeof channel}
 */
export function subscribeMonitored(channel, meta) {
	channel.subscribe((status, err) => {
		const level = status === 'SUBSCRIBED' ? 'info' : 'warn';
		monitor[level]('realtime', String(status).toLowerCase(), {
			channel: meta.name,
			...meta.context,
			err: err?.message,
		});
	});
	return channel;
}
