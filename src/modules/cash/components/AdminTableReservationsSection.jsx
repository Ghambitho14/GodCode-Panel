import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Loader2, Plus, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { branchTablesService } from '../services/branchTablesService';
import { tableReservationsService } from '../services/tableReservationsService';

const STATUS_LABEL = {
	booked: 'Reservada',
	seated: 'Sentada',
	cancelled: 'Cancelada',
	no_show: 'No show',
};

function toDateInputValue(d = new Date()) {
	const x = d instanceof Date ? d : new Date(d);
	const y = x.getFullYear();
	const m = String(x.getMonth() + 1).padStart(2, '0');
	const day = String(x.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

function toTimeInputValue(d = new Date()) {
	const x = d instanceof Date ? d : new Date(d);
	const h = String(x.getHours()).padStart(2, '0');
	const min = String(x.getMinutes()).padStart(2, '0');
	return `${h}:${min}`;
}

function combineLocalDateTime(dateStr, timeStr) {
	const [y, m, d] = String(dateStr || '').split('-').map(Number);
	const [hh, mm] = String(timeStr || '12:00').split(':').map(Number);
	return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
}

function formatTime(iso) {
	if (!iso) return '—';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '—';
	return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function emptyDraft(dayStr) {
	const now = new Date();
	now.setMinutes(now.getMinutes() + 30, 0, 0);
	return {
		id: null,
		tableId: '',
		date: dayStr || toDateInputValue(),
		time: toTimeInputValue(now),
		durationMinutes: String(tableReservationsService.DEFAULT_DURATION_MINUTES),
		partySize: '2',
		guestName: '',
		guestPhone: '',
		note: '',
	};
}

/**
 * Agenda del día de reservas de mesa (MVP panel).
 */
export default function AdminTableReservationsSection({
	selectedBranch,
	companyId,
	showNotify,
	onSeatReservation,
	compact = false,
	onChanged,
}) {
	const branchId = selectedBranch?.id;
	const branchReady = Boolean(branchId && branchId !== 'all' && companyId);
	const [day, setDay] = useState(() => toDateInputValue());
	const [tables, setTables] = useState([]);
	const [rows, setRows] = useState([]);
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [formOpen, setFormOpen] = useState(false);
	const [draft, setDraft] = useState(() => emptyDraft());

	const tableById = useMemo(() => {
		const map = new Map();
		for (const t of tables) map.set(String(t.id), t);
		return map;
	}, [tables]);

	const load = useCallback(async () => {
		if (!branchReady) {
			setTables([]);
			setRows([]);
			return;
		}
		setLoading(true);
		try {
			const [tableRows, reservations] = await Promise.all([
				branchTablesService.listByBranch(branchId, { activeOnly: true }),
				tableReservationsService.listByBranchDay(branchId, combineLocalDateTime(day, '00:00')),
			]);
			setTables(tableRows);
			setRows(reservations);
		} catch (e) {
			showNotify?.(e instanceof Error ? e.message : 'Error al cargar reservas', 'error');
		} finally {
			setLoading(false);
		}
	}, [branchReady, branchId, day, showNotify]);

	useEffect(() => {
		void load();
	}, [load]);

	const openCreate = () => {
		setDraft(emptyDraft(day));
		setFormOpen(true);
	};

	const openEdit = (reservation) => {
		const start = new Date(reservation.starts_at);
		const end = new Date(reservation.ends_at);
		const duration = Math.max(
			15,
			Math.round((end.getTime() - start.getTime()) / 60_000) || tableReservationsService.DEFAULT_DURATION_MINUTES,
		);
		setDraft({
			id: reservation.id,
			tableId: reservation.table_id ? String(reservation.table_id) : '',
			date: toDateInputValue(start),
			time: toTimeInputValue(start),
			durationMinutes: String(duration),
			partySize: String(reservation.party_size || 2),
			guestName: reservation.guest_name || '',
			guestPhone: reservation.guest_phone || '',
			note: reservation.note || '',
		});
		setFormOpen(true);
	};

	const handleSave = async (e) => {
		e?.preventDefault?.();
		if (!branchReady) return;
		const startsAt = combineLocalDateTime(draft.date, draft.time);
		if (Number.isNaN(startsAt.getTime())) {
			showNotify?.('Fecha u hora inválida', 'error');
			return;
		}
		setSaving(true);
		try {
			const payload = {
				tableId: draft.tableId || null,
				startsAt,
				durationMinutes: Number(draft.durationMinutes) || tableReservationsService.DEFAULT_DURATION_MINUTES,
				partySize: Number(draft.partySize) || 2,
				guestName: draft.guestName,
				guestPhone: draft.guestPhone,
				note: draft.note,
			};
			if (draft.id) {
				await tableReservationsService.update(draft.id, payload);
				showNotify?.('Reserva actualizada', 'success');
			} else {
				await tableReservationsService.create({
					companyId,
					branchId,
					...payload,
				});
				showNotify?.('Reserva creada', 'success');
			}
			setFormOpen(false);
			await load();
			onChanged?.();
		} catch (err) {
			showNotify?.(err instanceof Error ? err.message : 'No se pudo guardar', 'error');
		} finally {
			setSaving(false);
		}
	};

	const handleCancel = async (reservation) => {
		if (!window.confirm('¿Cancelar esta reserva?')) return;
		setSaving(true);
		try {
			await tableReservationsService.cancel(reservation.id);
			showNotify?.('Reserva cancelada', 'success');
			await load();
			onChanged?.();
		} catch (err) {
			showNotify?.(err instanceof Error ? err.message : 'No se pudo cancelar', 'error');
		} finally {
			setSaving(false);
		}
	};

	const handleNoShow = async (reservation) => {
		setSaving(true);
		try {
			await tableReservationsService.markNoShow(reservation.id);
			showNotify?.('Marcada como no show', 'success');
			await load();
			onChanged?.();
		} catch (err) {
			showNotify?.(err instanceof Error ? err.message : 'No se pudo actualizar', 'error');
		} finally {
			setSaving(false);
		}
	};

	const handleSeat = (reservation) => {
		const table = reservation.table_id ? tableById.get(String(reservation.table_id)) : null;
		onSeatReservation?.({
			id: reservation.id,
			table_id: reservation.table_id,
			table_code: table ? branchTablesService.displayCode(table) : null,
			guest_name: reservation.guest_name,
			party_size: reservation.party_size,
		});
	};

	if (!branchReady) {
		return (
			<div className="admin-table-reservations admin-table-reservations--empty">
				<p>Elegí una sucursal para gestionar reservas.</p>
			</div>
		);
	}

	return (
		<div className={`admin-table-reservations${compact ? ' admin-table-reservations--compact' : ''}`}>
			{!compact ? (
				<header className="admin-table-reservations__head">
					<div className="admin-table-reservations__title-row">
						<CalendarClock size={18} aria-hidden />
						<h3 className="admin-table-reservations__title">Reservas del día</h3>
					</div>
					<div className="admin-table-reservations__toolbar">
						<label className="admin-table-reservations__day">
							<span className="sr-only">Día</span>
							<input
								type="date"
								value={day}
								onChange={(e) => setDay(e.target.value)}
							/>
						</label>
						<Button type="button" variant="default" size="sm" onClick={openCreate} disabled={saving}>
							<Plus size={16} aria-hidden />
							Nueva
						</Button>
					</div>
				</header>
			) : (
				<div className="admin-table-reservations__toolbar admin-table-reservations__toolbar--compact">
					<label className="admin-table-reservations__day">
						<span className="sr-only">Día</span>
						<input
							type="date"
							value={day}
							onChange={(e) => setDay(e.target.value)}
						/>
					</label>
					<Button type="button" variant="default" size="sm" onClick={openCreate} disabled={saving}>
						<Plus size={16} aria-hidden />
						Nueva
					</Button>
				</div>
			)}

			{formOpen ? (
				<form className="admin-table-reservations__form" onSubmit={handleSave}>
					<div className="admin-table-reservations__form-grid">
						<label>
							<span>Nombre</span>
							<input
								value={draft.guestName}
								onChange={(e) => setDraft((d) => ({ ...d, guestName: e.target.value }))}
								placeholder="Cliente / grupo"
								required
							/>
						</label>
						<label>
							<span>Teléfono</span>
							<input
								value={draft.guestPhone}
								onChange={(e) => setDraft((d) => ({ ...d, guestPhone: e.target.value }))}
								placeholder="Opcional"
							/>
						</label>
						<label>
							<span>Mesa</span>
							<select
								value={draft.tableId}
								onChange={(e) => setDraft((d) => ({ ...d, tableId: e.target.value }))}
							>
								<option value="">Sin asignar</option>
								{tables.map((t) => (
									<option key={t.id} value={t.id}>
										{t.code} · {t.seats} asientos
									</option>
								))}
							</select>
						</label>
						<label>
							<span>Personas</span>
							<input
								type="number"
								min={1}
								max={50}
								value={draft.partySize}
								onChange={(e) => setDraft((d) => ({ ...d, partySize: e.target.value }))}
							/>
						</label>
						<label>
							<span>Fecha</span>
							<input
								type="date"
								value={draft.date}
								onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
								required
							/>
						</label>
						<label>
							<span>Hora</span>
							<input
								type="time"
								value={draft.time}
								onChange={(e) => setDraft((d) => ({ ...d, time: e.target.value }))}
								required
							/>
						</label>
						<label>
							<span>Duración (min)</span>
							<input
								type="number"
								min={15}
								step={15}
								value={draft.durationMinutes}
								onChange={(e) => setDraft((d) => ({ ...d, durationMinutes: e.target.value }))}
							/>
						</label>
						<label className="admin-table-reservations__form-note">
							<span>Nota</span>
							<input
								value={draft.note}
								onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
								placeholder="Opcional"
							/>
						</label>
					</div>
					<div className="admin-table-reservations__form-actions">
						<Button type="button" variant="secondary" onClick={() => setFormOpen(false)} disabled={saving}>
							Cancelar
						</Button>
						<Button type="submit" variant="default" disabled={saving}>
							{saving ? <Loader2 size={16} className="animate-spin" /> : null}
							{draft.id ? 'Guardar' : 'Crear reserva'}
						</Button>
					</div>
				</form>
			) : null}

			{loading ? (
				<div className="admin-table-reservations__loading">
					<Loader2 size={18} className="animate-spin" />
					Cargando…
				</div>
			) : rows.length === 0 ? (
				<p className="admin-table-reservations__empty-hint">No hay reservas para este día.</p>
			) : (
				<ul className="admin-table-reservations__list">
					{rows.map((reservation) => {
						const table = reservation.table_id ? tableById.get(String(reservation.table_id)) : null;
						const status = STATUS_LABEL[reservation.status] || reservation.status;
						const canSeat = reservation.status === 'booked' && Boolean(reservation.table_id);
						return (
							<li key={reservation.id} className={`admin-table-reservations__item is-${reservation.status}`}>
								<div className="admin-table-reservations__item-main">
									<div className="admin-table-reservations__item-time">
										<strong>{formatTime(reservation.starts_at)}</strong>
										<span>– {formatTime(reservation.ends_at)}</span>
									</div>
									<div className="admin-table-reservations__item-body">
										<span className="admin-table-reservations__item-name">
											<UserRound size={14} aria-hidden />
											{reservation.guest_name || 'Sin nombre'}
										</span>
										<span className="admin-table-reservations__item-meta">
											{table ? table.code : 'Sin mesa'}
											{' · '}
											{reservation.party_size} pers.
											{' · '}
											<span className={`admin-table-reservations__status is-${reservation.status}`}>
												{status}
											</span>
										</span>
									</div>
								</div>
								<div className="admin-table-reservations__item-actions">
									{reservation.status === 'booked' ? (
										<>
											{canSeat && onSeatReservation ? (
												<Button type="button" size="sm" variant="default" onClick={() => handleSeat(reservation)} disabled={saving}>
													Sentar
												</Button>
											) : null}
											<Button type="button" size="sm" variant="secondary" onClick={() => openEdit(reservation)} disabled={saving}>
												Editar
											</Button>
											<Button type="button" size="sm" variant="secondary" onClick={() => handleNoShow(reservation)} disabled={saving}>
												No show
											</Button>
											<Button type="button" size="sm" variant="destructive" onClick={() => handleCancel(reservation)} disabled={saving}>
												Cancelar
											</Button>
										</>
									) : null}
								</div>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}
