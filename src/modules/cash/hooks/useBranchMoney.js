import { useMemo } from 'react';
import { useLocation } from '@/modules/cash/context/useLocation';
import { createMoneyFormatter } from '@/shared/utils/money';

/**
 * Formateo monetario según la sucursal seleccionada en LocationContext.
 */
export function useBranchMoney() {
	const { selectedBranch } = useLocation();

	return useMemo(() => createMoneyFormatter(selectedBranch), [selectedBranch]);
}
