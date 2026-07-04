/** Tubería feliz: pending → active → completed → picked_up */
const ORDER_PIPELINE_RANK = { pending: 0, active: 1, completed: 2, picked_up: 3 };

/** @returns {number} -1 si no aplica (p. ej. cancelled). */
export function orderPipelineRank(status) {
	if (status === 'cancelled') return -1;
	return ORDER_PIPELINE_RANK[status] ?? -1;
}

/**
 * Fusiona lista del servidor con estado local optimista.
 * @param {unknown[]} prev
 * @param {unknown[]} serverList
 * @param {string | null | undefined} [branchId] — filtra órdenes huérfanas de otra sucursal
 */
export function mergeOrdersFromServer(prev, serverList, branchId = null) {
	const serverById = new Map(serverList.map((o) => [o.id, o]));
	const prevById = new Map(prev.map((o) => [o.id, o]));
	const mergedCore = serverList.map((serverRow) => {
		const p = prevById.get(serverRow.id);
		if (!p) return serverRow;
		const ps = p.status;
		const ss = serverRow.status;
		if (ss === 'cancelled') return serverRow;
		if (ps === 'cancelled') return { ...serverRow, status: 'cancelled' };
		const rp = orderPipelineRank(ps);
		const rs = orderPipelineRank(ss);
		if (rp >= 0 && rs >= 0 && rp > rs) return { ...serverRow, status: ps };
		return serverRow;
	});
	let onlyPrev = prev.filter((p) => !serverById.has(p.id));
	if (branchId != null && branchId !== 'all') {
		const bid = String(branchId);
		onlyPrev = onlyPrev.filter((p) => String(p.branch_id ?? p.branchId ?? '') === bid);
	}
	const combined = [...mergedCore, ...onlyPrev];
	combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
	return combined;
}
