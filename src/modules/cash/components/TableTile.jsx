import React, { useRef, useState } from 'react';
import { Check, Clock, Package, Printer, ChefHat, Banknote, ClipboardList } from 'lucide-react';
import { formatTimeElapsed } from '@/shared/utils/formatters';
import {
	isOrderPaymentSettled,
	resolveTablesViewTileIdentity,
	resolveTableTileServiceBadge,
} from '@/shared/utils/orderUtils';
import { printOrderTicket } from '@/modules/cash/admin/utils/receiptPrinting';
import { useOrderMoney } from '@/modules/cash/hooks/useOrderMoney';
import { useAdmin } from '@/modules/cash/admin/pages/AdminProvider';
import OrderCardAnchoredMenu from './OrderCardAnchoredMenu';
import DeliveryMotoIcon from './DeliveryMotoIcon';
import TableRestaurantIcon from './TableRestaurantIcon';
import PickupBagIcon from './PickupBagIcon';
import { Button } from "@/components/ui/button";

const BADGE_CLASS = {
	pending: 'table-tile--pending',
	active: 'table-tile--active',
	completed: 'table-tile--completed',
	parcial: 'table-tile--parcial',
	entregado: 'table-tile--entregado',
};

export default function TableTile({
	order,
	onClick,
	branchName = null,
	logoUrl = null,
	branch = null,
	deliveryProgress = null,
}) {
	const { companyProfile } = useAdmin();
	const orderMoney = useOrderMoney();
	const { title, subtitle, chromeKind } = resolveTablesViewTileIdentity(order);
	const number = order.shift_sequence ?? order.id;
	const serviceBadge = resolveTableTileServiceBadge(order, deliveryProgress);
	const statusClass = BADGE_CLASS[serviceBadge.key] || BADGE_CLASS.pending;
	const statusLabel = serviceBadge.label;
	const itemCount = (order.items || []).reduce((acc, i) => acc + (Number(i.quantity) || 1), 0);
	const showPaidBadge = isOrderPaymentSettled(order);
	const [ticketMenuOpen, setTicketMenuOpen] = useState(false);
	const ticketMenuRef = useRef(null);

	const hasLineProgress = Boolean(deliveryProgress && deliveryProgress.ordered > 0);
	const servedCount = hasLineProgress ? deliveryProgress.served : 0;
	const pendingCount = hasLineProgress ? deliveryProgress.pending : itemCount;
	const orderedCount = hasLineProgress ? deliveryProgress.ordered : itemCount;

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

	const kindIcon =
		chromeKind === 'moto' ? (
			<DeliveryMotoIcon className="table-tile__kind-svg--moto" />
		) : chromeKind === 'mesa' ? (
			<TableRestaurantIcon className="table-tile__kind-svg--mesa" />
		) : chromeKind === 'manual' ? (
			<ClipboardList className="table-tile__kind-svg--manual" size={17} strokeWidth={2.25} />
		) : (
			<PickupBagIcon className="table-tile__kind-svg--retiro" />
		);

	const deliveryTitle = hasLineProgress
		? `${servedCount} entregado${servedCount === 1 ? '' : 's'}, ${pendingCount} pendiente${pendingCount === 1 ? '' : 's'}`
		: `${itemCount} ítem${itemCount === 1 ? '' : 's'}`;

	return (
		<div
			className={`table-tile ${statusClass} table-tile--${chromeKind}${ticketMenuOpen ? ' table-tile--menu-open' : ''}`}
		>
			<header className="table-tile__head">
				<div className="table-tile__head-main">
					<span className="table-tile__seq" aria-hidden>
						#{number}
					</span>
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
				aria-label={`${subtitle || chromeKind} ${number}, ${statusLabel}, ${title}, ${deliveryTitle}${showPaidBadge ? ', pagado' : ''}`}
			>
				<span className="table-tile__identity">
					<span className="table-tile__kind-icon" aria-hidden>
						{kindIcon}
					</span>
					<span className="table-tile__identity-text">
						<span className="table-tile__client">{title}</span>
						{subtitle ? <span className="table-tile__subtitle">{subtitle}</span> : null}
					</span>
				</span>
				<span className="table-tile__status">
					<span className="table-tile__status-dot" aria-hidden />
					{statusLabel}
				</span>
				<span className="table-tile__stats">
					<span className="table-tile__stat table-tile__stat--time">
						<Clock size={11} aria-hidden />
						{formatTimeElapsed(order.created_at)}
					</span>
					{orderedCount > 0 ? (
						<>
							<span className="table-tile__stat-sep" aria-hidden>|</span>
							{hasLineProgress ? (
								<span
									className={`table-tile__stat table-tile__stat--delivery${pendingCount === 0 ? ' is-complete' : ''}`}
									title={deliveryTitle}
								>
									<span className="table-tile__stat table-tile__stat--served">
										<Check size={11} aria-hidden />
										{servedCount}
									</span>
									<span className="table-tile__stat-sep" aria-hidden>·</span>
									<span className="table-tile__stat table-tile__stat--pending">
										<Package size={11} aria-hidden />
										{pendingCount}
									</span>
								</span>
							) : (
								<span className="table-tile__stat table-tile__stat--items" title={deliveryTitle}>
									<Package size={11} aria-hidden />
									{itemCount}
								</span>
							)}
						</>
					) : null}
				</span>
			</Button>
		</div>
	);
}
