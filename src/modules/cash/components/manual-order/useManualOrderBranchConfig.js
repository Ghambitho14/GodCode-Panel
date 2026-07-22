import { useEffect, useState } from 'react';
import { branchSettingsService } from '../../services/branchSettingsService';
import { normalizeDeliverySettings } from '@/lib/delivery-settings';
import { normalizeManualOrderSettings } from '../../domain/manual-order-settings';

function branchFlag(map, branchId, defaultOn = true) {
	if (!branchId || !map || typeof map !== 'object') return defaultOn;
	if (Object.prototype.hasOwnProperty.call(map, branchId)) {
		return map[branchId] !== false;
	}
	return defaultOn;
}

function normalizeCartUpsellCatalog(catalog, kind) {
	if (!Array.isArray(catalog)) return [];
	return catalog.flatMap((row) => {
		if (!row || typeof row !== 'object' || Array.isArray(row)) return [];
		const id = String(row.id ?? '').trim();
		const name = String(row.name ?? '').trim();
		const price = Number(row.price);
		if (!id || !name || !Number.isFinite(price) || price < 0) return [];
		const category = String(row.category ?? row.catalogCategory ?? row.group ?? '').trim();
		const beverageKind = String(row.beverageKind ?? row.beverage_kind ?? '').trim();
		const imageUrl = String(row.imageUrl ?? row.image_url ?? '').trim();

		if (row.active === false || row.is_active === false || row.enabled === false) return [];

		return [{
			id,
			name,
			price,
			has_discount: false,
			discount_price: null,
			image_url: imageUrl,
			description: beverageKind || null,
			category_name: category,
			manual_order_source: kind,
			is_active: true,
		}];
	});
}

export default function useManualOrderBranchConfig(isOpen, branch) {
	const [branchDeliveryCfg, setBranchDeliveryCfg] = useState(null);
	const [branchDeliveryCfgLoading, setBranchDeliveryCfgLoading] = useState(false);
	const [branchConfigError, setBranchConfigError] = useState(null);
	const [manualOrderSettings, setManualOrderSettings] = useState(() => normalizeManualOrderSettings(null));
	const [paymentMethods, setPaymentMethods] = useState([]);
	const [reloadKey, setReloadKey] = useState(0);
	const [cartUpsellCatalogs, setCartUpsellCatalogs] = useState({
		beveragesEnabled: false,
		extrasEnabled: false,
		beverages: [],
		extras: [],
	});

	useEffect(() => {
		let cancelled = false;
		const resetCatalogs = () => {
			setCartUpsellCatalogs({
				beveragesEnabled: false,
				extrasEnabled: false,
				beverages: [],
				extras: [],
			});
		};

		if (!isOpen || !branch?.id || branch.id === 'all') {
			resetCatalogs();
			setBranchDeliveryCfg(null);
			setBranchDeliveryCfgLoading(false);
			setBranchConfigError(null);
			return undefined;
		}

		const loadCatalogs = async () => {
			setBranchDeliveryCfgLoading(true);
			setBranchConfigError(null);
			setBranchDeliveryCfg(null);
			setManualOrderSettings(normalizeManualOrderSettings(null));
			setPaymentMethods([]);
			resetCatalogs();
			try {
				const data = await branchSettingsService.getDeliveryConfig(branch.id);
				if (cancelled) return;
				if (!data) {
					resetCatalogs();
					setBranchDeliveryCfg(null);
					setBranchConfigError('La sucursal no devolvió una configuración válida.');
					return;
				}

				setBranchDeliveryCfg({
					...normalizeDeliverySettings(data),
					originLat: data.originLat ?? null,
					originLng: data.originLng ?? null,
				});
				setManualOrderSettings(normalizeManualOrderSettings(data.manualOrderSettings, data.localOrderChannels));
				setPaymentMethods(Array.isArray(data.paymentMethods) ? data.paymentMethods : []);
				setCartUpsellCatalogs({
					beveragesEnabled: branchFlag(data.beveragesUpsellEnabledByBranch, branch.id, true),
					extrasEnabled: branchFlag(data.extrasEnabledByBranch, branch.id, true),
					beverages: normalizeCartUpsellCatalog(data.cartBeveragesCatalog, 'beverages'),
					extras: normalizeCartUpsellCatalog(data.cartGlobalExtrasCatalog, 'extras'),
				});
			} catch (error) {
				if (!cancelled) {
					resetCatalogs();
					setBranchDeliveryCfg(null);
					setPaymentMethods([]);
					setBranchConfigError(error instanceof Error ? error.message : 'No se pudo cargar la configuración de la sucursal.');
				}
			} finally {
				if (!cancelled) setBranchDeliveryCfgLoading(false);
			}
		};

		void loadCatalogs();
		return () => {
			cancelled = true;
		};
	}, [isOpen, branch?.id, reloadKey]);

	return {
		branchDeliveryCfg,
		branchDeliveryCfgLoading,
		branchConfigError,
		manualOrderSettings,
		paymentMethods,
		cartUpsellCatalogs,
		retryBranchConfig: () => setReloadKey((value) => value + 1),
	};
}
