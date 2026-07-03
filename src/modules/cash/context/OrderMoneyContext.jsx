import React, { createContext, useEffect, useMemo, useState } from 'react';
import { useLocation } from '@/modules/cash/context/useLocation';
import { useAdmin } from '@/modules/cash/admin/pages/AdminProvider';
import { normalizeDeliverySettings } from '@/lib/delivery-settings';
import { createOrderMoneyFormatter } from '@/lib/money/order-amount';
import { branchSettingsService } from '@/modules/cash/services/branchSettingsService';

export const OrderMoneyContext = createContext(null);

/**
 * Un único fetch de tasa/moneda por sucursal para todo el panel (evita N×useOrderMoney en kanban).
 */
export function OrderMoneyProvider({ children }) {
	const { selectedBranch } = useLocation();
	const { companyProfile } = useAdmin();
	const [exchangeRate, setExchangeRate] = useState(null);
	const branchId = selectedBranch?.id;

	useEffect(() => {
		if (!branchId || branchId === 'all') {
			setExchangeRate(null);
			return;
		}
		let cancelled = false;
		void branchSettingsService.getDeliverySettings(branchId).then((data) => {
			if (cancelled) return;
			const normalized = normalizeDeliverySettings(data);
			setExchangeRate(normalized.exchangeRate ?? null);
		}).catch(() => {
			if (!cancelled) setExchangeRate(null);
		});
		return () => {
			cancelled = true;
		};
	}, [branchId]);

	const branchWithRate = useMemo(() => {
		if (!selectedBranch || exchangeRate == null) return selectedBranch;
		return {
			...selectedBranch,
			delivery_settings: {
				...(selectedBranch.delivery_settings && typeof selectedBranch.delivery_settings === 'object'
					? selectedBranch.delivery_settings
					: {}),
				exchangeRate,
			},
		};
	}, [selectedBranch, exchangeRate]);

	const value = useMemo(
		() => createOrderMoneyFormatter({ branch: branchWithRate, company: companyProfile }),
		[branchWithRate, companyProfile],
	);

	return (
		<OrderMoneyContext.Provider value={value}>
			{children}
		</OrderMoneyContext.Provider>
	);
}
