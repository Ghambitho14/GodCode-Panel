import { describe, expect, it } from 'vitest';

import {
	applyComparisonMode,
	buildCustomRangeValue,
	formatReportPeriodLabel,
	getReportPeriodOptions,
	parseCustomRange,
	reportPeriodExportSlug,
	resolveReportPeriodRange,
	ymdLocal,
} from '@/modules/cash/utils/reportPeriodRange';

describe('rango de fechas libre (range:YYYY-MM-DD..YYYY-MM-DD)', () => {
	it('parsea y ordena los extremos', () => {
		expect(parseCustomRange('range:2026-09-01..2026-09-15')).toEqual({ from: '2026-09-01', to: '2026-09-15' });
		expect(parseCustomRange('range:2026-09-15..2026-09-01')).toEqual({ from: '2026-09-01', to: '2026-09-15' });
		expect(parseCustomRange('range:2026-9-1..2026-09-15')).toBeNull();
		expect(parseCustomRange('7')).toBeNull();
		expect(buildCustomRangeValue('2026-09-01', '2026-09-15')).toBe('range:2026-09-01..2026-09-15');
	});

	it('resuelve el rango inclusive y compara con el tramo anterior de igual duración', () => {
		const range = resolveReportPeriodRange('range:2026-09-01..2026-09-15');
		expect(ymdLocal(range.start)).toBe('2026-09-01');
		expect(ymdLocal(range.end)).toBe('2026-09-16');
		expect(range.dayCount).toBe(15);
		expect(range.chartDateKeys).toHaveLength(15);
		expect(range.hasComparison).toBe(true);
		expect(ymdLocal(range.prevStart)).toBe('2026-08-17');
		expect(ymdLocal(range.prevEnd)).toBe('2026-09-01');
	});

	it('un rango de un solo día se comporta como día específico', () => {
		const range = resolveReportPeriodRange('range:2026-09-10..2026-09-10');
		expect(range.dayCount).toBe(1);
		expect(ymdLocal(range.prevStart)).toBe('2026-09-09');
	});

	it('aparece en el selector, tiene etiqueta legible y slug de exportación', () => {
		expect(getReportPeriodOptions().some((o) => o.value === 'range')).toBe(true);
		expect(formatReportPeriodLabel('range:2026-09-01..2026-09-15', undefined, 'es-CL')).toMatch(/1.*sept.*15.*sept.*2026/i);
		expect(reportPeriodExportSlug('range:2026-09-01..2026-09-15')).toBe('rango_2026-09-01_2026-09-15');
	});
});

describe('modo de comparación', () => {
	const base = resolveReportPeriodRange('range:2026-09-01..2026-09-15');

	it("'previous' deja el rango tal cual", () => {
		expect(applyComparisonMode(base, 'previous')).toBe(base);
	});

	it("'year' compara con las mismas fechas del año anterior", () => {
		const r = applyComparisonMode(base, 'year');
		expect(r.hasComparison).toBe(true);
		expect(ymdLocal(r.prevStart)).toBe('2025-09-01');
		expect(ymdLocal(r.prevEnd)).toBe('2025-09-16');
		expect(r.start).toBe(base.start);
	});

	it("'none' apaga la comparación", () => {
		const r = applyComparisonMode(base, 'none');
		expect(r.hasComparison).toBe(false);
		expect(r.prevStart).toBeNull();
		expect(r.prevEnd).toBeNull();
	});

	it("'year' también da comparación a 'Todo', que por defecto no la tiene", () => {
		const all = resolveReportPeriodRange('all');
		expect(all.hasComparison).toBe(false);
		expect(applyComparisonMode(all, 'year').hasComparison).toBe(true);
	});
});
