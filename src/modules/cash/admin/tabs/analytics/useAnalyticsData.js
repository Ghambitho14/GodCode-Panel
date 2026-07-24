import { useEffect, useRef, useState } from 'react';
import { supabase, TABLES } from '@/integrations/supabase';
import { ORDERS_ANALYTICS_METRICS_SELECT } from '@/shared/utils/orderUtils';
import { fetchAnalyticsSummary, hasAnalyticsChartBuckets } from '../../../services/analyticsService';
import { fetchAllPaginated } from '@/shared/utils/fetchAllPaginated';

/**
 * @param {{
 *   companyId: string | null | undefined,
 *   selectedBranch: { id?: string } | null | undefined,
 *   reportRange: import('../../../utils/reportPeriodRange').ReportPeriodRange,
 *   chartTab: string,
 *   view: string,
 *   showNotify: (opts: object) => void,
 * }} params
 * @returns {{
 *   analyticsSummary: object | null,
 *   analyticsSource: 'rpc' | 'fallback' | 'none',
 *   analyticsOrders: object[],
 *   loadingAnalyticsOrders: boolean,
 * }}
 */
export function useAnalyticsData({
	companyId,
	selectedBranch,
	reportRange,
	chartTab,
	view,
	showNotify,
}) {
	const [analyticsOrders, setAnalyticsOrders] = useState([]);
	const [analyticsSummary, setAnalyticsSummary] = useState(null);
	/** @type {['rpc' | 'fallback' | 'none', React.Dispatch<React.SetStateAction<'rpc' | 'fallback' | 'none'>>]} */
	const [analyticsSource, setAnalyticsSource] = useState('none');
	const [loadingAnalyticsOrders, setLoadingAnalyticsOrders] = useState(false);
	const lastFetchedKeyRef = useRef(null);
	const inFlightKeyRef = useRef(null);

	useEffect(() => {
		const fetchKey = [
			companyId,
			selectedBranch?.id,
			reportRange.start?.getTime(),
			reportRange.end?.getTime(),
			reportRange.prevStart?.getTime(),
			reportRange.prevEnd?.getTime(),
			reportRange.hasComparison,
			reportRange.fetchStartIso,
			reportRange.fetchEndIso,
			chartTab,
			view,
		].join('|');
		if (!companyId || view === 'expensesOnly') {
			if (view === 'expensesOnly') {
				setAnalyticsSummary(null);
				setAnalyticsSource('none');
				setAnalyticsOrders([]);
				setLoadingAnalyticsOrders(false);
				lastFetchedKeyRef.current = null;
			}
			return;
		}
		if (lastFetchedKeyRef.current === fetchKey) {
			return;
		}
		inFlightKeyRef.current = fetchKey;
		let cancelled = false;
		setLoadingAnalyticsOrders(true);
		(async () => {
			let rpcSummary = null;
			let rpcError = null;
			let rpcNotGranted = false;

			try {
				const startIso = reportRange.start?.toISOString() ?? null;
				const endIso = reportRange.end?.toISOString() ?? null;
				const prevStartIso =
					reportRange.hasComparison && reportRange.prevStart
						? reportRange.prevStart.toISOString()
						: null;
				const prevEndIso =
					reportRange.hasComparison && reportRange.prevEnd
						? reportRange.prevEnd.toISOString()
						: null;
				const channel =
					chartTab === 'online' ? 'online' : chartTab === 'store' ? 'store' : 'all';

				const { summary, error, notGranted } = await fetchAnalyticsSummary({
					companyId,
					branchId: selectedBranch?.id,
					startIso,
					endIso,
					prevStartIso,
					prevEndIso,
					channel,
					showNotify,
				});

				if (cancelled) return;
				rpcSummary = summary;
				rpcError = error;
				rpcNotGranted = notGranted;
			} catch (e) {
				if (!cancelled) rpcError = e;
			}

			try {
				const fallbackStartIso =
					reportRange.prevStart?.toISOString()
					?? reportRange.fetchStartIso
					?? reportRange.start?.toISOString()
					?? null;
				const fallbackEndIso =
					reportRange.end?.toISOString() ?? reportRange.fetchEndIso ?? null;

				let q = supabase
					.from(TABLES.orders)
					.select(ORDERS_ANALYTICS_METRICS_SELECT)
					.eq('company_id', companyId);
				if (fallbackStartIso) {
					q = q.gte('created_at', fallbackStartIso);
				}
				if (fallbackEndIso) {
					q = q.lt('created_at', fallbackEndIso);
				}
				if (selectedBranch?.id && selectedBranch.id !== 'all') {
					q = q.eq('branch_id', selectedBranch.id);
				}
				const data = await fetchAllPaginated(
					q.order('created_at', { ascending: false }),
				);
				if (cancelled) return;

				setAnalyticsOrders(data);
				if (rpcSummary && !rpcError && !rpcNotGranted && hasAnalyticsChartBuckets(rpcSummary)) {
					setAnalyticsSummary(rpcSummary);
					setAnalyticsSource('rpc');
				} else {
					setAnalyticsSummary(null);
					setAnalyticsSource('fallback');
				}
			} catch (e) {
				console.error('Error fetching analytics orders:', e);
				if (!cancelled) {
					setAnalyticsOrders([]);
					if (rpcSummary && !rpcError && !rpcNotGranted && hasAnalyticsChartBuckets(rpcSummary)) {
						setAnalyticsSummary(rpcSummary);
						setAnalyticsSource('rpc');
					} else {
						setAnalyticsSummary(null);
						setAnalyticsSource('none');
					}
				}
			} finally {
				if (!cancelled) {
					setLoadingAnalyticsOrders(false);
					if (inFlightKeyRef.current === fetchKey) {
						lastFetchedKeyRef.current = fetchKey;
					}
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [
		companyId,
		selectedBranch?.id,
		reportRange.start?.getTime(),
		reportRange.end?.getTime(),
		reportRange.prevStart?.getTime(),
		reportRange.prevEnd?.getTime(),
		reportRange.hasComparison,
		reportRange.fetchStartIso,
		reportRange.fetchEndIso,
		chartTab,
		view,
		showNotify,
	]);

	return {
		analyticsSummary,
		analyticsSource,
		analyticsOrders,
		loadingAnalyticsOrders,
	};
}
