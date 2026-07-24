import { describe, expect, it } from 'vitest';

import {
	resolveReportPeriodRange,
	ymdLocal,
	startOfLocalDay,
	addLocalDays,
} from '@/modules/cash/utils/reportPeriodRange';
import {
	hasAnalyticsChartBuckets,
	normalizeAnalyticsPeriodSummary,
	normalizeAnalyticsSummary,
	normalizeTopProducts,
} from '@/modules/cash/services/analyticsService';

describe('resolveReportPeriodRange rolling', () => {
	it('alinea start/end y chartDateKeys en los mismos N días de calendario', () => {
		const now = new Date(2026, 6, 24, 13, 19, 0); // 24 jul 2026 local
		const range = resolveReportPeriodRange('7', now);

		expect(range.dayCount).toBe(7);
		expect(range.end).not.toBeNull();
		expect(ymdLocal(range.start)).toBe('2026-07-18');
		expect(ymdLocal(range.end)).toBe('2026-07-25');
		expect(range.chartDateKeys).toEqual([
			'2026-07-18',
			'2026-07-19',
			'2026-07-20',
			'2026-07-21',
			'2026-07-22',
			'2026-07-23',
			'2026-07-24',
		]);
		expect(range.chartDateKeys[0]).toBe(ymdLocal(range.start));
		expect(range.fetchStartIso).toBe(range.start.toISOString());
		expect(range.fetchEndIso).toBe(range.end.toISOString());
	});

	it('mantiene comparación del periodo anterior con la misma longitud', () => {
		const now = new Date(2026, 6, 24, 10, 0, 0);
		const range = resolveReportPeriodRange('7', now);
		expect(ymdLocal(range.prevStart)).toBe('2026-07-11');
		expect(ymdLocal(range.prevEnd)).toBe('2026-07-18');
		expect(addLocalDays(startOfLocalDay(range.prevStart), 7).getTime()).toBe(range.start.getTime());
	});
});

describe('analytics summary normalization', () => {
	it('acepta order_count y orders como alias', () => {
		const period = normalizeAnalyticsPeriodSummary({
			orders: 12,
			total_sales: 1000,
			by_day: { '2026-07-24': 500 },
			by_hour: { '13': 2 },
			payment_breakdown: { cash: 100, card: 200, online: 700 },
			by_branch: [{ branch_id: 'b1', total: 1000, count: 12 }],
		});
		expect(period.orderCount).toBe(12);
		expect(period.byDay['2026-07-24']).toBe(500);
		expect(period.paymentBreakdown.online).toBe(700);
	});

	it('detecta payloads RPC incompletos sin buckets', () => {
		const incomplete = normalizeAnalyticsSummary({
			current: { orders: 5, total_sales: 900 },
			previous: { orders: 1, total_sales: 100 },
		});
		expect(hasAnalyticsChartBuckets(incomplete)).toBe(false);

		const complete = normalizeAnalyticsSummary({
			current: { order_count: 5, total_sales: 900, by_day: { '2026-07-24': 900 } },
			previous: { order_count: 0, total_sales: 0, by_day: {} },
		});
		expect(hasAnalyticsChartBuckets(complete)).toBe(true);

		const empty = normalizeAnalyticsSummary({
			current: { order_count: 0, total_sales: 0, by_day: {} },
			previous: { order_count: 0, total_sales: 0, by_day: {} },
		});
		expect(hasAnalyticsChartBuckets(empty)).toBe(true);
	});

	it('normaliza top productos con name/qty/revenue o aliases legacy', () => {
		expect(normalizeTopProducts([
			{ name: 'Gohan de Pollo', qty: 13, revenue: 91000 },
			{ product_name: 'Ebi hot', total_quantity: 4, total_revenue: 24000 },
			{ name: 'Vacío', qty: 0, revenue: 0 },
		])).toEqual([
			{ name: 'Gohan de Pollo', qty: 13, revenue: 91000 },
			{ name: 'Ebi hot', qty: 4, revenue: 24000 },
		]);
	});
});
