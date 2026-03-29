"use client";

import React from 'react';
import { Keyboard } from 'lucide-react';

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {{ keys: string; description: string; group?: string }[]} props.rows
 */
export function AdminShortcutsModal({ open, onClose, rows }) {
	if (!open) return null;

	const grouped = rows.reduce((acc, row) => {
		const g = row.group || 'General';
		if (!acc[g]) acc[g] = [];
		acc[g].push(row);
		return acc;
	}, /** @type {Record<string, typeof rows>} */ ({}));

	return (
		<div
			className="admin-modal-overlay"
			role="dialog"
			aria-modal="true"
			aria-label="Atajos de teclado"
			onClick={onClose}
			style={{
				position: 'fixed',
				inset: 0,
				background: 'rgba(0,0,0,0.6)',
				zIndex: 10049,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				padding: 16,
			}}
		>
			<div
				className="glass"
				onClick={(e) => e.stopPropagation()}
				style={{
					width: '100%',
					maxWidth: 480,
					maxHeight: '85vh',
					overflowY: 'auto',
					borderRadius: 12,
					padding: 20,
				}}
			>
				<div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
					<Keyboard size={22} />
					<h2 style={{ margin: 0, fontSize: 18 }}>Atajos de teclado</h2>
				</div>
				{Object.entries(grouped).map(([group, list]) => (
					<div key={group} style={{ marginBottom: 18 }}>
						<p style={{ margin: '0 0 8px', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.7 }}>{group}</p>
						<table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
							<tbody>
								{list.map((row, i) => (
									<tr key={`${group}-${i}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
										<td style={{ padding: '8px 8px 8px 0', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
											<code style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: 6 }}>{row.keys}</code>
										</td>
										<td style={{ padding: '8px 0', opacity: 0.9 }}>{row.description}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				))}
				<button type="button" className="admin-btn secondary" onClick={onClose} style={{ marginTop: 8 }}>
					Cerrar
				</button>
			</div>
		</div>
	);
}

export default AdminShortcutsModal;
