"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, CheckCircle } from 'lucide-react';

import {
	BRANCH_PAYMENT_METHOD_ORDER,
	applyPaymentMethodToggle,
	branchHasCanonicalMethod,
} from '@/lib/branch-payment-methods';

const PROVIDER_LABELS = { paypal: 'PayPal', stripe: 'Stripe' };

const METHOD_LABELS = {
	pago_movil: 'Pago Móvil',
	zelle: 'Zelle',
	transferencia_bancaria: 'Transferencia bancaria',
};

/** Encabezados de columnas (claves canónicas en `branches.payment_methods`). */
const METHOD_COLUMN_LABELS = {
	tienda: 'Efectivo',
	tarjeta: 'Tarjeta',
	transferencia_bancaria: 'Transferencia',
	pago_movil: 'Pago móvil',
	zelle: 'Zelle',
	paypal: 'PayPal',
	stripe: 'Stripe',
};

const METHOD_FIELDS = {
	pago_movil: [
		{ key: 'banco', label: 'Banco' },
		{ key: 'telefono', label: 'Teléfono' },
		{ key: 'identificacion', label: 'Cédula / Identificación' },
	],
	zelle: [
		{ key: 'email', label: 'Correo Zelle' },
		{ key: 'name', label: 'Nombre titular' },
	],
	transferencia_bancaria: [
		{ key: 'banco', label: 'Banco' },
		{ key: 'tipo_cuenta', label: 'Tipo de cuenta' },
		{ key: 'nro_cuenta', label: 'Número de cuenta' },
		{ key: 'identificacion', label: 'RUT / Cédula' },
		{ key: 'titular', label: 'Nombre titular' },
		{ key: 'email', label: 'Correo (opcional)' },
	],
};

/**
 * Valores iniciales del formulario: JSONB en branches + columnas planas
 * (bank_name, account_number, etc.) usadas en Configuración / carrito.
 */
function buildInitialMethodValues(branch, methodKey) {
	const raw =
		branch[methodKey] && typeof branch[methodKey] === 'object' && !Array.isArray(branch[methodKey])
			? { ...branch[methodKey] }
			: {};
	if (methodKey === 'transferencia_bancaria') {
		return {
			banco: raw.banco ?? branch.bank_name ?? '',
			tipo_cuenta: raw.tipo_cuenta ?? branch.account_type ?? '',
			nro_cuenta: raw.nro_cuenta ?? branch.account_number ?? '',
			identificacion: raw.identificacion ?? branch.account_rut ?? '',
			titular: raw.titular ?? branch.account_holder ?? '',
			email: raw.email ?? branch.account_email ?? '',
		};
	}
	return raw;
}

function BranchMethodFormBody({ label, fields, initialValues, saving, onSave }) {
	const [values, setValues] = useState(() => {
		const o = {};
		fields.forEach((f) => {
			o[f.key] = initialValues[f.key] ?? '';
		});
		return o;
	});
	const handleSave = () => {
		const out = {};
		Object.keys(values).forEach((k) => { if (values[k] != null && String(values[k]).trim() !== '') out[k] = String(values[k]).trim(); });
		onSave(Object.keys(out).length ? out : null);
	};
	return (
		<div style={{ marginBottom: '1rem' }}>
			<div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem' }}>{label}</div>
			<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
				{fields.map((f) => (
					<div key={f.key}>
						<label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--admin-text-muted, #475569)', marginBottom: '0.2rem', fontWeight: 600 }}>{f.label}</label>
						<input
							type="text"
							className="form-input"
							value={values[f.key] ?? ''}
							onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
							placeholder={f.label}
							style={{ width: '100%', padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}
						/>
					</div>
				))}
			</div>
			<button
				type="button"
				className="form-input payment-connect-btn"
				style={{ marginTop: '0.5rem', padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
				disabled={saving}
				onClick={handleSave}
			>
				{saving ? <Loader2 size={14} className="animate-spin" style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} /> : null}
				{saving ? 'Guardando…' : 'Guardar'}
			</button>
		</div>
	);
}

function BranchMethodForm(props) {
	const initKey = JSON.stringify(props.fields.map((f) => [f.key, props.initialValues[f.key] ?? '']));
	return <BranchMethodFormBody key={initKey} {...props} />;
}

export default function AdminPaymentMethods({ showNotify, branches: branchesProp }) {
	const [loading, setLoading] = useState(true);
	const [connectedAccounts, setConnectedAccounts] = useState([]);
	const [branchMethods, setBranchMethods] = useState([]);
	const [branches, setBranches] = useState(branchesProp || []);
	const [saving, setSaving] = useState(null);
	const [connectingStripe, setConnectingStripe] = useState(false);
	const [connectingPayPal, setConnectingPayPal] = useState(false);
	const [paypalEmail, setPaypalEmail] = useState('');
	const [showPayPalForm, setShowPayPalForm] = useState(false);
	const [savingBranchConfig, setSavingBranchConfig] = useState(null);
	const [branchConfigVersion, setBranchConfigVersion] = useState(0);
	const [loadEpoch, setLoadEpoch] = useState(0);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const res = await fetch('/api/tenant-payment-methods', { credentials: 'include' });
			const data = await res.json();
			if (!res.ok) {
				showNotify?.(data?.error || 'Error al cargar', 'error');
				return;
			}
			setConnectedAccounts(data.connectedAccounts || []);
			setBranchMethods(data.branchMethods || []);
			if (Array.isArray(data.branches) && data.branches.length > 0) {
				setBranches(data.branches);
			}
		} catch {
			showNotify?.('Error de conexión', 'error');
		} finally {
			setLoading(false);
			setLoadEpoch((e) => e + 1);
		}
	}, [showNotify]);

	useEffect(() => {
		load();
	}, [load]);

	const isConnected = (provider) =>
		connectedAccounts.some((a) => a.provider === provider && (a.status === 'active' || a.status === 'pending'));

	const getBranchMethod = (branchId, provider) =>
		branchMethods.find((m) => m.branch_id === branchId && m.provider === provider);

	const setBranchEnabled = useCallback(
		async (branchId, canonical, isEnabled) => {
			const key = `${branchId}-${canonical}`;
			setSaving(key);
			try {
				const res = await fetch('/api/tenant-payment-methods', {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					credentials: 'include',
					body: JSON.stringify({ branch_id: branchId, provider: canonical, is_enabled: isEnabled }),
				});
				const data = await res.json();
				if (!res.ok) {
					showNotify?.(data?.error || 'Error al guardar', 'error');
					return;
				}
				if (canonical === 'paypal' || canonical === 'stripe') {
					setBranchMethods((prev) => {
						const rest = prev.filter((m) => !(m.branch_id === branchId && m.provider === canonical));
						return [...rest, { branch_id: branchId, provider: canonical, is_enabled: isEnabled }];
					});
				}
				setBranches((prev) =>
					prev.map((b) => {
						if (b.id !== branchId) return b;
						const current = Array.isArray(b.payment_methods) ? [...b.payment_methods] : [];
						const next = applyPaymentMethodToggle(current, canonical, isEnabled);
						return { ...b, payment_methods: next };
					})
				);
				showNotify?.('Guardado');
			} catch {
				showNotify?.('Error al guardar', 'error');
			} finally {
				setSaving(null);
			}
		},
		[showNotify]
	);

	const saveBranchConfig = useCallback(
		async (branchId, methodKey, values) => {
			const key = `${branchId}-${methodKey}`;
			setSavingBranchConfig(key);
			try {
				const payload = { branch_id: branchId, [methodKey]: values };
				const res = await fetch('/api/tenant-payment-methods/branch-config', {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					credentials: 'include',
					body: JSON.stringify(payload),
				});
				const data = await res.json();
				if (!res.ok) {
					showNotify?.(data?.error || 'Error al guardar', 'error');
					return;
				}
				showNotify?.('Datos guardados');
				setBranchConfigVersion((v) => v + 1);
				load();
			} catch {
				showNotify?.('Error al guardar', 'error');
			} finally {
				setSavingBranchConfig(null);
			}
		},
		[showNotify, load]
	);

	if (loading) {
		return (
			<div className="settings-container animate-fade" style={{ padding: '2rem', display: 'flex', justifyContent: 'center' }}>
				<Loader2 size={32} className="animate-spin" />
			</div>
		);
	}

	return (
		<div className="settings-container animate-fade">
			<header className="settings-header settings-header--stack">
				<p className="settings-subtitle">
					Conecta PayPal y Stripe, activa métodos por sucursal y configura los datos de pago (Pago Móvil, Zelle, transferencia). Solo el dueño o CEO puede ver y editar esta sección.
				</p>
			</header>

			<section className="settings-section" style={{ marginTop: '1.5rem' }}>
				<h2 className="section-title">Cuentas conectadas</h2>
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
					{['paypal', 'stripe'].map((provider) => {
						const account = connectedAccounts.find((a) => a.provider === provider);
						const connected = isConnected(provider);
						return (
							<div key={provider} className="payment-provider-card">
								<div>
									<div className="payment-provider-title">{PROVIDER_LABELS[provider]}</div>
									{connected ? (
										<span className="payment-status payment-status--ok">
											<CheckCircle size={14} aria-hidden />
											{account?.display_name || 'Conectado'}
										</span>
									) : (
										<span className="payment-status payment-status--idle">No conectado</span>
									)}
								</div>
								{connected && provider === 'paypal' && showPayPalForm ? (
									<div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', alignItems: 'flex-end' }}>
										<input
											type="email"
											placeholder="email@cuenta-paypal.com"
											value={paypalEmail}
											onChange={(e) => setPaypalEmail(e.target.value)}
											className="form-input"
											style={{ width: '100%', minWidth: '180px', padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}
										/>
										<div style={{ display: 'flex', gap: '0.35rem' }}>
											<button
												type="button"
												className="form-input"
												style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
												onClick={() => { setShowPayPalForm(false); setPaypalEmail(''); }}
											>
												Cancelar
											</button>
											<button
												type="button"
												className="form-input"
												style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
												disabled={connectingPayPal || !paypalEmail.trim()}
												onClick={async () => {
													const email = paypalEmail.trim();
													if (!email) return;
													setConnectingPayPal(true);
													try {
														const res = await fetch('/api/tenant-payment-methods/connect/paypal', {
															method: 'POST',
															headers: { 'Content-Type': 'application/json' },
															credentials: 'include',
															body: JSON.stringify({ paypal_email: email }),
														});
														const data = await res.json();
														if (!res.ok) {
															showNotify?.(data?.error || 'Error al conectar', 'error');
															return;
														}
														showNotify?.('Cuenta PayPal actualizada');
														setShowPayPalForm(false);
														setPaypalEmail('');
														load();
													} catch {
														showNotify?.('Error de conexión', 'error');
													} finally {
														setConnectingPayPal(false);
													}
												}}
											>
												{connectingPayPal ? <Loader2 size={14} className="animate-spin" /> : 'Actualizar'}
											</button>
										</div>
									</div>
								) : connected ? (
									provider === 'paypal' ? (
										<div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
											<span style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted, #6b7280)' }}>Activo</span>
											<button
												type="button"
												className="form-input"
												style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
												onClick={() => {
													setPaypalEmail(account?.display_name || '');
													setShowPayPalForm(true);
												}}
											>
												Cambiar
											</button>
											<button
												type="button"
												className="form-input payment-connect-btn"
												style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
												onClick={async () => {
													if (!confirm('¿Desconectar esta cuenta PayPal?')) return;
													setConnectingPayPal(true);
													try {
														const res = await fetch('/api/tenant-payment-methods/connect/paypal', {
															method: 'DELETE',
															credentials: 'include',
														});
														const data = await res.json();
														if (!res.ok) {
															showNotify?.(data?.error || 'Error', 'error');
															return;
														}
														showNotify?.('Cuenta PayPal desconectada');
														load();
													} catch {
														showNotify?.('Error de conexión', 'error');
													} finally {
														setConnectingPayPal(false);
													}
												}}
												disabled={connectingPayPal}
											>
												Desconectar
											</button>
										</div>
									) : (
										<span className="payment-status payment-status--idle">Activo</span>
									)
								) : provider === 'stripe' ? (
									<button
										type="button"
										className="form-input payment-connect-btn"
										style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
										disabled={connectingStripe}
										onClick={async () => {
											setConnectingStripe(true);
											try {
												const res = await fetch('/api/tenant-payment-methods/connect/stripe', {
													method: 'POST',
													credentials: 'include',
												});
												const data = await res.json();
												if (!res.ok) {
													showNotify?.(data?.error || 'Error al conectar', 'error');
													return;
												}
												if (data?.url) {
													window.location.href = data.url;
													return;
												}
												showNotify?.('No se recibió enlace de Stripe', 'error');
											} catch {
												showNotify?.('Error de conexión', 'error');
											} finally {
												setConnectingStripe(false);
											}
										}}
									>
										{connectingStripe ? (
											<>
												<Loader2 size={14} className="animate-spin" style={{ marginRight: '0.25rem', verticalAlign: 'middle' }} />
												Conectando…
											</>
										) : (
											'Conectar'
										)}
									</button>
								) : provider === 'paypal' && showPayPalForm ? (
									<div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', alignItems: 'flex-end' }}>
										<input
											type="email"
											placeholder="email@cuenta-paypal.com"
											value={paypalEmail}
											onChange={(e) => setPaypalEmail(e.target.value)}
											className="form-input"
											style={{ width: '100%', minWidth: '180px', padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}
										/>
										<div style={{ display: 'flex', gap: '0.35rem' }}>
											<button
												type="button"
												className="form-input"
												style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
												onClick={() => { setShowPayPalForm(false); setPaypalEmail(''); }}
											>
												Cancelar
											</button>
											<button
												type="button"
												className="form-input"
												style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
												disabled={connectingPayPal || !paypalEmail.trim()}
												onClick={async () => {
													const email = paypalEmail.trim();
													if (!email) return;
													setConnectingPayPal(true);
													try {
														const res = await fetch('/api/tenant-payment-methods/connect/paypal', {
															method: 'POST',
															headers: { 'Content-Type': 'application/json' },
															credentials: 'include',
															body: JSON.stringify({ paypal_email: email }),
														});
														const data = await res.json();
														if (!res.ok) {
															showNotify?.(data?.error || 'Error al conectar', 'error');
															return;
														}
														showNotify?.('Cuenta PayPal vinculada');
														setShowPayPalForm(false);
														setPaypalEmail('');
														load();
													} catch {
														showNotify?.('Error de conexión', 'error');
													} finally {
														setConnectingPayPal(false);
													}
												}}
											>
												{connectingPayPal ? <Loader2 size={14} className="animate-spin" /> : 'Vincular'}
											</button>
										</div>
									</div>
								) : provider === 'paypal' ? (
									<button
										type="button"
										className="form-input payment-connect-btn"
										style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
										onClick={() => setShowPayPalForm(true)}
									>
										Conectar
									</button>
								) : null}
							</div>
						);
					})}
				</div>
				<p className="form-hint" style={{ marginTop: '0.75rem' }}>
					Vincula tu cuenta PayPal (email donde recibes pagos) o conecta Stripe para poder aceptar estos métodos en cada sucursal.
				</p>
			</section>

			<section className="settings-section" style={{ marginTop: '1.5rem' }}>
				<h2 className="section-title">Métodos por sucursal</h2>
				<p className="form-hint" style={{ marginBottom: '1rem' }}>
					Marca o desmarca qué métodos acepta cada sucursal. PayPal y Stripe requieren la cuenta conectada arriba.
				</p>
				<div style={{ overflowX: 'auto' }}>
					<table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '720px' }}>
						<thead>
							<tr style={{ borderBottom: '2px solid var(--border, #e5e7eb)' }}>
								<th style={{ textAlign: 'left', padding: '0.75rem', fontWeight: 600 }}>Sucursal</th>
								{BRANCH_PAYMENT_METHOD_ORDER.map((canonical) => (
									<th
										key={canonical}
										style={{ textAlign: 'center', padding: '0.5rem 0.35rem', fontWeight: 600, fontSize: '0.78rem' }}
									>
										{METHOD_COLUMN_LABELS[canonical]}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{branches.filter((b) => b.id && b.id !== 'all').map((branch) => (
								<tr key={branch.id} style={{ borderBottom: '1px solid var(--border, #e5e7eb)' }}>
									<td style={{ padding: '0.75rem' }}>{branch.name || 'Sin nombre'}</td>
									{BRANCH_PAYMENT_METHOD_ORDER.map((canonical) => {
										const checked =
											canonical === 'paypal' || canonical === 'stripe'
												? getBranchMethod(branch.id, canonical)?.is_enabled ??
													branchHasCanonicalMethod(branch.payment_methods, canonical)
												: branchHasCanonicalMethod(branch.payment_methods, canonical);
										return (
											<td key={canonical} style={{ padding: '0.5rem', textAlign: 'center' }}>
												<input
													type="checkbox"
													checked={checked}
													onChange={(e) => setBranchEnabled(branch.id, canonical, e.target.checked)}
													disabled={saving === `${branch.id}-${canonical}`}
													aria-label={`${METHOD_COLUMN_LABELS[canonical]} — ${branch.name || 'Sucursal'}`}
												/>
											</td>
										);
									})}
								</tr>
							))}
						</tbody>
					</table>
				</div>
				{branches.filter((b) => b.id && b.id !== 'all').length === 0 && (
					<p className="payment-branch-empty__text" style={{ marginTop: '0.75rem' }}>No hay sucursales. Crea una desde la configuración del negocio.</p>
				)}
			</section>

			<section className="settings-section" style={{ marginTop: '1.5rem' }}>
				<h2 className="section-title">Datos de pago por sucursal</h2>
				<p className="form-hint" style={{ marginBottom: '1rem' }}>
					Configura los datos de cada método que la plataforma tiene habilitado para tu negocio. Solo aparecen los métodos que te fueron activados.
				</p>
				{branches.filter((b) => b.id && b.id !== 'all').map((branch) => {
					const methods = Array.isArray(branch.payment_methods) ? branch.payment_methods : [];
					const configurable = ['pago_movil', 'zelle', 'transferencia_bancaria'].filter((m) => methods.includes(m));
					if (configurable.length === 0) {
						return (
							<div key={branch.id} className="payment-branch-empty">
								<div className="payment-branch-empty__title">
									{branch.name || 'Sin nombre'}
								</div>
								<p className="payment-branch-empty__text">
									No hay métodos con datos por configurar en esta sucursal (efectivo y tarjeta no requieren datos; PayPal/Stripe se configuran arriba).
								</p>
							</div>
						);
					}
					return (
						<div key={branch.id} className="payment-branch-panel">
							<div className="payment-branch-panel__head">
								{branch.name || 'Sin nombre'}
							</div>
							<div className="payment-branch-panel__body">
								{configurable.map((methodKey) => {
									const fields = METHOD_FIELDS[methodKey] || [];
									const current = buildInitialMethodValues(branch, methodKey);
									const savingKey = `${branch.id}-${methodKey}`;
									return (
										<BranchMethodForm
											key={`${branch.id}-${methodKey}-${loadEpoch}-${branchConfigVersion}`}
											label={METHOD_LABELS[methodKey]}
											fields={fields}
											initialValues={current}
											saving={savingBranchConfig === savingKey}
											onSave={(values) => saveBranchConfig(branch.id, methodKey, values)}
										/>
									);
								})}
							</div>
						</div>
					);
				})}
			</section>
		</div>
	);
}
