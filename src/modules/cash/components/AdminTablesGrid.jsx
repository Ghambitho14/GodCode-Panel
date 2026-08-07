import React, { useEffect, useMemo, useState } from 'react';

import { createPortal } from 'react-dom';

import { Armchair, Banknote, ChefHat, CheckCircle2, PlusCircle } from 'lucide-react';

import { useOrderMoney } from '@/modules/cash/hooks/useOrderMoney';

import {
	getOrderTileKind,
	filterOpenOrderSessions,
	isOrderPaymentDeferred,
	summarizeOrderLinesDelivery,
} from '@/shared/utils/orderUtils';

import { useLockBodyScroll } from '@/shared/hooks/useLockBodyScroll';

import { printOrderTicket } from '../admin/utils/receiptPrinting';

import OrderDetailModal from './OrderDetailModal';

import ManualOrderModal from './ManualOrderModal';

import CloseTableModal from './CloseTableModal';

import TableTile from './TableTile';

import TableSessionReceipt from './TableSessionReceipt';
import { Button } from "@/components/ui/button";
import { useAdmin } from '@/modules/cash/admin/pages/AdminProvider';
import { branchTablesService } from '../services/branchTablesService';
import { orderLifecycleV3Service } from '../services/orderLifecycleV3Service';



const STATUS_LABEL = {

	pending: 'Abierta',

	active: 'En cocina',

	completed: 'Lista',

};



function TableSessionModal({

	order,

	formatMoney,

	formatOrderTotal,

	onClose,

	onMoveKitchen,

	onMarkReady,

	onCloseTable,

	onMarkPaid,

	onOpenDetail,

	onOpenEdit,

	onCancel,

	showNotify,

	onDeliveryProgressChange,

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

			<Button variant="default"

				type="button"

				className="table-session-receipt__cta"

				onClick={() => onMoveKitchen(order)}

			>

				<ChefHat size={18} aria-hidden />

				Enviar a cocina

			</Button>

		) : order.status === 'active' ? (

			<Button variant="default"

				type="button"

				className="table-session-receipt__cta"

				onClick={() => onMarkReady(order)}

			>

				<CheckCircle2 size={18} aria-hidden />

				Marcar listo

			</Button>

		) : order.status === 'completed' ? (

			<Button variant="default"

				type="button"

				className="table-session-receipt__cta"

				onClick={() => onCloseTable(order)}

			>

				{closeLabel}

			</Button>

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

							formatOrderTotal={formatOrderTotal}

							kind={kind}

							mode="session"

							titleId="table-session-modal-title"

							statusLabel={STATUS_LABEL[order.status] || order.status}

							onEdit={onOpenEdit}

							onCancel={() => onCancel(order)}

							onClose={onClose}

							showNotify={showNotify}

							onDeliveryProgressChange={onDeliveryProgressChange}

							footer={

								<>

									{onOpenEdit ? (
										<Button
											variant="secondary"
											type="button"
											className="table-session-receipt__cta table-session-receipt__cta--add"
											onClick={onOpenEdit}
										>
											<PlusCircle size={18} aria-hidden />
											Agregar productos
										</Button>
									) : null}

									{primaryAction}

									{isOrderPaymentDeferred(order) ? (
										<Button
											variant="secondary"
											type="button"
											className="table-session-receipt__link"
											onClick={() => onMarkPaid?.(order)}
										>
											<Banknote size={17} aria-hidden />
											Cobrar ahora
										</Button>
									) : null}

									<Button variant="default"

										type="button"

										className="table-session-receipt__link"

										onClick={(e) => {

											e.stopPropagation();

											onOpenDetail?.();

										}}

									>

										Ver detalle

									</Button>

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

	const orderMoney = useOrderMoney();
	const {
		setActiveTab,
		companyId,
		pendingTableSessionOrderId,
		setPendingTableSessionOrderId,
	} = useAdmin();
	const { formatMoney, formatOrderAmount } = orderMoney;
	const formatOrderTotal = (amount, orderRow) => formatOrderAmount({
		amountUsd: amount,
		order: orderRow,
		paymentMethod: orderRow?.payment_method_specific,
	});

	const openSessions = useMemo(() => filterOpenOrderSessions(orders), [orders]);

	const openSessionIdsKey = useMemo(
		() => openSessions.map((o) => `${o.id}:${o.updated_at ?? ''}`).sort().join('|'),
		[openSessions],
	);

	const [activeOrder, setActiveOrder] = useState(null);

	const [detailOpen, setDetailOpen] = useState(false);

	const [editOpen, setEditOpen] = useState(false);

	const [closeOpen, setCloseOpen] = useState(false);

	const [payOpen, setPayOpen] = useState(false);

	const [branchTables, setBranchTables] = useState([]);

	const [tablesLoading, setTablesLoading] = useState(false);

	/** @type {[Record<string, { ordered: number, served: number, pending: number }>, Function]} */
	const [deliveryByOrderId, setDeliveryByOrderId] = useState({});

	const [deliveryRefreshKey, setDeliveryRefreshKey] = useState(0);

	const bumpDeliveryProgress = React.useCallback(() => {
		setDeliveryRefreshKey((n) => n + 1);
	}, []);

	const sessionModalOpen = Boolean(activeOrder) && !detailOpen && !editOpen && !closeOpen && !payOpen;

	useEffect(() => {
		if (!activeOrder) {
			setDetailOpen(false);
			setEditOpen(false);
			setCloseOpen(false);
			setPayOpen(false);
		}
	}, [activeOrder]);

	useEffect(() => {
		if (!activeOrder?.id) return;
		const fresh = (orders || []).find((o) => String(o.id) === String(activeOrder.id));
		if (!fresh) return;
		if (String(fresh.updated_at ?? '') !== String(activeOrder.updated_at ?? '')) {
			setActiveOrder(fresh);
		}
	}, [orders, activeOrder]);

	useEffect(() => {
		if (!openSessionIdsKey) {
			setDeliveryByOrderId({});
			return undefined;
		}
		const ids = [...new Set(
			openSessionIdsKey.split('|').map((part) => part.split(':')[0]).filter(Boolean),
		)];
		if (!ids.length) {
			setDeliveryByOrderId({});
			return undefined;
		}
		let cancelled = false;
		void Promise.all(
			ids.map(async (id) => {
				try {
					const lines = await orderLifecycleV3Service.listLines(id);
					return [id, summarizeOrderLinesDelivery(lines)];
				} catch {
					return [id, { ordered: 0, served: 0, pending: 0 }];
				}
			}),
		).then((entries) => {
			if (!cancelled) setDeliveryByOrderId(Object.fromEntries(entries));
		});
		return () => {
			cancelled = true;
		};
	}, [openSessionIdsKey, deliveryRefreshKey]);

	useEffect(() => {
		let cancelled = false;
		const branchId = branch?.id;
		if (!branchId || branchId === 'all') {
			setBranchTables([]);
			return undefined;
		}
		setTablesLoading(true);
		void branchTablesService.listByBranch(branchId)
			.then((rows) => {
				if (!cancelled) setBranchTables(rows);
			})
			.catch(() => {
				if (!cancelled) setBranchTables([]);
			})
			.finally(() => {
				if (!cancelled) setTablesLoading(false);
			});
		return () => { cancelled = true; };
	}, [branch?.id]);

	const tableById = useMemo(() => {
		const map = new Map();
		for (const t of branchTables) {
			map.set(String(t.id), t);
		}
		return map;
	}, [branchTables]);

	useEffect(() => {
		if (!pendingTableSessionOrderId) return;
		const order = (orders || []).find((o) => String(o.id) === String(pendingTableSessionOrderId));
		if (order) {
			setActiveOrder(order);
			setPendingTableSessionOrderId(null);
		}
	}, [pendingTableSessionOrderId, orders, setPendingTableSessionOrderId]);

	const goConfigureTables = () => {
		const branchKey = branch?.id ?? '__none__';
		const storageKey = companyId
			? `tenant-admin:${companyId}:menuOptionsSubTab:${branchKey}`
			: `tenant-admin:local:menuOptionsSubTab:${branchKey}`;
		try {
			localStorage.setItem(storageKey, 'tables');
		} catch {
			/* ignore */
		}
		setActiveTab?.('menu_options');
	};

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
					{!tablesLoading && branchTables.length === 0 && branch?.id && branch.id !== 'all' ? (
						<>
							<Armchair size={28} aria-hidden className="tables-view__empty-icon" />
							<p>Todavía no hay mesas configuradas en esta sucursal.</p>
							<p className="tables-view__empty-hint">
								Creá el plano del salón en Opciones → Mesas para poder Abrir mesa.
							</p>
							<Button
								type="button"
								variant="default"
								className="tables-view__empty-cta"
								onClick={goConfigureTables}
							>
								Configurar mesas
							</Button>
						</>
					) : (
						<>
							<p>No hay mesas ni motos abiertas.</p>
							<p className="tables-view__empty-hint">Usa &quot;Abrir mesa&quot; o espera pedidos del menú.</p>
						</>
					)}
				</div>

			) : (

				<div className="tables-grid">

					{openSessions.map((order) => {
						const linked = order.table_id ? tableById.get(String(order.table_id)) : null;
						const tableCode = linked?.code || order.table_number || null;
						const enriched = tableCode
							? { ...order, table_number: tableCode }
							: order;
						return (
							<TableTile
								key={order.id}
								order={enriched}
								onClick={setActiveOrder}
								branch={branch}
								branchName={branch?.name ?? null}
								logoUrl={logoUrl ?? null}
								deliveryProgress={deliveryByOrderId[String(order.id)] ?? null}
							/>
						);
					})}

				</div>

			)}



			{sessionModalOpen ? (

				<TableSessionModal

					order={activeOrder}

					formatMoney={formatMoney}

					formatOrderTotal={formatOrderTotal}

					onClose={() => setActiveOrder(null)}

					onMoveKitchen={handleMoveKitchen}

					onMarkReady={(order) => {

						moveOrder(order.id, 'completed');

						setActiveOrder(null);

					}}

					onCloseTable={() => setCloseOpen(true)}

					onMarkPaid={() => setPayOpen(true)}

					onOpenDetail={() => setDetailOpen(true)}

					onOpenEdit={() => setEditOpen(true)}

					onCancel={handleCancel}

					showNotify={showNotify}

					onDeliveryProgressChange={bumpDeliveryProgress}

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

						bumpDeliveryProgress();

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

