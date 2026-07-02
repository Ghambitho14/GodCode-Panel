import { supabase } from '@/integrations/supabase';
import { subscribeMonitored } from '@/shared/subscribeMonitored';

/**
 * Hub de Realtime para UPDATE de `branches`. Mantiene un único canal por sucursal
 * y reparte el evento a todos los suscriptores, evitando hasta 4 canales solapados
 * sobre la misma fila (vista de pedidos, delivery, upsell de bebidas/extras).
 *
 * @type {Map<string, { channel: ReturnType<typeof supabase.channel>, listeners: Set<(payload: unknown) => void> }>}
 */
const channelsByBranch = new Map();

/**
 * Suscribe un callback a los UPDATE de una sucursal. Devuelve la función para
 * desuscribirse; cuando no quedan listeners, el canal se cierra solo.
 *
 * @param {string | null | undefined} branchId
 * @param {(payload: unknown) => void} onUpdate
 * @returns {() => void}
 */
export function subscribeBranchUpdate(branchId, onUpdate) {
	if (!branchId || branchId === 'all' || typeof onUpdate !== 'function') {
		return () => {};
	}

	let entry = channelsByBranch.get(branchId);
	if (!entry) {
		const listeners = new Set();
		const channel = subscribeMonitored(
			supabase
				.channel(`branch-hub-${branchId}`)
				.on(
					'postgres_changes',
					{ event: 'UPDATE', schema: 'public', table: 'branches', filter: `id=eq.${branchId}` },
					(payload) => {
						listeners.forEach((cb) => {
							try {
								cb(payload);
							} catch {
								/* un listener no debe romper a los demás */
							}
						});
					},
				),
			{ name: 'branch_hub', context: { branchId } },
		);
		entry = { channel, listeners };
		channelsByBranch.set(branchId, entry);
	}

	entry.listeners.add(onUpdate);

	return () => {
		const current = channelsByBranch.get(branchId);
		if (!current) return;
		current.listeners.delete(onUpdate);
		if (current.listeners.size === 0) {
			try {
				supabase.removeChannel(current.channel);
			} catch {
				/* ignore */
			}
			channelsByBranch.delete(branchId);
		}
	};
}
