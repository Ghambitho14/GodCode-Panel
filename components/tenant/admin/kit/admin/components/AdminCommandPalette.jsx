"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {{ id: string; label: string; group?: string }[]} props.items
 * @param {(id: string) => void} props.onSelect
 */
export function AdminCommandPalette({ open, onClose, items, onSelect }) {
	const [q, setQ] = useState('');
	const inputRef = useRef(null);

	const filtered = useMemo(() => {
		const s = q.trim().toLowerCase();
		if (!s) return items;
		return items.filter(
			(it) =>
				it.label.toLowerCase().includes(s) ||
				it.id.toLowerCase().includes(s) ||
				(it.group && it.group.toLowerCase().includes(s)),
		);
	}, [items, q]);

	useEffect(() => {
		if (!open) return undefined;
		// Limpiar búsqueda al abrir la paleta (patrón modal).
		// eslint-disable-next-line react-hooks/set-state-in-effect -- sincronizar UI al abrir
		setQ('');
		const t = setTimeout(() => {
			inputRef.current?.focus();
		}, 10);
		return () => clearTimeout(t);
	}, [open]);

	if (!open) return null;

	return (
		<div
			className="admin-modal-overlay admin-command-palette-overlay"
			role="dialog"
			aria-modal="true"
			aria-label="Ir a sección"
			data-admin-command-palette="true"
			onClick={onClose}
			style={{
				position: 'fixed',
				inset: 0,
				background: 'rgba(0,0,0,0.55)',
				zIndex: 10050,
				display: 'flex',
				alignItems: 'flex-start',
				justifyContent: 'center',
				padding: '12vh 16px 16px',
			}}
		>
			<div
				className="glass admin-command-palette"
				onClick={(e) => e.stopPropagation()}
				style={{
					width: '100%',
					maxWidth: 420,
					borderRadius: 12,
					overflow: 'hidden',
					boxShadow: '0 20px 50px rgba(0,0,0,0.45)',
				}}
			>
				<div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
					<Search size={18} style={{ opacity: 0.8 }} />
					<input
						ref={inputRef}
						value={q}
						onChange={(e) => setQ(e.target.value)}
						placeholder="Buscar sección…"
						style={{
							flex: 1,
							background: 'transparent',
							border: 'none',
							color: 'white',
							fontSize: 16,
							outline: 'none',
						}}
					/>
				</div>
				<ul style={{ listStyle: 'none', margin: 0, padding: 8, maxHeight: '50vh', overflowY: 'auto' }}>
					{filtered.length === 0 ? (
						<li style={{ padding: 12, opacity: 0.75 }}>Sin coincidencias</li>
					) : (
						filtered.map((it) => (
							<li key={it.id}>
								<button
									type="button"
									onClick={() => {
										onSelect(it.id);
										onClose();
									}}
									style={{
										width: '100%',
										textAlign: 'left',
										padding: '10px 12px',
										borderRadius: 8,
										border: 'none',
										background: 'rgba(255,255,255,0.06)',
										color: 'white',
										cursor: 'pointer',
										marginBottom: 6,
										display: 'block',
									}}
								>
									<span style={{ fontWeight: 600 }}>{it.label}</span>
									{it.group ? (
										<span style={{ display: 'block', fontSize: 12, opacity: 0.65, marginTop: 2 }}>{it.group}</span>
									) : null}
								</button>
							</li>
						))
					)}
				</ul>
				<p style={{ margin: 0, padding: '8px 14px 12px', fontSize: 12, opacity: 0.6 }}>
					Esc para cerrar
				</p>
			</div>
		</div>
	);
}

export default AdminCommandPalette;
