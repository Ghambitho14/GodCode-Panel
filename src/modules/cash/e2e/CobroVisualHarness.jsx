import React, { useMemo, useState } from 'react';
import CloseTableModal from '../components/CloseTableModal';
import { AdminContext } from '../admin/pages/AdminProvider';
import { LocationContext } from '../context/LocationContext';
import { OrderMoneyContext } from '../context/OrderMoneyContext';
import { createOrderMoneyFormatter } from '@/lib/money/order-amount';
import '../styles/AdminTables.css';
import '../styles/CobroModal.css';

/**
 * Arnés visual del Cobro (solo modo e2e): `/__e2e/cobro?s=<escenario>`.
 * Pinta el modal real con pedidos de ejemplo para revisarlo sin sesión.
 */

const companyProfile = { id: 'visual-company', country: 'VE', currency: 'USD' };

const baseBranch = {
	id: 'visual-branch',
	company_id: 'visual-company',
	name: 'Holagodcode Centro',
	country: 'VE',
	currency: 'USD',
	payment_methods: ['efectivo', 'card', 'pago_movil', 'bank_transfer'],
	delivery_settings: {},
	manual_order_settings: { version: 1, enabled: true },
};

const now = new Date().toISOString();

const pdvOrder = {
	id: 1925,
	shift_sequence: 200,
	status: 'pending',
	manual_order_mode: 'quick_sale',
	channel: 'pickup',
	order_type: 'pickup',
	client_name: 'Holagodcode',
	payment_type: 'pendiente',
	payment_status: 'pending',
	payment_timing: 'deferred',
	currency: 'USD',
	subtotal: 24,
	total: 24,
	total_minor: 2400,
	payment_balance_minor: 2400,
	items: [
		{ id: 'cuatro-quesos', name: 'Cuatro Quesos & Miel Picante', price: 10, quantity: 1 },
		{ id: 'corner', name: 'La Corner Champignon', price: 14, quantity: 1 },
	],
	created_at: now,
};

const SCENARIOS = {
	v2: {
		label: 'PDV · V2',
		intent: 'pay',
		branch: baseBranch,
		order: pdvOrder,
	},
	tasa: {
		label: 'PDV · con tasa',
		intent: 'pay',
		branch: { ...baseBranch, delivery_settings: { exchangeRate: 36.5 } },
		order: pdvOrder,
	},
	web: {
		label: 'Web · clásico',
		intent: 'pay',
		branch: baseBranch,
		order: {
			...pdvOrder,
			id: 'b7a1c0de-0000-4000-8000-00000000a41f',
			shift_sequence: 57,
			manual_order_mode: null,
			client_name: 'María Fernanda Rodríguez',
			payment_method_specific: 'efectivo',
			payment_balance_minor: null,
			total_minor: null,
			total: 31.5,
			subtotal: 31.5,
			items: [
				{ id: 'smash', name: 'Smash burger doble', price: 12.5, quantity: 1, note: 'Sin cebolla' },
				{ id: 'papas', name: 'Papas rústicas', price: 4.5, quantity: 2 },
				{ id: 'limonada', name: 'Limonada de hierbabuena', price: 3.5, quantity: 1 },
				{ id: 'brownie', name: 'Brownie con helado', price: 6.5, quantity: 1 },
			],
		},
	},
	mesa: {
		label: 'Mesa · pago parcial',
		intent: 'close',
		branch: { ...baseBranch, delivery_settings: { exchangeRate: 36.5 } },
		order: {
			...pdvOrder,
			id: 'c0ffee00-0000-4000-8000-000000001207',
			shift_sequence: 12,
			manual_order_mode: 'session',
			channel: 'salon',
			order_type: 'dine_in',
			client_name: 'Mesa 12',
			payment_status: 'partial',
			total: 90.5,
			subtotal: 90.5,
			total_minor: 9050,
			payment_balance_minor: 6050,
			items: [
				{ id: 'm1', name: 'Tabla de quesos y embutidos', price: 18, quantity: 1 },
				{ id: 'm2', name: 'Pizza Margherita', price: 11, quantity: 2, note: 'Una sin albahaca' },
				{ id: 'm3', name: 'Ensalada César con pollo', price: 9.5, quantity: 1 },
				{ id: 'm4', name: 'Risotto de hongos', price: 14, quantity: 1 },
				{ id: 'm5', name: 'Agua con gas', price: 2, quantity: 3 },
				{ id: 'm6', name: 'Copa de vino tinto', price: 6, quantity: 2 },
				{ id: 'm7', name: 'Tiramisú', price: 5, quantity: 1 },
				{ id: 'm8', name: 'Café espresso', price: 2, quantity: 2 },
			],
		},
	},
	pagado: {
		label: 'Retiro · ya pagado',
		intent: 'close',
		branch: baseBranch,
		order: {
			...pdvOrder,
			shift_sequence: 201,
			payment_type: 'tienda',
			payment_status: 'paid',
			payment_timing: 'immediate',
			payment_balance_minor: 0,
		},
	},
};

export default function CobroVisualHarness() {
	const params = new URLSearchParams(window.location.search);
	const scenarioKey = SCENARIOS[params.get('s')] ? params.get('s') : 'v2';
	const scenario = SCENARIOS[scenarioKey];
	const [open, setOpen] = useState(true);
	const [result, setResult] = useState(null);
	const money = useMemo(
		() => createOrderMoneyFormatter({ branch: scenario.branch, company: companyProfile }),
		[scenario.branch],
	);

	const handleConfirm = async (order, paymentPatch) => {
		await new Promise((resolve) => window.setTimeout(resolve, 700));
		const { receiptFile, ...rest } = paymentPatch ?? {};
		setResult({ orderId: order.id, receipt: receiptFile?.name ?? null, patch: paymentPatch ? rest : null });
		return true;
	};

	return (
		<AdminContext.Provider value={{ companyProfile, userRole: 'owner', branchExchangeRate: null }}>
			<LocationContext.Provider value={{ selectedBranch: scenario.branch }}>
				<OrderMoneyContext.Provider value={money}>
					<main data-testid="cobro-visual-harness" style={{ minHeight: '100dvh', padding: 24, background: '#eef1f6', fontFamily: 'var(--font-sans)' }}>
						<nav aria-label="Escenarios" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
							{Object.entries(SCENARIOS).map(([key, item]) => (
								<a
									key={key}
									href={`?s=${key}`}
									style={{
										padding: '8px 12px',
										borderRadius: 999,
										border: '1px solid #d6dbe4',
										background: key === scenarioKey ? '#14161a' : '#fff',
										color: key === scenarioKey ? '#fff' : '#14161a',
										fontSize: 13,
										fontWeight: 700,
										textDecoration: 'none',
									}}
								>
									{item.label}
								</a>
							))}
							<button
								type="button"
								onClick={() => setOpen(true)}
								style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid #d6dbe4', background: '#fff', fontSize: 13, fontWeight: 700 }}
							>
								Abrir cobro
							</button>
						</nav>
						<pre data-testid="result" style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>
							{result ? JSON.stringify(result, null, 2) : 'Sin confirmar'}
						</pre>
						{open ? (
							<CloseTableModal
								isOpen
								intent={scenario.intent}
								order={scenario.order}
								branch={scenario.branch}
								showNotify={() => {}}
								onClose={() => setOpen(false)}
								onConfirm={handleConfirm}
							/>
						) : null}
					</main>
				</OrderMoneyContext.Provider>
			</LocationContext.Provider>
		</AdminContext.Provider>
	);
}
