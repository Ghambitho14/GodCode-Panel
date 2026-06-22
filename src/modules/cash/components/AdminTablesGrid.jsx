import React, { useEffect, useMemo, useState } from 'react';

import { createPortal } from 'react-dom';

import { ChefHat, CheckCircle2 } from 'lucide-react';

import { createMoneyFormatter } from '@/shared/utils/money';

import {

	getOrderTileKind,

	filterOpenOrderSessions,

} from '@/shared/utils/orderUtils';

import { useLockBodyScroll } from '@/shared/hooks/useLockBodyScroll';

import { printOrderTicket } from '../admin/utils/receiptPrinting';

import OrderDetailModal from './OrderDetailModal';

import ManualOrderModal from './ManualOrderModal';

import CloseTableModal from './CloseTableModal';

import TableTile from './TableTile';

import TableSessionReceipt from './TableSessionReceipt';



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

	const closeLabel = {
		mesa: 'Cerrar mesa',
		retiro: 'Cerrar retiro',
		moto: 'Cerrar delivery',
	}[kind] ?? 'Cerrar sesión';



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



	const primaryAction =

		order.status === 'pending' ? (

			<button

				type="button"

				className="table-session-receipt__cta"

				onClick={() => onMoveKitchen(order)}

			>

				<ChefHat size={18} aria-hidden />

				Enviar a cocina

			</button>

		) : order.status === 'active' ? (

			<button

				type="button"

				className="table-session-receipt__cta"

				onClick={() => onMarkReady(order)}

			>

				<CheckCircle2 size={18} aria-hidden />

				Marcar listo

			</button>

		) : order.status === 'completed' ? (

			<button

				type="button"

				className="table-session-receipt__cta"

				onClick={() => onCloseTable(order)}

			>

				{closeLabel}

			</button>

		) : null;



	const modal = (

		<div className="table-session-modal-portal tenant-theme-vars">

			<div className="table-session-modal-overlay" role="presentation" onClick={onClose}>

				<div className="admin-layout table-session-modal-portal-host">

					<div

						className={`table-session-modal table-session-modal--receipt table-session-modal--${order.status} table-session-modal--${kind}`}

						role="dialog"

						aria-modal="true"

						aria-labelledby="table-session-modal-title"

						onClick={(e) => e.stopPropagation()}

					>

						<TableSessionReceipt

							order={order}

							formatMoney={formatMoney}

							kind={kind}

							mode="session"

							titleId="table-session-modal-title"

							statusLabel={STATUS_LABEL[order.status] || order.status}

							onEdit={onOpenEdit}

							onCancel={() => onCancel(order)}

							footer={

								<>

									{primaryAction}

									<button

										type="button"

										className="table-session-receipt__link"

										onClick={(e) => {

											e.stopPropagation();

											onOpenDetail?.();

										}}

									>

										Ver detalle

									</button>

								</>

							}

						/>

					</div>

				</div>

			</div>

		</div>

	);



	if (typeof document === 'undefined') return null;

	return createPortal(modal, document.body);

}



export default function AdminTablesGrid({

	orders,

	moveOrder,

	closeOrderSession,

	markOrderSessionPaid,

	branch,

	clients,

	logoUrl,

	companyName,

	showNotify,

	products,

	categories,

	localOrderChannels = null,

	onOrderSaved,

}) {

	const { formatMoney } = useMemo(() => createMoneyFormatter(branch), [branch]);

	const openSessions = filterOpenOrderSessions(orders);

	const [activeOrder, setActiveOrder] = useState(null);

	const [detailOpen, setDetailOpen] = useState(false);

	const [editOpen, setEditOpen] = useState(false);

	const [closeOpen, setCloseOpen] = useState(false);

	const [payOpen, setPayOpen] = useState(false);

	const sessionModalOpen = Boolean(activeOrder) && !detailOpen && !editOpen && !closeOpen && !payOpen;

	useEffect(() => {
		if (!activeOrder) {
			setDetailOpen(false);
			setEditOpen(false);
			setCloseOpen(false);
			setPayOpen(false);
		}
	}, [activeOrder]);

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

						<TableTile
							key={order.id}
							order={order}
							onClick={setActiveOrder}
							branchName={branch?.name ?? null}
							logoUrl={logoUrl ?? null}
						/>

					))}

				</div>

			)}



			{sessionModalOpen ? (

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

					onMarkPaid={() => setPayOpen(true)}

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

					localOrderChannels={localOrderChannels}

				/>

			) : null}



			{payOpen && activeOrder ? (

				<CloseTableModal

					isOpen

					intent="pay"

					onClose={() => setPayOpen(false)}

					order={activeOrder}

					branch={branch}

					showNotify={showNotify}

					onConfirm={async (order, paymentPatch) => {

						const result = await markOrderSessionPaid(order, paymentPatch);

						if (result) {

							setPayOpen(false);

							if (result?.id) setActiveOrder(result);

						}

						return Boolean(result);

					}}

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

