import { callGuardedRpc } from '@/modules/cash/admin/utils/rpcGuard';
import { supabase, TABLES } from '@/integrations/supabase';
import { ORDERS_PANEL_SELECT, sanitizeOrder } from '@/shared/utils/orderUtils';

/** @typedef {{ cash: number; card: number; online: number }} PaymentBreakdown */

/**
 * @typedef {Object} AnalyticsPeriodSummary
 * @property {number} orderCount
 * @property {number} totalSales
 * @property {number} deliveryTotal
 * @property {number} deliveryCount
 * @property {Record<string, number>} byDay
 * @property {Record<string, number>} byHour
 * @property {Array<{ branchId: string; total: number; count: number }>} byBranch
 * @property {PaymentBreakdown} paymentBreakdown
 */

/**
 * @typedef {Object} AnalyticsSummary
 * @property {AnalyticsPeriodSummary} current
 * @property {AnalyticsPeriodSummary} prev
 */

/**
 * @param {unknown} raw
 * @returns {PaymentBreakdown}
 */
function normalizePaymentBreakdown(raw) {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return { cash: 0, card: 0, online: 0 };
	}
	const o = /** @type {Record<string, unknown>} */ (raw);
	return {
		cash: Number(o.cash) || 0,
		card: Number(o.card) || 0,
		online: Number(o.online) || 0,
	};
}

/**
 * @param {unknown} raw
 * @returns {Record<string, number>}
 */
function normalizeNumericMap(raw) {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
	const out = /** @type {Record<string, number>} */ ({});
	for (const [key, value] of Object.entries(/** @type {Record<string, unknown>} */ (raw))) {
		out[String(key)] = Number(value) || 0;
	}
	return out;
}

/**
 * @param {unknown} raw
 * @returns {AnalyticsPeriodSummary}
 */
export function normalizeAnalyticsPeriodSummary(raw) {
	const row = raw && typeof raw === 'object' && !Array.isArray(raw) ? /** @type {Record<string, unknown>} */ (raw) : {};
	const byBranchRaw = Array.isArray(row.by_branch) ? row.by_branch : [];
	return {
		orderCount: Number(row.order_count) || 0,
		totalSales: Number(row.total_sales) || 0,
		deliveryTotal: Number(row.delivery_total) || 0,
		deliveryCount: Number(row.delivery_count) || 0,
		byDay: normalizeNumericMap(row.by_day),
		byHour: normalizeNumericMap(row.by_hour),
		byBranch: byBranchRaw.map((entry) => {
			const e = entry && typeof entry === 'object' ? /** @type {Record<string, unknown>} */ (entry) : {};
			return {
				branchId: String(e.branch_id ?? '_sin_asignar_'),
				total: Number(e.total) || 0,
				count: Number(e.count) || 0,
			};
		}),
		paymentBreakdown: normalizePaymentBreakdown(row.payment_breakdown),
	};
}

/**
 * @param {unknown} raw
 * @returns {AnalyticsSummary | null}
 */
export function normalizeAnalyticsSummary(raw) {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
	const row = /** @type {Record<string, unknown>} */ (raw);
	return {
		current: normalizeAnalyticsPeriodSummary(row.current),
		prev: normalizeAnalyticsPeriodSummary(row.prev),
	};
}

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
 * @param {{
 *   companyId: string;
 *   branchId?: string | null;
 *   startIso?: string | null;
 *   endIso?: string | null;
 *   prevStartIso?: string | null;
 *   prevEndIso?: string | null;
 *   channel?: 'all' | 'online' | 'store';
 *   showNotify?: (msg: string, kind?: string) => void | null;
 * }} params
 * @returns {Promise<{ summary: AnalyticsSummary | null; error: unknown; notGranted: boolean }>}
 */
export async function fetchAnalyticsSummary({
	companyId,
	branchId = null,
	startIso = null,
	endIso = null,
	prevStartIso = null,
	prevEndIso = null,
	channel = 'all',
	showNotify = null,
}) {
	if (!companyId) {
		return { summary: null, error: null, notGranted: false };
	}

	const { data, error, notGranted } = await callGuardedRpc(
		'admin_analytics_summary',
		{
			p_company_id: companyId,
			p_branch_id: branchId && branchId !== 'all' ? branchId : null,
			p_start: startIso ?? null,
			p_end: endIso ?? null,
			p_prev_start: prevStartIso ?? null,
			p_prev_end: prevEndIso ?? null,
			p_channel: channel,
		},
		{ showNotify, label: 'Resumen de analytics' },
	);

	if (notGranted || error) {
		if (error && !notGranted) {
			console.error('admin_analytics_summary:', error);
		}
		return { summary: null, error, notGranted: Boolean(notGranted) };
	}

	return {
		summary: normalizeAnalyticsSummary(data),
		error: null,
		notGranted: false,
	};
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
