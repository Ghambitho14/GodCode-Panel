import { useMemo } from 'react';
import { useLocation } from '@/modules/cash/context/useLocation';
import { useAdmin } from '@/modules/cash/admin/pages/AdminProvider';
import { createMoneyFormatter } from '@/shared/utils/money';

/**
 * Formateo monetario según la sucursal seleccionada y país/moneda de la empresa.
 */
export function useBranchMoney() {
	const { selectedBranch } = useLocation();
	const { companyProfile } = useAdmin();

	return useMemo(
		() => createMoneyFormatter(selectedBranch, companyProfile),
		[selectedBranch, companyProfile],
	);
}
