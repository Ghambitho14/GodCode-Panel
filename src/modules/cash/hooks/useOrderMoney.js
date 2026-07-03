import { useContext, useMemo } from 'react';
import { useLocation } from '@/modules/cash/context/useLocation';
import { useAdmin } from '@/modules/cash/admin/pages/AdminProvider';
import { createOrderMoneyFormatter } from '@/lib/money/order-amount';
import { OrderMoneyContext } from '@/modules/cash/context/OrderMoneyContext';

/**
 * Formateo monetario según sucursal + empresa (dual USD/Bs. en Venezuela).
 * Lee del OrderMoneyProvider (un fetch por sucursal); sin provider, fallback sin fetch extra.
 */
export function useOrderMoney() {
	const ctx = useContext(OrderMoneyContext);
	const { selectedBranch } = useLocation();
	const { companyProfile } = useAdmin();

	const fallback = useMemo(
		() => createOrderMoneyFormatter({ branch: selectedBranch, company: companyProfile }),
		[selectedBranch, companyProfile],
	);

	return ctx ?? fallback;
}
