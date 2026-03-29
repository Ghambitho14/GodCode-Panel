"use client";

import React from 'react';

export function AdminBroadcastsBanner({ broadcasts, broadcastsLoading, ackingId, onAcknowledge }) {
	return (
		<>
			{broadcasts.length > 0 ? (
				<div className="glass" style={{ marginBottom: 18, padding: 12, borderRadius: 12, display: 'grid', gap: 10 }}>
					{broadcasts.map((item) => {
						const isCritical = item.priority === 'critical' || item.priority === 'high';
						const isRead = Boolean(item.readAt);
						return (
							<div
								key={item.id}
								style={{
									border: isCritical ? '1px solid rgba(239,68,68,0.55)' : '1px solid rgba(255,255,255,0.12)',
									background: isCritical ? 'rgba(127,29,29,0.22)' : 'rgba(255,255,255,0.03)',
									borderRadius: 10,
									padding: '10px 12px',
									display: 'flex',
									justifyContent: 'space-between',
									gap: 12,
									alignItems: 'flex-start',
								}}
							>
								<div style={{ minWidth: 0 }}>
									<p style={{ margin: 0, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.09em', opacity: 0.75 }}>
										{item.broadcastType} · prioridad {item.priority}
									</p>
									<h3 style={{ margin: '5px 0 0', fontSize: 16, fontWeight: 800 }}>{item.title}</h3>
									<p style={{ margin: '6px 0 0', opacity: 0.9 }}>{item.message}</p>
									<p style={{ margin: '7px 0 0', fontSize: 12, opacity: 0.65 }}>
										Desde {new Date(item.startsAt).toLocaleString('es-CL')}
									</p>
								</div>

								<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
									{isRead ? (
										<span style={{ fontSize: 12, color: '#86efac', fontWeight: 700 }}>Leído</span>
									) : (
										<span style={{ fontSize: 12, color: '#facc15', fontWeight: 700 }}>Pendiente</span>
									)}
									{!isRead ? (
										<button
											type="button"
											className="admin-btn secondary"
											onClick={() => onAcknowledge(item.id)}
											disabled={ackingId === item.id}
											style={{ fontSize: 12, padding: '6px 10px' }}
										>
											{ackingId === item.id ? 'Guardando...' : 'Marcar leído'}
										</button>
									) : null}
								</div>
							</div>
						);
					})}
				</div>
			) : null}

			{broadcastsLoading ? (
				<div className="glass" style={{ marginBottom: 18, padding: 10, borderRadius: 10, opacity: 0.8 }}>
					Cargando comunicados...
				</div>
			) : null}
		</>
	);
}

export default AdminBroadcastsBanner;
