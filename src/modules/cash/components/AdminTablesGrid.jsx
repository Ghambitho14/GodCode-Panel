import React, { useEffect, useMemo, useState } from 'react';
import { X, ChefHat, CheckCircle2, XCircle, Edit2, Clock, Receipt, User } from 'lucide-react';
import { createMoneyFormatter } from '@/shared/utils/money';
import { formatTimeElapsed } from '@/shared/utils/formatters';
import {
	getOrderTileKind,
	filterOpenOrderSessions,
	getPaymentLabel,
	isOrderPaymentDeferred,
} from '@/shared/utils/orderUtils';
import { useLockBodyScroll } from '@/shared/hooks/useLockBodyScroll';
import { printOrderTicket } from '../admin/utils/receiptPrinting';
import OrderDetailModal from './OrderDetailModal';
import ManualOrderModal from './ManualOrderModal';
import CloseTableModal from './CloseTableModal';
import DeliveryMotoIcon from './DeliveryMotoIcon';
import TableRestaurantIcon from './TableRestaurantIcon';
import TableTile from './TableTile';

const STATUS_LABEL = {
	pending: 'Abierta',
	active: 'En cocina',
	completed: 'Lista',
};

function TableSessionModal({
	order,
	formatMoney,
	onClose,
	onMoveKitchen,
	onMarkReady,
	onCloseTable,
	onOpenDetail,
	onOpenEdit,
	onCancel,
}) {
	const kind = getOrderTileKind(order);
	const itemCount = (order.items || []).reduce((acc, i) => acc + (Number(i.quantity) || 1), 0);
	const paymentDeferred = isOrderPaymentDeferred(order);
	const closeLabel = kind === 'moto' ? 'Cerrar moto' : 'Cerrar mesa';

	useLockBodyScroll(Boolean(order));

	useEffect(() => {
		if (!order) return undefined;
		const onKeyDown = (e) => {
			if (e.key === 'Escape') onClose();
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [order, onClose]);

	if (!order) return null;

	return (
		<div className="table-session-modal-overlay" role="presentation" onClick={onClose}>
			<div
				className={`table-session-modal glass table-session-modal--${order.status} table-session-modal--${kind}`}
				role="dialog"
				aria-modal="true"
				aria-labelledby="table-session-modal-title"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="table-session-modal__accent" aria-hidden />

				<header className="table-session-modal__head">
					<div className="table-session-modal__identity">
						<div className="table-session-modal__number-row">
							<span className="table-session-modal__kind-icon" aria-hidden>
								{kind === 'moto' ? (
									<DeliveryMotoIcon size={22} />
								) : (
									<TableRestaurantIcon size={22} />
								)}
							</span>
							<h2 id="table-session-modal-title">#{order.shift_sequence ?? order.id}</h2>
							<span className={`table-session-modal__status table-session-modal__status--${order.status}`}>
								{STATUS_LABEL[order.status] || order.status}
							</span>
						</div>
						<p className="table-session-modal__kind-label">{kind === 'moto' ? 'Delivery' : 'Salón'}</p>
					</div>
					<button type="button" className="admin-icon-btn table-session-modal__close" onClick={onClose} aria-label="Cerrar">
						<X size={20} />
					</button>
				</header>

				<div className="table-session-modal__hero">
					<div className="table-session-modal__client-row">
						<User size={16} strokeWidth={1.75} aria-hidden />
						<span>{order.client_name || 'Cliente'}</span>
					</div>
					<div className="table-session-modal__meta-row">
						<span className="table-session-modal__meta-chip">
							<Clock size={13} strokeWidth={1.75} aria-hidden />
							{formatTimeElapsed(order.created_at)}
						</span>
						{itemCount > 0 ? (
							<span className="table-session-modal__meta-chip">
								<Receipt size={13} strokeWidth={1.75} aria-hidden />
								{itemCount} {itemCount === 1 ? 'ítem' : 'ítems'}
							</span>
						) : null}
						{paymentDeferred ? (
							<span className="table-session-modal__meta-chip table-session-modal__meta-chip--warn">
								Pago pendiente
							</span>
						) : (
							<span className="table-session-modal__meta-chip">{getPaymentLabel(order)}</span>
						)}
					</div>
					<p className="table-session-modal__total">{formatMoney(order.total)}</p>
				</div>

				{(order.items || []).length > 0 ? (
					<div className="table-session-modal__items-wrap">
						<h3 className="table-session-modal__items-title">Comanda</h3>
						<ul className="table-session-modal__items">
							{(order.items || []).map((item, idx) => (
								<li key={idx} className="table-session-modal__item">
									<span className="table-session-modal__item-qty">{item.quantity}x</span>
									<div className="table-session-modal__item-body">
										<span className="table-session-modal__item-name">{item.name}</span>
										{item.note ? (
											<span className="table-session-modal__item-note">{item.note}</span>
										) : null}
									</div>
								</li>
							))}
						</ul>
					</div>
				) : null}

				<footer className="table-session-modal__foot">
					<div className="table-session-modal__primary">
						{order.status === 'pending' ? (
							<button type="button" className="btn btn-primary" onClick={() => onMoveKitchen(order)}>
								<ChefHat size={16} /> Enviar a cocina
							</button>
						) : null}
						{order.status === 'active' ? (
							<button type="button" className="btn btn-primary" onClick={() => onMarkReady(order)}>
								<CheckCircle2 size={16} /> Marcar listo
							</button>
						) : null}
						{order.status === 'completed' ? (
							<button type="button" className="btn btn-primary" onClick={() => onCloseTable(order)}>
								{closeLabel}
							</button>
						) : null}
					</div>

					<div className="table-session-modal__secondary">
						<button type="button" className="btn btn-secondary" onClick={onOpenDetail}>
							Ver detalle
						</button>
						<button type="button" className="btn btn-secondary" onClick={onOpenEdit}>
							<Edit2 size={16} /> Editar
						</button>
					</div>

					<button type="button" className="table-session-modal__cancel" onClick={() => onCancel(order)}>
						<XCircle size={15} strokeWidth={1.75} aria-hidden />
						Cancelar pedido
					</button>
				</footer>
			</div>
		</div>
	);
}

export default function AdminTablesGrid({
	orders,
	moveOrder,
	closeOrderSession,
	branch,
	clients,
	logoUrl,
	companyName,
	showNotify,
	products,
	categories,
	onOrderSaved,
}) {
	const { formatMoney } = useMemo(() => createMoneyFormatter(branch), [branch]);
	const openSessions = filterOpenOrderSessions(orders);
	const [activeOrder, setActiveOrder] = useState(null);
	const [detailOpen, setDetailOpen] = useState(false);
	const [editOpen, setEditOpen] = useState(false);
	const [closeOpen, setCloseOpen] = useState(false);

	const handleMoveKitchen = (order) => {
		printOrderTicket(order, branch?.name, logoUrl ?? null, { variant: 'kitchen' });
		moveOrder(order.id, 'active');
		setActiveOrder(null);
	};

	const handleCancel = (order) => {
		const ok = window.confirm(`¿Cancelar #${order.shift_sequence ?? order.id}?`);
		if (!ok) return;
		moveOrder(order.id, 'cancelled');
		setActiveOrder(null);
	};

	return (
		<div className="tables-view animate-fade">
			{openSessions.length === 0 ? (
				<div className="tables-view__empty glass">
					<p>No hay mesas ni motos abiertas.</p>
					<p className="tables-view__empty-hint">Usa &quot;Abrir mesa&quot; o espera pedidos del menú.</p>
				</div>
			) : (
				<div className="tables-grid">
					{openSessions.map((order) => (
						<TableTile key={order.id} order={order} onClick={setActiveOrder} />
					))}
				</div>
			)}

			{activeOrder ? (
				<TableSessionModal
					order={activeOrder}
					formatMoney={formatMoney}
					onClose={() => setActiveOrder(null)}
					onMoveKitchen={handleMoveKitchen}
					onMarkReady={(order) => {
						moveOrder(order.id, 'completed');
						setActiveOrder(null);
					}}
					onCloseTable={() => setCloseOpen(true)}
					onOpenDetail={() => setDetailOpen(true)}
					onOpenEdit={() => setEditOpen(true)}
					onCancel={handleCancel}
				/>
			) : null}

			{detailOpen && activeOrder ? (
				<OrderDetailModal
					order={activeOrder}
					onClose={() => setDetailOpen(false)}
					branch={branch}
					logoUrl={logoUrl}
					companyName={companyName}
					showNotify={showNotify}
				/>
			) : null}

			{editOpen && activeOrder ? (
				<ManualOrderModal
					isOpen
					onClose={() => setEditOpen(false)}
					products={products}
					categories={categories}
					clients={clients}
					editOrder={activeOrder}
					moveOrder={moveOrder}
					onOrderSaved={() => {
						onOrderSaved?.();
						setEditOpen(false);
					}}
					showNotify={showNotify}
					branch={branch}
					logoUrl={logoUrl}
					companyName={companyName}
				/>
			) : null}

			{closeOpen && activeOrder ? (
				<CloseTableModal
					isOpen
					onClose={() => setCloseOpen(false)}
					order={activeOrder}
					branch={branch}
					showNotify={showNotify}
					onConfirm={async (order, paymentPatch) => {
						const ok = await closeOrderSession(order, paymentPatch);
						if (ok) {
							setCloseOpen(false);
							setActiveOrder(null);
						}
						return ok;
					}}
				/>
			) : null}
		</div>
	);
}
