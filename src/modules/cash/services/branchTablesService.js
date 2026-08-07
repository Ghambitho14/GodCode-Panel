import { supabase, TABLES } from '@/integrations/supabase';

const BRANCH_TABLES_SELECT =
	'id, company_id, branch_id, code, label, shape, seats, pos_x, pos_y, sort_order, is_active, created_at, updated_at';

const OPEN_ORDER_STATUSES = ['pending', 'active', 'completed'];

function throwFriendly(error, fallback = 'No se pudo completar la operación de mesas') {
	const msg = String(error?.message ?? error ?? fallback);
	const err = new Error(msg);
	err.cause = error;
	throw err;
}

function normalizeTableRow(row) {
	if (!row || typeof row !== 'object') return null;
	return {
		id: row.id,
		company_id: row.company_id,
		branch_id: row.branch_id,
		code: String(row.code ?? '').trim(),
		label: row.label != null ? String(row.label).trim() : '',
		shape: ['round', 'square', 'rect'].includes(row.shape) ? row.shape : 'round',
		seats: Math.max(1, Math.min(50, Number(row.seats) || 4)),
		pos_x: Number(row.pos_x) || 10,
		pos_y: Number(row.pos_y) || 10,
		sort_order: Number(row.sort_order) || 0,
		is_active: row.is_active !== false,
		created_at: row.created_at ?? null,
		updated_at: row.updated_at ?? null,
	};
}

function displayCode(table) {
	return String(table?.label || table?.code || '').trim() || 'Mesa';
}

/**
 * Catálogo de mesas físicas por sucursal + ocupación por sesiones abiertas.
 */
export const branchTablesService = {
	displayCode,

	async listByBranch(branchId, { activeOnly = false } = {}) {
		if (!branchId || branchId === 'all') return [];
		let q = supabase
			.from(TABLES.branch_tables)
			.select(BRANCH_TABLES_SELECT)
			.eq('branch_id', branchId)
			.order('sort_order', { ascending: true })
			.order('code', { ascending: true });
		if (activeOnly) q = q.eq('is_active', true);
		const { data, error } = await q;
		if (error) throwFriendly(error, 'No se pudieron cargar las mesas');
		return (data || []).map(normalizeTableRow).filter(Boolean);
	},

	/**
	 * Map table_id → order for open sessions on this branch.
	 */
	async getOccupancyByBranch(branchId) {
		if (!branchId || branchId === 'all') return new Map();
		const { data, error } = await supabase
			.from(TABLES.orders)
			.select('id, table_id, status, shift_sequence, client_name, table_number, channel, manual_order_mode, created_at')
			.eq('branch_id', branchId)
			.in('status', OPEN_ORDER_STATUSES)
			.not('table_id', 'is', null);
		if (error) {
			// Columna table_id ausente en entornos viejos: sin ocupación.
			if (String(error.message || '').toLowerCase().includes('table_id')) return new Map();
			throwFriendly(error, 'No se pudo leer ocupación de mesas');
		}
		const map = new Map();
		for (const row of data || []) {
			const tid = row?.table_id;
			if (!tid) continue;
			const prev = map.get(tid);
			if (!prev || String(row.created_at) > String(prev.created_at || '')) {
				map.set(String(tid), row);
			}
		}
		return map;
	},

	async upsertTable({
		id = null,
		companyId,
		branchId,
		code,
		label = '',
		shape = 'round',
		seats = 4,
		pos_x = 10,
		pos_y = 10,
		sort_order = 0,
		is_active = true,
	}) {
		if (!companyId || !branchId) throw new Error('Falta empresa o sucursal');
		const payload = {
			company_id: companyId,
			branch_id: branchId,
			code: String(code ?? '').trim(),
			label: String(label ?? '').trim() || null,
			shape: ['round', 'square', 'rect'].includes(shape) ? shape : 'round',
			seats: Math.max(1, Math.min(50, Number(seats) || 4)),
			pos_x: Number(pos_x) || 10,
			pos_y: Number(pos_y) || 10,
			sort_order: Number.isFinite(Number(sort_order)) ? Number(sort_order) : 0,
			is_active: Boolean(is_active),
		};
		if (!payload.code) throw new Error('El código de mesa es obligatorio');

		if (id) {
			const { data, error } = await supabase
				.from(TABLES.branch_tables)
				.update(payload)
				.eq('id', id)
				.select(BRANCH_TABLES_SELECT)
				.single();
			if (error) throwFriendly(error, 'No se pudo actualizar la mesa');
			return normalizeTableRow(data);
		}

		const { data, error } = await supabase
			.from(TABLES.branch_tables)
			.insert(payload)
			.select(BRANCH_TABLES_SELECT)
			.single();
		if (error) throwFriendly(error, 'No se pudo crear la mesa');
		return normalizeTableRow(data);
	},

	async updateLayout(branchId, positions) {
		if (!branchId || !Array.isArray(positions) || positions.length === 0) return;
		const rows = positions
			.filter((p) => p?.id)
			.map((p, idx) => ({
				id: p.id,
				pos_x: Number(p.pos_x) || 10,
				pos_y: Number(p.pos_y) || 10,
				sort_order: Number.isFinite(Number(p.sort_order)) ? Number(p.sort_order) : idx,
			}));
		for (const row of rows) {
			const { error } = await supabase
				.from(TABLES.branch_tables)
				.update({ pos_x: row.pos_x, pos_y: row.pos_y, sort_order: row.sort_order })
				.eq('id', row.id)
				.eq('branch_id', branchId);
			if (error) throwFriendly(error, 'No se pudo guardar el plano');
		}
	},

	async deleteTable(tableId, branchId) {
		if (!tableId) throw new Error('Mesa no válida');
		const { data: open, error: openErr } = await supabase
			.from(TABLES.orders)
			.select('id')
			.eq('table_id', tableId)
			.in('status', OPEN_ORDER_STATUSES)
			.limit(1);
		if (openErr && !String(openErr.message || '').toLowerCase().includes('table_id')) {
			throwFriendly(openErr, 'No se pudo verificar sesiones abiertas');
		}
		if (open?.length) {
			throw new Error('No se puede eliminar una mesa con sesión abierta');
		}
		let q = supabase.from(TABLES.branch_tables).delete().eq('id', tableId);
		if (branchId) q = q.eq('branch_id', branchId);
		const { error } = await q;
		if (error) throwFriendly(error, 'No se pudo eliminar la mesa');
	},

	/**
	 * Tras crear el pedido, enlaza table_id / table_number (compat con RPC sin p_table_id).
	 */
	async linkOrderToTable(orderId, { tableId, tableCode }) {
		if (!orderId || !tableId) return;
		const patch = {
			table_id: tableId,
			table_number: String(tableCode || '').trim() || null,
		};
		const { error } = await supabase.from(TABLES.orders).update(patch).eq('id', orderId);
		if (error && !String(error.message || '').toLowerCase().includes('table_id')) {
			throwFriendly(error, 'Pedido creado, pero no se pudo vincular la mesa');
		}
	},
};
