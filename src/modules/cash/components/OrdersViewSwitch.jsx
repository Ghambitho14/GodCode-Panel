import React from 'react';
import { LayoutGrid, ClipboardList } from 'lucide-react';

const MODES = [
	{ id: 'mesas', label: 'Mesas', Icon: LayoutGrid },
	{ id: 'pedido', label: 'Pedido', Icon: ClipboardList },
];

export default function OrdersViewSwitch({ value, onChange, className = '' }) {
	const rootClass = ['orders-view-switch', className].filter(Boolean).join(' ');

	return (
		<div className={rootClass} role="group" aria-label="Vista de pedidos">
			{MODES.map(({ id, label, Icon }) => {
				const active = value === id;
				return (
					<button
						key={id}
						type="button"
						className={`orders-view-switch__btn${active ? ' orders-view-switch__btn--active' : ''}`}
						onClick={() => onChange(id)}
						aria-pressed={active}
					>
						<Icon size={15} strokeWidth={1.75} aria-hidden />
						<span>{label}</span>
					</button>
				);
			})}
		</div>
	);
}
