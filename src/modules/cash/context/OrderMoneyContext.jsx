import React, { createContext, useEffect, useMemo, useState } from 'react';

import { useLocation } from '@/modules/cash/context/useLocation';

import { useAdmin } from '@/modules/cash/admin/pages/AdminProvider';

import { createOrderMoneyFormatter } from '@/lib/money/order-amount';



export const OrderMoneyContext = createContext(null);



/**

 * Un único fetch de tasa/moneda por sucursal para todo el panel (evita N×useOrderMoney en kanban).

 * La tasa viene de useAdminBranchSettings vía AdminProvider — sin fetch duplicado aquí.

 */

export function OrderMoneyProvider({ children }) {

	const { selectedBranch } = useLocation();

	const { companyProfile, branchExchangeRate, ordersPanelSettingsReady } = useAdmin();

	const [exchangeRate, setExchangeRate] = useState(/** @type {number | null} */ (null));

	const branchId = selectedBranch?.id;



	useEffect(() => {

		if (!branchId || branchId === 'all') {

			setExchangeRate(null);

			return;

		}

		if (!ordersPanelSettingsReady) return;

		setExchangeRate(branchExchangeRate ?? null);

	}, [branchId, branchExchangeRate, ordersPanelSettingsReady]);



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

