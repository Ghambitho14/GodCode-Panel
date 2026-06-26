import { callGuardedRpc } from '@/modules/cash/admin/utils/rpcGuard';
import { supabase, TABLES } from '@/integrations/supabase';
import { ORDERS_PANEL_SELECT, sanitizeOrder } from '@/shared/utils/orderUtils';

/**
 * @param {{ companyId: string; branchId?: string | null; startIso?: string | null; endIso?: string | null; limit?: number; showNotify?: (msg: string, kind?: string) => void }} params
 * @returns {Promise<Array<{ name: string; qty: number; revenue: number }>>}
 */
export async function fetchTopProducts({
	companyId,
	branchId = null,
	startIso = null,
	endIso = null,
	limit = 5,
	showNotify = null,
}) {
	if (!companyId) return [];

	const { data, error, notGranted } = await callGuardedRpc(
		'admin_analytics_top_products',
		{
			p_company_id: companyId,
			p_branch_id: branchId && branchId !== 'all' ? branchId : null,
			p_start: startIso ?? null,
			p_end: endIso ?? null,
			p_limit: limit,
		},
		{ showNotify, label: 'Top productos' },
	);

	if (notGranted || error) {
		if (error && !notGranted) {
			console.error('admin_analytics_top_products:', error);
		}
		return [];
	}

	const rows = Array.isArray(data) ? data : [];
	return rows.map((row) => ({
		name: String(row?.name ?? 'Desconocido'),
		qty: Number(row?.qty) || 0,
		revenue: Number(row?.revenue) || 0,
	}));
}

/**
 * @param {{ orderId: string | number; companyId: string }} params
 */
export async function fetchOrderWithItems({ orderId, companyId }) {
	if (orderId == null || orderId === '' || !companyId) return null;

	const { data, error } = await supabase
		.from(TABLES.orders)
		.select(ORDERS_PANEL_SELECT)
		.eq('id', orderId)
		.eq('company_id', companyId)
		.maybeSingle();

	if (error) throw error;
	return data ? sanitizeOrder(data) : null;
}
