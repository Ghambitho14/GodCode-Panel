import { supabase, TABLES } from '@/integrations/supabase';
import { confirmDialog } from '../admin/utils/confirmDialog';

const LARGE_EXPORT_THRESHOLD = 1000;

/**
 * @param {{ companyId: string; branchId?: string | null; startIso: string; endIso: string }} params
 * @returns {Promise<number>}
 */
export async function countOrdersInRange({ companyId, branchId, startIso, endIso }) {
	if (!companyId || !startIso || !endIso) return 0;

	let query = supabase
		.from(TABLES.orders)
		.select('id', { count: 'exact', head: true })
		.eq('company_id', companyId)
		.gte('created_at', startIso)
		.lt('created_at', endIso);

	if (branchId && branchId !== 'all') {
		query = query.eq('branch_id', branchId);
	}

	const { count, error } = await query;
	if (error) throw error;
	return count ?? 0;
}

/**
 * @param {number} count
 * @param {number} [threshold]
 * @returns {Promise<boolean>}
 */
export function confirmLargeExport(count, threshold = LARGE_EXPORT_THRESHOLD, locale) {
	if (count <= threshold) return Promise.resolve(true);
	return confirmDialog({
		title: `Este mes tiene ${count.toLocaleString(locale)} pedidos`,
		text: 'El reporte descarga todos los pedidos incluyendo ítems y puede tardar.',
		confirmLabel: 'Descargar igual',
	});
}

export const MONTHLY_EXPORT_DISCLAIMER =
	'Este reporte descarga todos los pedidos del mes incluyendo ítems.';

export { LARGE_EXPORT_THRESHOLD };
