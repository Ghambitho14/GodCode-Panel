import React, { useRef, useState } from 'react';
import { Clock, Package, Printer, ChefHat, Banknote } from 'lucide-react';
import { formatTimeElapsed } from '@/shared/utils/formatters';
import { getOrderTileKind, getOrderFulfillmentDisplayLabel, isOrderPaymentSettled } from '@/shared/utils/orderUtils';
import { printOrderTicket } from '@/modules/cash/admin/utils/receiptPrinting';
import { useOrderMoney } from '@/modules/cash/hooks/useOrderMoney';
import { useAdmin } from '@/modules/cash/admin/pages/AdminProvider';
import OrderCardAnchoredMenu from './OrderCardAnchoredMenu';
import DeliveryMotoIcon from './DeliveryMotoIcon';
import TableRestaurantIcon from './TableRestaurantIcon';
import PickupBagIcon from './PickupBagIcon';
import { Button } from "@/components/ui/button";

const STATUS_CLASS = {
	pending: 'table-tile--pending',
	active: 'table-tile--active',
	completed: 'table-tile--completed',
};

const STATUS_LABEL = {
	pending: 'Nuevo',
	active: 'En cocina',
	completed: 'Listo',
};

export default function TableTile({ order, onClick, branchName = null, logoUrl = null, branch = null }) {
	const { companyProfile } = useAdmin();
	const orderMoney = useOrderMoney();
	const kind = getOrderTileKind(order);
	const number = order.shift_sequence ?? order.id;
	const statusClass = STATUS_CLASS[order.status] || 'table-tile--pending';
	const statusLabel = STATUS_LABEL[order.status] || STATUS_LABEL.pending;
	const itemCount = (order.items || []).reduce((acc, i) => acc + (Number(i.quantity) || 1), 0);
	const kindLabel = getOrderFulfillmentDisplayLabel(order);
	const showPaidBadge = isOrderPaymentSettled(order);
	const [ticketMenuOpen, setTicketMenuOpen] = useState(false);
	const ticketMenuRef = useRef(null);

	const ticketPrintOpts = (variant) => ({
		variant,
		branch,
		company: companyProfile,
		exchangeRate: orderMoney.exchangeRate,
	});

	const printKitchen = (e) => {
		e.stopPropagation();
		printOrderTicket(order, branchName, logoUrl ?? null, ticketPrintOpts('kitchen'));
		setTicketMenuOpen(false);
	};

	const printCashier = (e) => {
		e.stopPropagation();
		printOrderTicket(order, branchName, logoUrl ?? null, ticketPrintOpts('cashier'));
		setTicketMenuOpen(false);
	};

	return (
		<div
			className={`table-tile ${statusClass} table-tile--${kind}${ticketMenuOpen ? ' table-tile--menu-open' : ''}`}
		>
			<header className="table-tile__head">
				<div className="table-tile__head-main">
					<span className="table-tile__seq" aria-hidden>
						#{number}
					</span>
					<span className="table-tile__status">{statusLabel}</span>
				</div>
				<div className="table-tile__head-actions">
					<div className="order-ticket-menu" ref={ticketMenuRef}>
						<Button variant="default"
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								setTicketMenuOpen((v) => !v);
							}}
							className={`table-tile__tool-btn${ticketMenuOpen ? ' is-active' : ''}`}
							title="Imprimir tickets"
							aria-expanded={ticketMenuOpen}
							aria-haspopup="menu"
							aria-label="Imprimir tickets"
						>
							<Printer size={11} aria-hidden />
						</Button>
						{ticketMenuOpen ? (
							<OrderCardAnchoredMenu
								anchorRef={ticketMenuRef}
								isOpen={ticketMenuOpen}
								onClose={() => setTicketMenuOpen(false)}
								menuWidth={200}
								menuHeight={120}
							>
								<Button variant="default" type="button" className="order-ticket-menu-item" role="menuitem" onClick={printKitchen}>
									<ChefHat size={16} aria-hidden />
									Ticket cocina
								</Button>
								<Button variant="default" type="button" className="order-ticket-menu-item" role="menuitem" onClick={printCashier}>
									<Banknote size={16} aria-hidden />
									Ticket caja
								</Button>
							</OrderCardAnchoredMenu>
						) : null}
					</div>
					{showPaidBadge ? (
						<span className="table-tile__paid-badge" title="Ya pagado" aria-hidden>
							<PickupBagIcon size={14} />
						</span>
					) : null}
				</div>
			</header>
			<Button variant="default"
				type="button"
				className="table-tile__body"
				onClick={() => onClick(order)}
				aria-label={`${kindLabel} ${number}, ${statusLabel}, ${order.display_name || order.client_name || 'Cliente'}${showPaidBadge ? ', pagado' : ''}`}
			>
				<span className="table-tile__kind-icon" aria-hidden>
					{kind === 'moto' ? (
						<DeliveryMotoIcon className="table-tile__kind-svg--moto" />
					) : kind === 'retiro' ? (
						<PickupBagIcon className="table-tile__kind-svg--retiro" />
					) : (
						<TableRestaurantIcon className="table-tile__kind-svg--mesa" />
					)}
				</span>
				<span className="table-tile__client">{order.display_name || order.client_name || 'Cliente'}</span>
				<span className="table-tile__stats">
					<span className="table-tile__stat table-tile__stat--time">
						<Clock size={11} aria-hidden />
						{formatTimeElapsed(order.created_at)}
					</span>
					{itemCount > 0 ? (
						<>
							<span className="table-tile__stat-sep" aria-hidden>|</span>
							<span className="table-tile__stat table-tile__stat--items">
								<Package size={11} aria-hidden />
								{itemCount}
							</span>
						</>
					) : null}
				</span>
			</Button>
		</div>
	);
}
