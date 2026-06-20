import { describe, expect, it } from 'vitest';
import {
	resolveReportPeriodRange,
	formatReportPeriodLabel,
	reportPeriodExportSlug,
	isCustomDayPeriod,
	parseCustomDay,
	ymdLocal,
	getCashShiftHistoryPeriodOptions,
} from '@/modules/cash/utils/reportPeriodRange';

const NOW = new Date('2026-06-20T15:00:00');

function localIso(d) {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T00:00:00.000`;
}

describe('resolveReportPeriodRange', () => {
	it('resuelve ayer con comparación al antier', () => {
		const r = resolveReportPeriodRange('yesterday', NOW);
		expect(localIso(r.start)).toBe('2026-06-19T00:00:00.000');
		expect(localIso(r.end)).toBe('2026-06-20T00:00:00.000');
		expect(localIso(r.prevStart)).toBe('2026-06-18T00:00:00.000');
		expect(localIso(r.prevEnd)).toBe('2026-06-19T00:00:00.000');
		expect(r.chartDateKeys).toEqual(['2026-06-19']);
		expect(r.displayLabel).toBe('Ayer');
	});

	it('resuelve semana actual lun–dom', () => {
		const r = resolveReportPeriodRange('week', NOW);
		expect(localIso(r.start)).toBe('2026-06-15T00:00:00.000');
		expect(localIso(r.end)).toBe('2026-06-22T00:00:00.000');
		expect(r.chartDateKeys).toHaveLength(7);
		expect(r.chartDateKeys[0]).toBe('2026-06-15');
		expect(r.chartDateKeys[6]).toBe('2026-06-21');
	});

	it('resuelve mes calendario actual', () => {
		const r = resolveReportPeriodRange('month', NOW);
		expect(localIso(r.start)).toBe('2026-06-01T00:00:00.000');
		expect(localIso(r.end)).toBe('2026-07-01T00:00:00.000');
		expect(localIso(r.prevStart)).toBe('2026-05-01T00:00:00.000');
		expect(localIso(r.prevEnd)).toBe('2026-06-01T00:00:00.000');
		expect(r.chartDateKeys).toHaveLength(30);
	});

	it('resuelve día específico', () => {
		const r = resolveReportPeriodRange('day:2026-06-10', NOW);
		expect(localIso(r.start)).toBe('2026-06-10T00:00:00.000');
		expect(localIso(r.end)).toBe('2026-06-11T00:00:00.000');
		expect(localIso(r.prevStart)).toBe('2026-06-09T00:00:00.000');
		expect(r.chartDateKeys).toEqual(['2026-06-10']);
	});

	it('rolling 7 días mantiene ventana y gráfico de 7 puntos', () => {
		const r = resolveReportPeriodRange('7', NOW);
		expect(r.dayCount).toBe(7);
		expect(r.chartDateKeys).toHaveLength(7);
		expect(r.chartDateKeys[0]).toBe('2026-06-14');
		expect(r.chartDateKeys[6]).toBe('2026-06-20');
		expect(r.fetchEndIso).toBeNull();
		expect(r.hasComparison).toBe(true);
		const cutoff = new Date(NOW);
		cutoff.setDate(NOW.getDate() - 7);
		expect(r.start.getTime()).toBe(cutoff.getTime());
	});

	it('all no tiene comparación ni filtro de fetch', () => {
		const r = resolveReportPeriodRange('all', NOW);
		expect(r.hasComparison).toBe(false);
		expect(r.fetchStartIso).toBeNull();
		expect(r.fetchEndIso).toBeNull();
		expect(r.dayCount).toBe(365);
	});
});

describe('helpers', () => {
	it('formatReportPeriodLabel formatea día específico', () => {
		expect(formatReportPeriodLabel('day:2026-06-15')).toMatch(/15.*jun.*2026/i);
	});

	it('parseCustomDay e isCustomDayPeriod', () => {
		expect(isCustomDayPeriod('day:2026-06-10')).toBe(true);
		expect(parseCustomDay('day:2026-06-10')).toBe('2026-06-10');
		expect(parseCustomDay('week')).toBeNull();
	});

	it('reportPeriodExportSlug', () => {
		expect(reportPeriodExportSlug('yesterday')).toBe('ayer');
		expect(reportPeriodExportSlug('day:2026-06-10')).toBe('dia_2026-06-10');
		expect(reportPeriodExportSlug('7')).toBe('ultimos_7d');
	});

	it('ymdLocal', () => {
		expect(ymdLocal(NOW)).toBe('2026-06-20');
	});

	it('formatReportPeriodLabel para rolling 365', () => {
		expect(formatReportPeriodLabel('365')).toBe('1 año');
	});

	it('getCashShiftHistoryPeriodOptions incluye calendario y rolling', () => {
		const opts = getCashShiftHistoryPeriodOptions();
		expect(opts.map((o) => o.value)).toEqual([
			'yesterday', 'week', 'month', 'day', '7', '30', '90', '365',
		]);
	});
});
