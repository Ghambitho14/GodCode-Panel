import { useEffect, useState } from 'react';
import { revealOrderContact } from '@/modules/cash/services/clientPiiService';
import { orderHasSealedContact } from '@/shared/utils/sealedPii';

/**
 * El pedido con teléfono, documento y dirección ya revelados, para una vista de
 * detalle. Mientras llega (o si falla) devuelve el pedido tal cual, que se muestra
 * enmascarado. Un pedido sin datos cifrados no dispara ninguna llamada.
 *
 * @template T
 * @param {T} order
 * @returns {{ order: T, revealing: boolean, revealError: string | null }}
 */
export function useRevealedOrderContact(order) {
	const [state, setState] = useState({ source: null, revealed: null, error: null });
	const sealed = orderHasSealedContact(order);

	useEffect(() => {
		if (!sealed) return undefined;
		let alive = true;
		revealOrderContact(order)
			.then((revealed) => {
				if (alive) setState({ source: order, revealed, error: null });
			})
			.catch((err) => {
				if (alive) setState({ source: order, revealed: null, error: err?.message || 'No se pudieron ver los datos' });
			});
		return () => {
			alive = false;
		};
	}, [order, sealed]);

	if (!sealed) return { order, revealing: false, revealError: null };
	const current = state.source === order;
	return {
		order: current && state.revealed ? state.revealed : order,
		revealing: !current,
		revealError: current ? state.error : null,
	};
}
