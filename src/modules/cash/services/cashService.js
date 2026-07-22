import { supabase, TABLES } from '@/integrations/supabase';
import { ORDERS_MOVEMENT_JOIN_SELECT } from '@/shared/utils/orderUtils';
import { fetchAllPaginated } from '@/shared/utils/fetchAllPaginated';
import {
	CASH_MOVEMENTS_SELECT,
	CASH_SHIFT_ACTIVE_SELECT,
	CASH_SHIFT_META_SELECT,
	CASH_SHIFT_PAST_SELECT,
} from './cashSelects';

/**
 * Servicio para la gestión de Caja (Shifts y Movements)
 * Optimizado para multi-sucursal y para reducir condiciones de carrera.
 *
 * Notas de implementación:
 * - `openShift` usa la RPC `cash_open_shift` (SECURITY DEFINER, valida rol cashier/ceo/admin).
 * - `closeShift` usa UPDATE directo a `cash_shifts` porque no existe una RPC `cash_close_shift`
 *   en la base. La autorización depende de la policy `cash_shifts_update_ceo_cashier`.
 * - `addMovement` usa la RPC `cash_add_movement` (SECURITY DEFINER, atómica con expected_balance).
 * - Las lecturas (`getActiveShift*`, `getShiftMovements`, `getPastShifts`) van por SELECT directo
 *   y dependen de las policies `cash_*_select_*` que filtran por company_id del usuario.
 */

export const cashService = {
	getPendingEvidenceCount: async (shiftId) => {
		if (!shiftId) return 0;
		const { data, error } = await supabase.rpc('count_pending_payment_evidence_v2', { p_shift_id: shiftId });
		if (error) return 0;
		return Number(data) || 0;
	},
	// --- TURNOS ---

	/**
	 * Obtiene cualquier turno abierto del scope visible por el usuario.
	 * Multi-sucursal: si hay varios, devuelve el primero. Para casos específicos por sucursal,
	 * usar `getActiveShiftForBranch(branchId)`.
	 */
	getActiveShift: async () => {
		const { data, error } = await supabase
			.from(TABLES.cash_shifts)
			.select(CASH_SHIFT_ACTIVE_SELECT)
			.eq('status', 'open')
			.limit(1)
			.maybeSingle();

		if (error) throw error;
		return data;
	},

	/**
	 * Obtiene el turno abierto para una sucursal específica.
	 */
	getActiveShiftForBranch: async (branchId) => {
		if (!branchId) return null;
		const { data, error } = await supabase
			.from(TABLES.cash_shifts)
			.select(CASH_SHIFT_ACTIVE_SELECT)
			.eq('status', 'open')
			.eq('branch_id', branchId)
			.maybeSingle();

		if (error) throw error;
		return data;
	},

	/**
	 * Obtiene los IDs de sucursales que tienen caja abierta.
	 */
	getBranchesWithOpenCaja: async () => {
		const { data, error } = await supabase
			.from(TABLES.cash_shifts)
			.select('branch_id')
			.eq('status', 'open')
			.not('branch_id', 'is', null);

		if (error) throw error;
		return (data || []).map(r => r.branch_id).filter(Boolean).map(id => String(id));
	},

	/**
	 * Abre un nuevo turno de caja. Soporta multi-sucursal si se pasa branchId.
	 * @param {number} openingBalance
	 * @param {string} userId
	 * @param {string} [branchId] - Si se pasa, la validación y el insert son por sucursal.
	 */
	openShift: async (openingBalance, userId, branchId = null) => {
		if (!branchId) {
			throw new Error('Sucursal requerida para abrir caja.');
		}
		const { data, error } = await supabase.rpc('cash_open_shift', {
			p_branch_id: branchId,
			p_opening_balance: Number(openingBalance) || 0
		});
		if (error) throw error;
		return data;
	},

	/**
	 * Cierra un turno de caja con UPDATE directo (no hay RPC `cash_close_shift` en la base).
	 * Autorización: policy `cash_shifts_update_ceo_cashier` (filtra por company del usuario y rol).
	 * El filtro `.eq('status', 'open')` evita cerrar dos veces el mismo turno.
	 */
	/**
	 * @param {string} shiftId
	 * @param {{
	 *   cash: number;
	 *   card: number;
	 *   online: number;
	 *   expectedCard: number;
	 *   expectedOnline: number;
	 * }} payload
	 */
	closeShift: async (shiftId, payload) => {
		const cash = Number(payload?.cash);
		const card = Number(payload?.card);
		const online = Number(payload?.online);
		if (!Number.isFinite(cash) || cash < 0) {
			throw new Error('Monto de efectivo inválido.');
		}
		if (!Number.isFinite(card) || card < 0 || !Number.isFinite(online) || online < 0) {
			throw new Error('Montos de tarjeta o transferencia inválidos.');
		}

		const { data, error } = await supabase
			.from(TABLES.cash_shifts)
			.update({
				actual_balance: cash,
				actual_card_balance: card,
				actual_online_balance: online,
				expected_card_balance: Number(payload.expectedCard) || 0,
				expected_online_balance: Number(payload.expectedOnline) || 0,
				closed_at: new Date().toISOString(),
				status: 'closed',
			})
			.eq('id', shiftId)
			.eq('status', 'open')
			.select()
			.single();

		if (error) throw new Error('No se pudo cerrar la caja o ya se encuentra cerrada.');
		return data;
	},

	// --- MOVIMIENTOS ---

	/**
	 * Registra un nuevo movimiento de caja vía RPC `cash_add_movement` (atómica).
	 * La RPC valida rol (cashier/ceo/admin), inserta el movimiento y actualiza
	 * `expected_balance` del turno cuando el método de pago es `cash`.
	 */
	addMovement: async (movement) => {
		const numericAmount = Number(movement.amount);
		if (isNaN(numericAmount) || numericAmount <= 0) {
			throw new Error('Monto invalido para movimiento de caja.');
		}
		const rpcPayload = {
			p_shift_id: movement.shift_id,
			p_type: movement.type,
			p_amount: numericAmount,
			p_description: movement.description,
			p_payment_method: movement.payment_method,
			p_order_id: movement.order_id || null,
		};
		if (movement.expense_kind != null && String(movement.expense_kind).trim() !== '') {
			rpcPayload.p_expense_kind = String(movement.expense_kind).trim();
		}
		const { data, error } = await supabase.rpc('cash_add_movement', rpcPayload);
		if (error) throw error;
		return data;
	},

	/**
	 * Movimientos de un turno con datos de pedido (clave `orders`, como devuelve el embed).
	 * Si el join `orders(*)` falla (FK ambigua en PostgREST, etc.), se hace fallback sin embed
	 * y se traen pedidos con una segunda consulta.
	 */
	getShiftMovements: async (shiftId) => {
		const sid =
			shiftId === null || shiftId === undefined || shiftId === ''
				? null
				: String(shiftId);
		if (!sid) return [];

		try {
			return await fetchAllPaginated(
				supabase
					.from(TABLES.cash_movements)
					.select(`${CASH_MOVEMENTS_SELECT}, ${TABLES.orders}(${ORDERS_MOVEMENT_JOIN_SELECT})`)
					.eq('shift_id', sid)
					.order('created_at', { ascending: false }),
			);
		} catch {
			// Fallback sin embed (FK ambigua en PostgREST, etc.): traemos pedidos aparte.
		}

		const rows = await fetchAllPaginated(
			supabase
				.from(TABLES.cash_movements)
				.select(CASH_MOVEMENTS_SELECT)
				.eq('shift_id', sid)
				.order('created_at', { ascending: false }),
		);
		const orderIds = [
			...new Set(
				rows.map((r) => r.order_id).filter((id) => id != null && id !== '')
			),
		];
		if (orderIds.length === 0) {
			return rows;
		}

		const { data: orderRows, error: ordersError } = await supabase
			.from(TABLES.orders)
			.select(ORDERS_MOVEMENT_JOIN_SELECT)
			.in('id', orderIds);

		if (ordersError || !orderRows?.length) {
			return rows;
		}

		const byId = Object.fromEntries(
			orderRows.map((o) => [String(o.id), o])
		);
		return rows.map((r) => ({
			...r,
			orders:
				r.order_id != null ? byId[String(r.order_id)] ?? null : null,
		}));
	},

	/**
	 * Gastos manuales del local: `expense` sin `order_id`, en rango de fechas.
	 * TODO(egress): agregar RPC de agregación si el gráfico no necesita filas crudas.
	 * Si `endIso` se omite, solo se aplica cota inferior (hasta "ahora" en la BD).
	 * Con `endIso`, intervalo half-open [start, end) como `getMonthRangeUtc`.
	 * @param {{ companyId?: string | null; branchId?: string | null; startIso: string; endIso?: string | null; limit?: number }} params
	 */
	getManualExpenseMovementsInRange: async ({
		companyId = null,
		branchId = null,
		startIso,
		endIso = null,
		limit = 5000,
	}) => {
		if (!startIso) return [];
		let q = supabase
			.from(TABLES.cash_movements)
			.select(
				`id, type, amount, created_at, description, payment_method, order_id, expense_kind, shift_id, ${TABLES.cash_shifts}!inner(branch_id, company_id)`,
			)
			.eq('type', 'expense')
			.is('order_id', null)
			.gte('created_at', startIso)
			.order('created_at', { ascending: true })
			.limit(limit);

		if (endIso) {
			q = q.lt('created_at', endIso);
		}

		if (companyId) {
			q = q.eq(`${TABLES.cash_shifts}.company_id`, companyId);
		}
		if (branchId && branchId !== 'all') {
			q = q.eq(`${TABLES.cash_shifts}.branch_id`, branchId);
		}

		const { data, error } = await q;
		if (error) throw error;
		return data || [];
	},

	getOrderRefundMovementsInRange: async ({
		companyId = null,
		branchId = null,
		startIso,
		endIso = null,
		limit = 5000,
	}) => {
		if (!startIso) return [];
		let q = supabase
			.from(TABLES.cash_movements)
			.select(
				`id, type, amount, created_at, description, payment_method, order_id, expense_kind, shift_id, ${TABLES.cash_shifts}!inner(branch_id, company_id)`,
			)
			.eq('type', 'expense')
			.not('order_id', 'is', null)
			.gte('created_at', startIso)
			.order('created_at', { ascending: true })
			.limit(limit);

		if (endIso) {
			q = q.lt('created_at', endIso);
		}

		if (companyId) {
			q = q.eq(`${TABLES.cash_shifts}.company_id`, companyId);
		}
		if (branchId && branchId !== 'all') {
			q = q.eq(`${TABLES.cash_shifts}.branch_id`, branchId);
		}

		const { data, error } = await q;
		if (error) throw error;
		return data || [];
	},

	getPastShifts: async (limit = 20, branchId = null) => {
		let query = supabase
			.from(TABLES.cash_shifts)
			.select(CASH_SHIFT_PAST_SELECT)
			.eq('status', 'closed')
			.order('closed_at', { ascending: false })
			.limit(limit);

		if (branchId) query = query.eq('branch_id', branchId);

		const { data, error } = await query;
		if (error) throw error;

		return (data || []).map(shift => {
			const movements = shift.cash_movements || [];
			const totalOnline = movements
				.filter(m => m.payment_method === 'online' && m.type === 'sale')
				.reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
			return { ...shift, total_online: totalOnline };
		});
	},

	getShiftById: async (shiftId) => {
		const { data, error } = await supabase
			.from(TABLES.cash_shifts)
			.select(CASH_SHIFT_META_SELECT)
			.eq('id', shiftId)
			.maybeSingle();

		if (error) throw error;
		return data;
	}
};
