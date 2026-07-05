import React from 'react';
import { Store, ShoppingBag, Truck } from 'lucide-react';
import { Button } from "@/components/ui/button";

const CHANNELS = [
	{ id: 'mesa', label: 'Mesa', Icon: Store },
	{ id: 'retiro', label: 'Retiro', Icon: ShoppingBag },
	{ id: 'delivery', label: 'Delivery', Icon: Truck },
];

/**
 * Toggles de canales de pedido local (mesa / retiro / delivery) por sucursal.
 */
export default function LocalOrderChannelsSwitch({ value, onChange, className = '' }) {
	const rootClass = ['local-order-channels-switch', className].filter(Boolean).join(' ');

	return (
		<div className={rootClass} role="group" aria-label="Tipos de pedido local habilitados">
			{CHANNELS.map(({ id, label, Icon }) => {
				const active = Boolean(value?.[id]);
				return (
					<Button variant="default"
						key={id}
						type="button"
						className={`local-order-channels-switch__btn${active ? ' local-order-channels-switch__btn--active' : ''}`}
						onClick={() => onChange({ ...value, [id]: !active })}
						aria-pressed={active}
					>
						<Icon size={15} strokeWidth={1.75} aria-hidden />
						<span>{label}</span>
					</Button>
				);
			})}
		</div>
	);
}
