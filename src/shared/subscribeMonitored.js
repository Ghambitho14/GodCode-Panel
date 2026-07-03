import { monitor } from '@/shared/monitor';

/** @type {unique symbol} */
const INTENTIONAL_CLOSE = Symbol('gcIntentionalClose');

/** Canales que ya loguearon SUBSCRIBED (evita spam en consola DEV). */
/** @type {WeakSet<object>} */
const subscribedLogged = new WeakSet();

/**
 * Marca un canal para que el cierre por cleanup (StrictMode / unmount) no dispare lógica de reconexión.
 * @param {ReturnType<import('@supabase/supabase-js').SupabaseClient['channel']>} channel
 */
export function markMonitoredChannelClosing(channel) {
	if (channel) channel[INTENTIONAL_CLOSE] = true;
}

/**
 * Cierra un canal suscrito vía subscribeMonitored (cleanup intencional).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {ReturnType<import('@supabase/supabase-js').SupabaseClient['channel']>} channel
 */
export function closeMonitoredChannel(supabase, channel) {
	markMonitoredChannelClosing(channel);
	supabase.removeChannel(channel);
}

/**
 * @param {string} status
 * @returns {'info' | 'warn' | 'error'}
 */
function realtimeLogLevel(status) {
	if (status === 'CHANNEL_ERROR') return 'error';
	if (status === 'TIMED_OUT') return 'warn';
	return 'info';
}

/**
 * Suscribe un canal Supabase Realtime registrando el estado en el monitor interno.
 *
 * @param {ReturnType<import('@supabase/supabase-js').SupabaseClient['channel']>} channel
 * @param {{ name: string, context?: Record<string, unknown> }} meta
 * @param {(status: string, err?: Error) => void} [onStatusChange]
 * @returns {typeof channel}
 */
export function subscribeMonitored(channel, meta, onStatusChange) {
	channel.subscribe((status, err) => {
		const intentional = Boolean(channel[INTENTIONAL_CLOSE]);
		const isRepeatSubscribed = status === 'SUBSCRIBED' && subscribedLogged.has(channel);
		if (status === 'SUBSCRIBED') {
			subscribedLogged.add(channel);
		}
		if (!isRepeatSubscribed) {
			monitor[realtimeLogLevel(status)]('realtime', String(status).toLowerCase(), {
				channel: meta.name,
				...meta.context,
				err: err?.message,
				...(intentional && status === 'CLOSED' ? { intentional: true } : {}),
			});
		}
		if (status === 'CLOSED' && intentional) return;
		onStatusChange?.(status, err);
	});
	return channel;
}
