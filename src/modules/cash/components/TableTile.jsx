import React from 'react';
import { Clock } from 'lucide-react';
import { formatTimeElapsed } from '@/shared/utils/formatters';
import { getOrderTileKind, getFulfillmentKindLabel, isOrderPaymentSettled } from '@/shared/utils/orderUtils';
import DeliveryMotoIcon from './DeliveryMotoIcon';
import TableRestaurantIcon from './TableRestaurantIcon';
import PickupBagIcon from './PickupBagIcon';

const STATUS_CLASS = {
	pending: 'table-tile--pending',
	active: 'table-tile--active',
	completed: 'table-tile--completed',
};

export default function TableTile({ order, onClick }) {
	const kind = getOrderTileKind(order);
	const number = order.shift_sequence ?? order.id;
	const statusClass = STATUS_CLASS[order.status] || 'table-tile--pending';
	const itemCount = (order.items || []).reduce((acc, i) => acc + (Number(i.quantity) || 1), 0);
	const kindLabel = getFulfillmentKindLabel(kind);
	const showPaidBadge = isOrderPaymentSettled(order);

	return (
		<button
			type="button"
			className={`table-tile ${statusClass} table-tile--${kind}`}
			onClick={() => onClick(order)}
			aria-label={`${kindLabel} ${number}, ${order.client_name || 'Cliente'}${showPaidBadge ? ', pagado' : ''}`}
		>
			<span className="table-tile__seq" aria-hidden>
				{number}
			</span>
			{showPaidBadge ? (
				<span className="table-tile__paid-badge" title="Ya pagado" aria-hidden>
					<PickupBagIcon size={14} />
				</span>
			) : null}
			<span className="table-tile__kind-icon" aria-hidden>
				{kind === 'moto' ? (
					<DeliveryMotoIcon className="table-tile__kind-svg table-tile__kind-svg--moto" />
				) : kind === 'retiro' ? (
					<PickupBagIcon className="table-tile__kind-svg table-tile__kind-svg--retiro" />
				) : (
					<TableRestaurantIcon className="table-tile__kind-svg table-tile__kind-svg--mesa" />
				)}
			</span>
			<span className="table-tile__meta">
				<span className="table-tile__client">{order.client_name || 'Cliente'}</span>
				<span className="table-tile__sub">
					<Clock size={11} aria-hidden />
					{formatTimeElapsed(order.created_at)}
					{itemCount > 0 ? ` · ${itemCount} ítems` : ''}
				</span>
			</span>
		</button>
	);
}
