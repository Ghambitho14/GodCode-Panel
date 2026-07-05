import { useCallback, useEffect, useRef } from 'react';
import { supabase, TABLES } from '@/integrations/supabase';
import { subscribeMonitored, closeMonitoredChannel } from '@/shared/subscribeMonitored';
import { mergeOrderInMemory } from '@/shared/utils/orderUtils';
import { playOrderNotificationSound, primeOrderNotificationAudio } from '../utils/playOrderNotificationSound';
import { shouldPlayOrderSound } from '../../utils/orderNotificationPrefs';
import { invalidateBranchOrders, invalidateBranchInventory } from '../../services/panelDataCache';

const ORDERS_RECONNECT_FETCH_MIN_MS = 15_000;

/** Tabs que no necesitan actualizaciones en tiempo real de pedidos. */
const TABS_WITHOUT_ORDERS_REALTIME = new Set(['analytics', 'local_expenses']);

/** @param {unknown} row */
function orderRealtimeBranchId(row) {
	if (!row || typeof row !== 'object') return null;
	const bid = row.branch_id ?? row.branchId;
	if (bid == null || bid === '') return null;
	return String(bid);
}

/**
 * Realtime de pedidos + sonido de notificación.
 */
export function useAdminOrdersRealtime({
	selectedBranchId,
	companyId,
	showOnlineOrdersQueue,
	branches,
	showNotify,
	refreshInventoryBranch,
	setOrders,
	fetchOrdersRef,
	activeTab,
}) {
	const inventoryRefreshTimerRef = useRef(null);
	const handleRealtimeEventRef = useRef(/** @type {(payload: unknown) => void} */ (() => {}));
	const ordersRealtimeDisconnectedRef = useRef(false);
	const ordersReconnectFetchTimerRef = useRef(null);
	const lastOrdersReconnectFetchAtRef = useRef(/** @type {number | null} */ (null));

	const handleRealtimeEvent = useCallback((payload) => {
		const sid = selectedBranchId;
		if (!sid) return;
		if (!showOnlineOrdersQueue) return;

		invalidateBranchOrders(companyId, sid);

		const isSingleBranch = sid !== 'all';

		if (payload.eventType === 'INSERT') {
			const raw = payload.new;
			const bid = orderRealtimeBranchId(raw);
			if (isSingleBranch && bid !== String(sid)) return;

			const newOrder = mergeOrderInMemory(null, raw);
			if (!newOrder?.id) return;
			setOrders((prev) => {
				const existingIdx = prev.findIndex((o) => o.id === newOrder.id);
				if (existingIdx >= 0) {
					return prev.map((o, i) =>
						i === existingIdx ? mergeOrderInMemory(o, raw) : o,
					);
				}
				return [newOrder, ...prev];
			});

			if (isSingleBranch) {
				showNotify(`Nuevo pedido #${newOrder.id.toString().slice(-4)}`, 'success');
				if (shouldPlayOrderSound(newOrder)) {
					playOrderNotificationSound();
				}
			} else {
				const branchName =
					(Array.isArray(branches) ? branches.find((b) => String(b.id) === bid)?.name : null) ||
					'Sucursal';
				showNotify(`Nuevo pedido #${newOrder.id.toString().slice(-4)} · ${branchName}`, 'success');
			}

			if (inventoryRefreshTimerRef.current) clearTimeout(inventoryRefreshTimerRef.current);
			inventoryRefreshTimerRef.current = setTimeout(() => {
				inventoryRefreshTimerRef.current = null;
				invalidateBranchInventory(sid);
				void refreshInventoryBranch({ force: true });
			}, 500);
			return;
		}

		if (payload.eventType === 'UPDATE') {
			const raw = payload.new;
			const bid = orderRealtimeBranchId(raw);
			if (isSingleBranch && bid != null && bid !== String(sid)) return;
			if (!raw?.id) return;
			setOrders((prev) => prev.map((o) => {
				if (o.id !== raw.id) return o;
				return mergeOrderInMemory(o, raw);
			}));
			return;
		}

		if (payload.eventType === 'DELETE') {
			const raw = payload.old;
			const bid = orderRealtimeBranchId(raw);
			if (isSingleBranch && bid != null && bid !== String(sid)) return;
			if (!raw?.id) return;
			setOrders((prev) => prev.filter((o) => o.id !== raw.id));
		}
	}, [
		showNotify,
		refreshInventoryBranch,
		selectedBranchId,
		branches,
		companyId,
		showOnlineOrdersQueue,
		setOrders,
	]);

	useEffect(() => {
		handleRealtimeEventRef.current = handleRealtimeEvent;
	}, [handleRealtimeEvent]);

	useEffect(() => {
		const onFirstInteract = () => {
			primeOrderNotificationAudio();
			window.removeEventListener('pointerdown', onFirstInteract);
			window.removeEventListener('keydown', onFirstInteract);
		};
		window.addEventListener('pointerdown', onFirstInteract, { passive: true });
		window.addEventListener('keydown', onFirstInteract);
		return () => {
			window.removeEventListener('pointerdown', onFirstInteract);
			window.removeEventListener('keydown', onFirstInteract);
		};
	}, []);

	useEffect(() => {
		if (!selectedBranchId) return;
		if (!showOnlineOrdersQueue) return;
		if (activeTab && TABS_WITHOUT_ORDERS_REALTIME.has(activeTab)) return;

		const handleOrdersRealtimeStatus = (status) => {
			if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
				ordersRealtimeDisconnectedRef.current = true;
				return;
			}
			if (status !== 'SUBSCRIBED' || !ordersRealtimeDisconnectedRef.current) return;
			ordersRealtimeDisconnectedRef.current = false;
			if (ordersReconnectFetchTimerRef.current) {
				clearTimeout(ordersReconnectFetchTimerRef.current);
			}
			const now = Date.now();
			const lastAt = lastOrdersReconnectFetchAtRef.current;
			if (lastAt != null && now - lastAt < ORDERS_RECONNECT_FETCH_MIN_MS) {
				return;
			}
			ordersReconnectFetchTimerRef.current = setTimeout(() => {
				ordersReconnectFetchTimerRef.current = null;
				lastOrdersReconnectFetchAtRef.current = Date.now();
				void fetchOrdersRef.current({ force: true });
			}, 2000);
		};

		const channel = subscribeMonitored(
			supabase
				.channel(`orders-realtime-${selectedBranchId}`)
				.on('postgres_changes', {
					event: '*',
					schema: 'public',
					table: 'orders',
					filter: selectedBranchId !== 'all' ? `branch_id=eq.${selectedBranchId}` : undefined,
				}, (payload) => {
					handleRealtimeEventRef.current(payload);
				}),
			{ name: 'orders', context: { branchId: selectedBranchId } },
			handleOrdersRealtimeStatus,
		);

		return () => {
			if (ordersReconnectFetchTimerRef.current) {
				clearTimeout(ordersReconnectFetchTimerRef.current);
				ordersReconnectFetchTimerRef.current = null;
			}
			if (inventoryRefreshTimerRef.current) {
				clearTimeout(inventoryRefreshTimerRef.current);
				inventoryRefreshTimerRef.current = null;
			}
			closeMonitoredChannel(supabase, channel);
		};
	}, [selectedBranchId, showOnlineOrdersQueue, fetchOrdersRef, activeTab, companyId]);

	return { handleRealtimeEvent };
}
