import { useState, useRef, useCallback, useEffect } from 'react';
import { parseLocalOrderChannels, parseOrdersViewMode, normalizeDeliverySettings } from '@/lib/delivery-settings';
import { branchSettingsService } from '../../services/branchSettingsService';
import { invalidateBranchSettings } from '../../services/branchSettingsCache';
import { subscribeBranchUpdate } from '../../services/branchRealtimeHub';
import {
	DEFAULT_LOCAL_ORDER_CHANNELS,
	readInitialOrdersPanelSettings,
	readOrdersPanelSettingsCache,
	writeOrdersPanelSettingsCache,
} from './ordersPanelSettingsStorage';

/**
 * Vista de pedidos, canales locales y settings de delivery por sucursal.
 */
export function useAdminBranchSettings({ companyId, selectedBranch, showNotify }) {
	const initial = readInitialOrdersPanelSettings(companyId);

	const [ordersViewMode, setOrdersViewModeState] = useState(() => initial.ordersViewMode);
	const [ordersViewModeSaving, setOrdersViewModeSaving] = useState(false);
	const ordersViewModeRef = useRef(initial.ordersViewMode);
	const [localOrderChannels, setLocalOrderChannelsState] = useState(() => initial.localOrderChannels);
	const localOrderChannelsRef = useRef(initial.localOrderChannels);
	const [ordersPanelSettingsReady, setOrdersPanelSettingsReady] = useState(() => initial.ready);
	const [branchExchangeRate, setBranchExchangeRate] = useState(/** @type {number | null} */ (null));
	const [inventoryEnforceOnSale, setInventoryEnforceOnSale] = useState(false);

	useEffect(() => {
		ordersViewModeRef.current = ordersViewMode;
	}, [ordersViewMode]);

	useEffect(() => {
		localOrderChannelsRef.current = localOrderChannels;
	}, [localOrderChannels]);

	const loadOrdersPanelSettings = useCallback(async (branchId) => {
		if (!branchId || branchId === 'all') {
			setOrdersViewModeState('mesas');
			setLocalOrderChannelsState({ ...DEFAULT_LOCAL_ORDER_CHANNELS });
			setBranchExchangeRate(null);
			setInventoryEnforceOnSale(false);
			setOrdersPanelSettingsReady(true);
			return;
		}

		const cached = readOrdersPanelSettingsCache(companyId, branchId);
		if (cached) {
			setOrdersViewModeState(cached.ordersViewMode);
			setLocalOrderChannelsState(cached.localOrderChannels);
			ordersViewModeRef.current = cached.ordersViewMode;
			localOrderChannelsRef.current = cached.localOrderChannels;
			setOrdersPanelSettingsReady(true);
		} else {
			setOrdersPanelSettingsReady(false);
		}

		try {
			const deliveryData = await branchSettingsService.getDeliverySettings(branchId);
			if (String(selectedBranch?.id) !== String(branchId)) return;
			const view = parseOrdersViewMode(deliveryData);
			const channels = parseLocalOrderChannels(deliveryData);
			const normalizedDelivery = normalizeDeliverySettings(deliveryData);
			setOrdersViewModeState(view);
			setLocalOrderChannelsState(channels);
			setBranchExchangeRate(normalizedDelivery.exchangeRate ?? null);
			setInventoryEnforceOnSale(Boolean(normalizedDelivery.inventoryEnforceOnSale));
			ordersViewModeRef.current = view;
			localOrderChannelsRef.current = channels;
			writeOrdersPanelSettingsCache(companyId, branchId, {
				ordersViewMode: view,
				localOrderChannels: channels,
			});
		} catch (e) {
			if (!cached) {
				setOrdersViewModeState('mesas');
				setLocalOrderChannelsState({ ...DEFAULT_LOCAL_ORDER_CHANNELS });
				setBranchExchangeRate(null);
				setInventoryEnforceOnSale(false);
			}
			showNotify(e instanceof Error ? e.message : 'Error al cargar vista de pedidos', 'error');
		} finally {
			setOrdersPanelSettingsReady(true);
		}
	}, [companyId, showNotify, selectedBranch?.id]);

	useEffect(() => {
		void loadOrdersPanelSettings(selectedBranch?.id);
	}, [selectedBranch?.id, loadOrdersPanelSettings]);

	useEffect(() => {
		const branchId = selectedBranch?.id;
		if (!branchId || branchId === 'all') return;
		return subscribeBranchUpdate(branchId, () => {
			invalidateBranchSettings(branchId);
			void loadOrdersPanelSettings(branchId);
		});
	}, [selectedBranch?.id, loadOrdersPanelSettings]);

	const saveOrdersPanelSettings = useCallback(async ({ ordersViewMode: nextView, localOrderChannels: nextChannels }) => {
		const value = nextView === 'pedido' ? 'pedido' : 'mesas';
		const channels = parseLocalOrderChannels(nextChannels);
		if (!channels.mesa && !channels.retiro && !channels.delivery) {
			showNotify('Activa al menos un tipo de pedido local (Mesa, Retiro o Delivery)', 'error');
			return false;
		}
		const branchId = selectedBranch?.id;
		if (!branchId || branchId === 'all') {
			showNotify('Selecciona una sucursal concreta para guardar la vista de pedidos', 'error');
			return false;
		}
		const previousView = ordersViewModeRef.current;
		const previousChannels = localOrderChannelsRef.current;
		setOrdersViewModeSaving(true);
		try {
			await branchSettingsService.saveDeliverySettings(branchId, {
				ordersViewMode: value,
				localOrderChannels: channels,
			});
			setOrdersViewModeState(value);
			setLocalOrderChannelsState(channels);
			writeOrdersPanelSettingsCache(companyId, branchId, {
				ordersViewMode: value,
				localOrderChannels: channels,
			});
			showNotify('Vista de pedidos guardada');
			return true;
		} catch (e) {
			setOrdersViewModeState(previousView);
			setLocalOrderChannelsState(previousChannels);
			showNotify(e instanceof Error ? e.message : 'Error al guardar vista de pedidos', 'error');
			return false;
		} finally {
			setOrdersViewModeSaving(false);
		}
	}, [selectedBranch?.id, companyId, showNotify]);

	return {
		ordersViewMode,
		ordersViewModeSaving,
		localOrderChannels,
		ordersPanelSettingsReady,
		branchExchangeRate,
		inventoryEnforceOnSale,
		saveOrdersPanelSettings,
	};
}
