import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Armchair, Users, CalendarClock } from 'lucide-react';
import { branchTablesService } from '../services/branchTablesService';
import { tableReservationsService } from '../services/tableReservationsService';
import AdminTableReservationsSection from './AdminTableReservationsSection';
import SectionHeader from './manual-order/SectionHeader';
import { Button } from '@/components/ui/button';

const sectionCardClass =
	'manual-order-step-card flex min-h-0 flex-col overflow-hidden rounded-[18px] border border-gc-border bg-gc-card p-4 shadow-sm sm:p-5';

/**
 * Paso 1 de Abrir mesa: salón + reservas del día (chrome alineado al wizard).
 */
export default function OpenMesaFloorPlan({
	branchId,
	companyId,
	selectedTableId,
	onSelectTable,
	onOpenOccupiedSession,
	onSeatReservation,
	showNotify,
}) {
	const [tables, setTables] = useState([]);
	const [occupancy, setOccupancy] = useState(() => new Map());
	const [holds, setHolds] = useState(() => new Map());
	const [loading, setLoading] = useState(true);
	const [seatPrompt, setSeatPrompt] = useState(null);
	const [floorKey, setFloorKey] = useState(0);

	const load = useCallback(async () => {
		if (!branchId || branchId === 'all') {
			setTables([]);
			setOccupancy(new Map());
			setHolds(new Map());
			setLoading(false);
			return;
		}
		setLoading(true);
		try {
			const [rows, occ, holdMap] = await Promise.all([
				branchTablesService.listByBranch(branchId, { activeOnly: true }),
				branchTablesService.getOccupancyByBranch(branchId),
				tableReservationsService.getActiveHoldsByBranch(branchId),
			]);
			setTables(rows);
			setOccupancy(occ);
			setHolds(holdMap);
		} catch (e) {
			showNotify?.(e instanceof Error ? e.message : 'Error al cargar mesas', 'error');
		} finally {
			setLoading(false);
		}
	}, [branchId, showNotify]);

	useEffect(() => {
		void load();
	}, [load, floorKey]);

	const selected = useMemo(
		() => tables.find((t) => String(t.id) === String(selectedTableId)) || null,
		[tables, selectedTableId],
	);

	const counts = useMemo(() => {
		let available = 0;
		let reserved = 0;
		let occupied = 0;
		for (const table of tables) {
			const id = String(table.id);
			if (occupancy.has(id)) occupied += 1;
			else if (holds.has(id)) reserved += 1;
			else available += 1;
		}
		return { available, reserved, occupied, total: tables.length };
	}, [tables, occupancy, holds]);

	const handleTap = (table) => {
		const openOrder = occupancy.get(String(table.id));
		if (openOrder) {
			setSeatPrompt(null);
			onOpenOccupiedSession?.(openOrder, table);
			return;
		}
		const hold = holds.get(String(table.id));
		if (hold) {
			setSeatPrompt({ table, reservation: hold });
			return;
		}
		setSeatPrompt(null);
		onSelectTable?.(table);
	};

	const confirmSeatHold = () => {
		if (!seatPrompt?.reservation) return;
		const { table, reservation } = seatPrompt;
		setSeatPrompt(null);
		onSeatReservation?.({
			id: reservation.id,
			table_id: table.id,
			table_code: branchTablesService.displayCode(table),
			guest_name: reservation.guest_name,
			party_size: reservation.party_size,
		});
	};

	const handleSeatFromAgenda = (payload) => {
		setSeatPrompt(null);
		onSeatReservation?.(payload);
	};

	if (loading) {
		return (
			<div className="open-mesa-floor open-mesa-floor--loading">
				<Loader2 className="animate-spin" size={22} />
				<span>Cargando salón…</span>
			</div>
		);
	}

	if (tables.length === 0) {
		return (
			<div className="open-mesa-floor open-mesa-floor--empty">
				<div className={sectionCardClass}>
					<Armchair size={28} aria-hidden className="open-mesa-floor__empty-icon" />
					<p className="open-mesa-floor__empty-title">No hay mesas configuradas</p>
					<p className="open-mesa-floor__empty-hint">
						Andá a Opciones de sucursal → Mesas y creá el plano del salón.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="open-mesa-floor open-mesa-floor--wizard">
			<div className="open-mesa-floor__layout">
				<section className={`${sectionCardClass} open-mesa-floor__salon`}>
					<div className="open-mesa-floor__salon-head">
						<SectionHeader icon={Armchair} tone="accent">
							Salón
						</SectionHeader>
						<div className="open-mesa-floor__legend" aria-label="Leyenda">
							<span className="open-mesa-floor__legend-item">
								<i className="is-available" /> Disponible ({counts.available})
							</span>
							<span className="open-mesa-floor__legend-item">
								<i className="is-reserved" /> Reservada ({counts.reserved})
							</span>
							<span className="open-mesa-floor__legend-item">
								<i className="is-occupied" /> Ocupada ({counts.occupied})
							</span>
						</div>
					</div>

					<div className="open-mesa-floor__grid" role="listbox" aria-label="Mesas del salón">
						{tables.map((table) => {
							const occupied = occupancy.has(String(table.id));
							const reserved = !occupied && holds.has(String(table.id));
							const isSelected = String(table.id) === String(selectedTableId);
							const hold = holds.get(String(table.id));
							const statusLabel = occupied
								? 'Ocupada'
								: reserved
									? (hold?.guest_name || 'Reservada')
									: `${table.seats} asientos`;

							return (
								<button
									key={table.id}
									type="button"
									role="option"
									aria-selected={isSelected}
									className={[
										'open-mesa-floor__seat',
										occupied ? 'is-occupied' : reserved ? 'is-reserved' : 'is-available',
										isSelected ? 'is-selected' : '',
									].filter(Boolean).join(' ')}
									onClick={() => handleTap(table)}
									title={
										occupied
											? `${table.code} ocupada — tocar para ver sesión`
											: reserved
												? `${table.code} reservada · ${hold?.guest_name || 'Reserva'}`
												: `Seleccionar ${table.code}`
									}
								>
									<span className="open-mesa-floor__seat-code">{table.code}</span>
									<span className="open-mesa-floor__seat-meta">
										{reserved || occupied ? null : <Users size={12} aria-hidden />}
										{statusLabel}
									</span>
									{isSelected ? (
										<span className="open-mesa-floor__seat-badge">Seleccionada</span>
									) : null}
								</button>
							);
						})}
					</div>

					{seatPrompt ? (
						<div className="open-mesa-floor__seat-prompt" role="status">
							<div className="open-mesa-floor__seat-prompt-copy">
								<strong>{seatPrompt.table.code} está reservada</strong>
								<span>
									{seatPrompt.reservation.guest_name || 'Cliente'}
									{' · '}
									{seatPrompt.reservation.party_size} pers.
								</span>
							</div>
							<div className="open-mesa-floor__seat-prompt-actions">
								<Button type="button" variant="secondary" size="sm" onClick={() => setSeatPrompt(null)}>
									Cerrar
								</Button>
								{onSeatReservation ? (
									<Button type="button" variant="default" size="sm" onClick={confirmSeatHold}>
										Sentar reserva
									</Button>
								) : null}
							</div>
						</div>
					) : null}

					<div className="open-mesa-floor__bar">
						<div className="open-mesa-floor__bar-copy">
							{selected ? (
								<>
									<span className="open-mesa-floor__bar-label">Mesa seleccionada</span>
									<strong>{selected.code}</strong>
									<span className="open-mesa-floor__bar-hint-inline">
										{selected.seats} asientos
									</span>
								</>
							) : (
								<span className="open-mesa-floor__bar-hint">
									Elegí una mesa disponible o sentá una reserva para continuar
								</span>
							)}
						</div>
					</div>
				</section>

				<aside className={`${sectionCardClass} open-mesa-floor__reservations`}>
					<SectionHeader icon={CalendarClock} tone="accent">
						Reservas
					</SectionHeader>
					<AdminTableReservationsSection
						selectedBranch={{ id: branchId, company_id: companyId }}
						companyId={companyId}
						showNotify={showNotify}
						onSeatReservation={handleSeatFromAgenda}
						compact
						onChanged={() => {
							setFloorKey((n) => n + 1);
						}}
					/>
				</aside>
			</div>
		</div>
	);
}
