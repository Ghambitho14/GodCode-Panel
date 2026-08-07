import { supabase, TABLES } from '@/integrations/supabase';

const RESERVATIONS_SELECT =
	'id, company_id, branch_id, table_id, starts_at, ends_at, party_size, guest_name, guest_phone, status, order_id, note, created_at, updated_at';

const DEFAULT_DURATION_MINUTES = 90;
const DEFAULT_HOLD_LEAD_MINUTES = 30;

function throwFriendly(error, fallback = 'No se pudo completar la operación de reservas') {
	const msg = String(error?.message ?? error ?? fallback);
	const err = new Error(msg);
	err.cause = error;
	throw err;
}

/** PostgREST PGRST205 u otros cuando la migración aún no está en esa instancia. */
function isMissingReservationsTable(error) {
	const code = String(error?.code || '');
	if (code === 'PGRST205' || code === '42P01') return true;
	const msg = String(error?.message || error || '').toLowerCase();
	return msg.includes('table_reservations') && (
		msg.includes('schema cache')
		|| msg.includes('does not exist')
		|| msg.includes('could not find')
	);
}

function startOfLocalDay(day = new Date()) {
	const d = day instanceof Date ? new Date(day) : new Date(day);
	d.setHours(0, 0, 0, 0);
	return d;
}

function endOfLocalDay(day = new Date()) {
	const d = startOfLocalDay(day);
	d.setHours(23, 59, 59, 999);
	return d;
}

function normalizeReservation(row) {
	if (!row || typeof row !== 'object') return null;
	return {
		id: row.id,
		company_id: row.company_id,
		branch_id: row.branch_id,
		table_id: row.table_id ?? null,
		starts_at: row.starts_at ?? null,
		ends_at: row.ends_at ?? null,
		party_size: Math.max(1, Math.min(50, Number(row.party_size) || 2)),
		guest_name: String(row.guest_name ?? '').trim(),
		guest_phone: row.guest_phone != null ? String(row.guest_phone).trim() : '',
		status: ['booked', 'seated', 'cancelled', 'no_show'].includes(row.status) ? row.status : 'booked',
		order_id: row.order_id ?? null,
		note: row.note != null ? String(row.note).trim() : '',
		created_at: row.created_at ?? null,
		updated_at: row.updated_at ?? null,
	};
}

function resolveEndsAt(startsAt, endsAt, durationMinutes = DEFAULT_DURATION_MINUTES) {
	if (endsAt) {
		const end = new Date(endsAt);
		if (!Number.isNaN(end.getTime())) return end.toISOString();
	}
	const start = new Date(startsAt);
	const mins = Math.max(15, Number(durationMinutes) || DEFAULT_DURATION_MINUTES);
	return new Date(start.getTime() + mins * 60_000).toISOString();
}

/**
 * Reservas de mesa (MVP panel).
 */
export const tableReservationsService = {
	DEFAULT_DURATION_MINUTES,
	DEFAULT_HOLD_LEAD_MINUTES,

	normalizeReservation,

	async listByBranchDay(branchId, day = new Date()) {
		if (!branchId || branchId === 'all') return [];
		const from = startOfLocalDay(day).toISOString();
		const to = endOfLocalDay(day).toISOString();
		const { data, error } = await supabase
			.from(TABLES.table_reservations)
			.select(RESERVATIONS_SELECT)
			.eq('branch_id', branchId)
			.lt('starts_at', to)
			.gt('ends_at', from)
			.order('starts_at', { ascending: true });
		if (error) {
			if (isMissingReservationsTable(error)) return [];
			throwFriendly(error, 'No se pudieron cargar las reservas');
		}
		return (data || []).map(normalizeReservation).filter(Boolean);
	},

	async getById(reservationId) {
		if (!reservationId) return null;
		const { data, error } = await supabase
			.from(TABLES.table_reservations)
			.select(RESERVATIONS_SELECT)
			.eq('id', reservationId)
			.maybeSingle();
		if (error) {
			if (isMissingReservationsTable(error)) return null;
			throwFriendly(error, 'No se pudo cargar la reserva');
		}
		return normalizeReservation(data);
	},

	/**
	 * Map table_id → reserva booked que solapa la ventana de hold.
	 * @param {string} branchId
	 * @param {{ windowMinutes?: number, leadMinutes?: number }} [opts]
	 */
	async getActiveHoldsByBranch(branchId, opts = {}) {
		if (!branchId || branchId === 'all') return new Map();
		const leadMinutes = Math.max(0, Number(opts.leadMinutes) || DEFAULT_HOLD_LEAD_MINUTES);
		const windowMinutes = Math.max(leadMinutes, Number(opts.windowMinutes) || leadMinutes);
		const now = Date.now();
		const from = new Date(now - 5 * 60_000).toISOString();
		const to = new Date(now + windowMinutes * 60_000).toISOString();

		const { data, error } = await supabase
			.from(TABLES.table_reservations)
			.select(RESERVATIONS_SELECT)
			.eq('branch_id', branchId)
			.eq('status', 'booked')
			.not('table_id', 'is', null)
			.lt('starts_at', to)
			.gt('ends_at', from)
			.order('starts_at', { ascending: true });
		if (error) {
			if (isMissingReservationsTable(error)) return new Map();
			throwFriendly(error, 'No se pudieron cargar reservas activas');
		}

		const map = new Map();
		const leadMs = leadMinutes * 60_000;
		for (const row of data || []) {
			const reservation = normalizeReservation(row);
			if (!reservation?.table_id) continue;
			const startMs = new Date(reservation.starts_at).getTime();
			const endMs = new Date(reservation.ends_at).getTime();
			// Hold: desde leadMinutes antes del inicio hasta el fin.
			if (now < startMs - leadMs || now > endMs) continue;
			const tid = String(reservation.table_id);
			const prev = map.get(tid);
			if (!prev || String(reservation.starts_at) < String(prev.starts_at || '')) {
				map.set(tid, reservation);
			}
		}
		return map;
	},

	async create({
		companyId,
		branchId,
		tableId = null,
		startsAt,
		endsAt = null,
		durationMinutes = DEFAULT_DURATION_MINUTES,
		partySize = 2,
		guestName = '',
		guestPhone = '',
		note = '',
	}) {
		if (!companyId || !branchId) throw new Error('Falta empresa o sucursal');
		if (!startsAt) throw new Error('Indicá la hora de la reserva');
		const starts_at = new Date(startsAt).toISOString();
		const ends_at = resolveEndsAt(starts_at, endsAt, durationMinutes);
		const payload = {
			company_id: companyId,
			branch_id: branchId,
			table_id: tableId || null,
			starts_at,
			ends_at,
			party_size: Math.max(1, Math.min(50, Number(partySize) || 2)),
			guest_name: String(guestName ?? '').trim() || 'Sin nombre',
			guest_phone: String(guestPhone ?? '').trim() || null,
			status: 'booked',
			note: String(note ?? '').trim() || null,
		};
		const { data, error } = await supabase
			.from(TABLES.table_reservations)
			.insert(payload)
			.select(RESERVATIONS_SELECT)
			.single();
		if (error) {
			if (isMissingReservationsTable(error)) {
				throwFriendly(
					{ message: 'Falta aplicar la migración de reservas en esta base (table_reservations).' },
					'Reservas no disponibles en esta instancia',
				);
			}
			throwFriendly(error, 'No se pudo crear la reserva');
		}
		return normalizeReservation(data);
	},

	async update(reservationId, patch = {}) {
		if (!reservationId) throw new Error('Reserva no válida');
		const next = {};
		if (patch.tableId !== undefined) next.table_id = patch.tableId || null;
		if (patch.startsAt != null) next.starts_at = new Date(patch.startsAt).toISOString();
		if (patch.endsAt != null || patch.startsAt != null || patch.durationMinutes != null) {
			const starts = next.starts_at || patch.startsAt;
			next.ends_at = resolveEndsAt(
				starts,
				patch.endsAt,
				patch.durationMinutes ?? DEFAULT_DURATION_MINUTES,
			);
		}
		if (patch.partySize != null) {
			next.party_size = Math.max(1, Math.min(50, Number(patch.partySize) || 2));
		}
		if (patch.guestName != null) next.guest_name = String(patch.guestName).trim() || 'Sin nombre';
		if (patch.guestPhone !== undefined) {
			next.guest_phone = String(patch.guestPhone ?? '').trim() || null;
		}
		if (patch.note !== undefined) next.note = String(patch.note ?? '').trim() || null;
		if (Object.keys(next).length === 0) {
			return this.getById(reservationId);
		}
		const { data, error } = await supabase
			.from(TABLES.table_reservations)
			.update(next)
			.eq('id', reservationId)
			.select(RESERVATIONS_SELECT)
			.single();
		if (error) {
			if (isMissingReservationsTable(error)) {
				throwFriendly(
					{ message: 'Falta aplicar la migración de reservas en esta base (table_reservations).' },
					'Reservas no disponibles en esta instancia',
				);
			}
			throwFriendly(error, 'No se pudo actualizar la reserva');
		}
		return normalizeReservation(data);
	},

	async cancel(reservationId) {
		return this.setStatus(reservationId, 'cancelled');
	},

	async markNoShow(reservationId) {
		return this.setStatus(reservationId, 'no_show');
	},

	async seat(reservationId, { orderId = null } = {}) {
		if (!reservationId) throw new Error('Reserva no válida');
		const patch = { status: 'seated' };
		if (orderId != null && orderId !== '') patch.order_id = String(orderId);
		const { data, error } = await supabase
			.from(TABLES.table_reservations)
			.update(patch)
			.eq('id', reservationId)
			.select(RESERVATIONS_SELECT)
			.single();
		if (error) {
			if (isMissingReservationsTable(error)) {
				throwFriendly(
					{ message: 'Falta aplicar la migración de reservas en esta base (table_reservations).' },
					'Reservas no disponibles en esta instancia',
				);
			}
			throwFriendly(error, 'No se pudo marcar la reserva como sentada');
		}
		return normalizeReservation(data);
	},

	async setStatus(reservationId, status) {
		if (!reservationId) throw new Error('Reserva no válida');
		const { data, error } = await supabase
			.from(TABLES.table_reservations)
			.update({ status })
			.eq('id', reservationId)
			.select(RESERVATIONS_SELECT)
			.single();
		if (error) {
			if (isMissingReservationsTable(error)) {
				throwFriendly(
					{ message: 'Falta aplicar la migración de reservas en esta base (table_reservations).' },
					'Reservas no disponibles en esta instancia',
				);
			}
			throwFriendly(error, 'No se pudo actualizar el estado de la reserva');
		}
		return normalizeReservation(data);
	},
};
