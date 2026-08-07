import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Plus, Trash2, Save, Armchair } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { branchTablesService } from '../services/branchTablesService';
import AdminTableReservationsSection from './AdminTableReservationsSection';

const SHAPES = [
	{ value: 'round', label: 'Redonda' },
	{ value: 'square', label: 'Cuadrada' },
	{ value: 'rect', label: 'Rectangular' },
];

function nextDefaultCode(tables) {
	const used = new Set((tables || []).map((t) => String(t.code || '').toUpperCase()));
	for (let i = 1; i <= 99; i += 1) {
		const code = `T${i}`;
		if (!used.has(code)) return code;
	}
	return `T${Date.now() % 1000}`;
}

function defaultPosition(index) {
	const col = index % 4;
	const row = Math.floor(index / 4);
	return { pos_x: 12 + col * 22, pos_y: 14 + row * 28 };
}

/**
 * Configuración de mesas físicas + editor de plano (arrastrar).
 */
export default function AdminBranchTablesSection({
	selectedBranch,
	companyId,
	showNotify,
	onSeatReservation,
}) {
	const branchId = selectedBranch?.id;
	const branchReady = Boolean(branchId && branchId !== 'all' && companyId);
	const [tables, setTables] = useState([]);
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [layoutDirty, setLayoutDirty] = useState(false);
	const [draftCode, setDraftCode] = useState('');
	const [draftSeats, setDraftSeats] = useState(4);
	const [draftShape, setDraftShape] = useState('round');
	const dragRef = useRef(null);
	const canvasRef = useRef(null);

	const load = useCallback(async () => {
		if (!branchReady) {
			setTables([]);
			return;
		}
		setLoading(true);
		try {
			const rows = await branchTablesService.listByBranch(branchId);
			setTables(rows);
			setDraftCode(nextDefaultCode(rows));
			setLayoutDirty(false);
		} catch (e) {
			showNotify?.(e instanceof Error ? e.message : 'Error al cargar mesas', 'error');
		} finally {
			setLoading(false);
		}
	}, [branchReady, branchId, showNotify]);

	useEffect(() => {
		void load();
	}, [load]);

	const handleAdd = async () => {
		if (!branchReady) return;
		const code = String(draftCode || '').trim() || nextDefaultCode(tables);
		const pos = defaultPosition(tables.length);
		setSaving(true);
		try {
			await branchTablesService.upsertTable({
				companyId,
				branchId,
				code,
				label: code,
				shape: draftShape,
				seats: draftSeats,
				pos_x: pos.pos_x,
				pos_y: pos.pos_y,
				sort_order: tables.length,
			});
			showNotify?.(`Mesa ${code} creada`, 'success');
			await load();
		} catch (e) {
			showNotify?.(e instanceof Error ? e.message : 'No se pudo crear', 'error');
		} finally {
			setSaving(false);
		}
	};

	const handleDelete = async (table) => {
		if (!window.confirm(`¿Eliminar ${table.code}?`)) return;
		setSaving(true);
		try {
			await branchTablesService.deleteTable(table.id, branchId);
			showNotify?.('Mesa eliminada', 'success');
			await load();
		} catch (e) {
			showNotify?.(e instanceof Error ? e.message : 'No se pudo eliminar', 'error');
		} finally {
			setSaving(false);
		}
	};

	const handleToggleActive = async (table) => {
		setSaving(true);
		try {
			await branchTablesService.upsertTable({
				id: table.id,
				companyId: table.company_id,
				branchId: table.branch_id,
				code: table.code,
				label: table.label,
				shape: table.shape,
				seats: table.seats,
				pos_x: table.pos_x,
				pos_y: table.pos_y,
				sort_order: table.sort_order,
				is_active: !table.is_active,
			});
			await load();
		} catch (e) {
			showNotify?.(e instanceof Error ? e.message : 'No se pudo actualizar', 'error');
		} finally {
			setSaving(false);
		}
	};

	const onPointerDown = (e, table) => {
		if (!canvasRef.current) return;
		e.preventDefault();
		const rect = canvasRef.current.getBoundingClientRect();
		dragRef.current = {
			id: table.id,
			offsetX: ((e.clientX - rect.left) / rect.width) * 100 - Number(table.pos_x),
			offsetY: ((e.clientY - rect.top) / rect.height) * 100 - Number(table.pos_y),
		};
		e.currentTarget.setPointerCapture?.(e.pointerId);
	};

	const onPointerMove = (e) => {
		const drag = dragRef.current;
		if (!drag || !canvasRef.current) return;
		const rect = canvasRef.current.getBoundingClientRect();
		const x = Math.min(90, Math.max(4, ((e.clientX - rect.left) / rect.width) * 100 - drag.offsetX));
		const y = Math.min(88, Math.max(4, ((e.clientY - rect.top) / rect.height) * 100 - drag.offsetY));
		setTables((prev) =>
			prev.map((t) => (t.id === drag.id ? { ...t, pos_x: x, pos_y: y } : t)),
		);
		setLayoutDirty(true);
	};

	const onPointerUp = () => {
		dragRef.current = null;
	};

	const saveLayout = async () => {
		setSaving(true);
		try {
			await branchTablesService.updateLayout(
				branchId,
				tables.map((t, idx) => ({
					id: t.id,
					pos_x: t.pos_x,
					pos_y: t.pos_y,
					sort_order: idx,
				})),
			);
			setLayoutDirty(false);
			showNotify?.('Plano guardado', 'success');
		} catch (e) {
			showNotify?.(e instanceof Error ? e.message : 'No se pudo guardar el plano', 'error');
		} finally {
			setSaving(false);
		}
	};

	if (!branchReady) {
		return (
			<div className="admin-branch-options__empty">
				<p>Selecciona una sucursal concreta para configurar mesas.</p>
			</div>
		);
	}

	return (
		<div className="admin-branch-tables">
			<div className="admin-branch-options__block">
				<h3 className="admin-branch-options__block-title">Mesas del salón</h3>
				<p className="admin-branch-options__block-desc">
					Definí las mesas físicas de {selectedBranch?.name || 'esta sucursal'}. Arrastrá en el plano
					para ubicarlas; se usan al Abrir mesa.
				</p>
			</div>

			<div className="admin-branch-tables__add">
				<label className="admin-menu-options-field">
					<span className="admin-menu-options-field-label">Código</span>
					<input
						className="form-input"
						value={draftCode}
						onChange={(e) => setDraftCode(e.target.value)}
						placeholder="T1"
						maxLength={24}
					/>
				</label>
				<label className="admin-menu-options-field">
					<span className="admin-menu-options-field-label">Asientos</span>
					<input
						className="form-input"
						type="number"
						min={1}
						max={50}
						value={draftSeats}
						onChange={(e) => setDraftSeats(Number(e.target.value) || 4)}
					/>
				</label>
				<label className="admin-menu-options-field">
					<span className="admin-menu-options-field-label">Forma</span>
					<select
						className="form-input"
						value={draftShape}
						onChange={(e) => setDraftShape(e.target.value)}
					>
						{SHAPES.map((s) => (
							<option key={s.value} value={s.value}>{s.label}</option>
						))}
					</select>
				</label>
				<Button type="button" onClick={() => void handleAdd()} disabled={saving || loading} className="gap-2">
					{saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
					Agregar mesa
				</Button>
			</div>

			{loading ? (
				<p className="admin-branch-tables__hint"><Loader2 size={16} className="animate-spin inline" /> Cargando…</p>
			) : null}

			<div
				ref={canvasRef}
				className="admin-branch-tables__canvas"
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
				onPointerLeave={onPointerUp}
			>
				{tables.length === 0 && !loading ? (
					<div className="admin-branch-tables__canvas-empty">
						<Armchair size={28} aria-hidden />
						<p>Todavía no hay mesas. Agregá la primera arriba.</p>
					</div>
				) : null}
				{tables.map((table) => (
					<button
						key={table.id}
						type="button"
						className={`admin-branch-tables__node admin-branch-tables__node--${table.shape}${table.is_active ? '' : ' is-inactive'}`}
						style={{ left: `${table.pos_x}%`, top: `${table.pos_y}%` }}
						onPointerDown={(e) => onPointerDown(e, table)}
						title="Arrastrar para ubicar"
					>
						<span className="admin-branch-tables__node-code">{table.code}</span>
						<span className="admin-branch-tables__node-seats">{table.seats} asientos</span>
					</button>
				))}
			</div>

			<div className="admin-branch-tables__toolbar">
				<Button
					type="button"
					variant="default"
					disabled={!layoutDirty || saving}
					onClick={() => void saveLayout()}
					className="gap-2"
				>
					<Save size={16} />
					Guardar plano
				</Button>
			</div>

			<ul className="admin-branch-tables__list">
				{tables.map((table) => (
					<li key={table.id} className="admin-branch-tables__list-item">
						<div>
							<strong>{table.code}</strong>
							<span className="admin-branch-tables__meta">
								{table.seats} asientos · {table.shape}
								{table.is_active ? '' : ' · inactiva'}
							</span>
						</div>
						<div className="admin-branch-tables__list-actions">
							<Button type="button" variant="outline" size="sm" onClick={() => void handleToggleActive(table)} disabled={saving}>
								{table.is_active ? 'Desactivar' : 'Activar'}
							</Button>
							<Button type="button" variant="outline" size="sm" onClick={() => void handleDelete(table)} disabled={saving} className="text-red-600">
								<Trash2 size={14} />
							</Button>
						</div>
					</li>
				))}
			</ul>

			<div className="admin-branch-tables__reservations">
				<AdminTableReservationsSection
					selectedBranch={selectedBranch}
					companyId={companyId}
					showNotify={showNotify}
					onSeatReservation={onSeatReservation}
				/>
			</div>
		</div>
	);
}
