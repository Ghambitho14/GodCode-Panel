/** @param {Date} d */
export function ymdLocal(d) {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

/** @param {Date} d */
export function startOfLocalDay(d) {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** @param {Date} d @param {number} n */
export function addLocalDays(d, n) {
	const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
	x.setDate(x.getDate() + n);
	return x;
}

/** Lunes como inicio de semana (local). */
export function startOfLocalWeek(d) {
	const x = startOfLocalDay(d);
	const dow = (x.getDay() + 6) % 7;
	return addLocalDays(x, -dow);
}

/** @param {Date} d */
export function startOfLocalMonth(d) {
	return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** @param {Date} start @param {Date} endExclusive */
export function chartKeysBetween(start, endExclusive) {
	const keys = [];
	let cursor = startOfLocalDay(start);
	const end = startOfLocalDay(endExclusive);
	while (cursor < end) {
		keys.push(ymdLocal(cursor));
		cursor = addLocalDays(cursor, 1);
	}
	return keys;
}

/** @param {string} value */
export function isCustomDayPeriod(value) {
	return String(value).startsWith('day:');
}

/** @param {string} value */
export function parseCustomDay(value) {
	if (!isCustomDayPeriod(value)) return null;
	const ymd = String(value).slice(4);
	return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null;
}

export const CUSTOM_DAY_MENU_VALUE = 'day';

export function getReportPeriodOptions() {
	return [
		{ value: 'yesterday', label: 'Ayer' },
		{ value: 'week', label: 'Semana actual' },
		{ value: 'month', label: 'Mes actual' },
		{ value: CUSTOM_DAY_MENU_VALUE, label: 'Día específico' },
		{ value: '7', label: '7 días' },
		{ value: '15', label: '15 días' },
		{ value: '30', label: '30 días' },
		{ value: '90', label: '3 meses' },
		{ value: 'all', label: 'Todo' },
	];
}

export function getCashShiftHistoryPeriodOptions() {
	return [
		{ value: 'yesterday', label: 'Ayer' },
		{ value: 'week', label: 'Semana actual' },
		{ value: 'month', label: 'Mes actual' },
		{ value: CUSTOM_DAY_MENU_VALUE, label: 'Día específico' },
		{ value: '7', label: '7 días' },
		{ value: '30', label: '30 días' },
		{ value: '90', label: '3 meses' },
		{ value: '365', label: '1 año' },
	];
}

/** @param {string} periodValue @param {Array<{ value: string, label: string }>} [options] */
export function formatReportPeriodLabel(periodValue, options) {
	const custom = parseCustomDay(periodValue);
	if (custom) {
		const [y, mo, d] = custom.split('-').map(Number);
		if (Number.isFinite(y) && Number.isFinite(mo) && Number.isFinite(d)) {
			return new Date(y, mo - 1, d).toLocaleDateString('es-CL', {
				day: 'numeric',
				month: 'short',
				year: 'numeric',
			});
		}
	}

	const rollingDays = parseInt(periodValue, 10);
	if (Number.isFinite(rollingDays) && rollingDays > 0 && String(rollingDays) === periodValue) {
		if (rollingDays === 90) return '3 meses';
		if (rollingDays === 365) return '1 año';
		return `${rollingDays} días`;
	}

	const lookup = options ?? getReportPeriodOptions();
	const opt = lookup.find((o) => o.value === periodValue);
	if (opt) return opt.label;

	const cashOpt = getCashShiftHistoryPeriodOptions().find((o) => o.value === periodValue);
	return cashOpt?.label ?? '—';
}

/** @param {string} periodValue */
export function reportPeriodExportSlug(periodValue) {
	if (periodValue === 'all') return 'todo';
	if (periodValue === 'yesterday') return 'ayer';
	if (periodValue === 'week') return 'semana_actual';
	if (periodValue === 'month') return 'mes_actual';
	const custom = parseCustomDay(periodValue);
	if (custom) return `dia_${custom}`;
	const n = parseInt(periodValue, 10);
	if (Number.isFinite(n) && n > 0) return `ultimos_${n}d`;
	return 'periodo';
}

/**
 * @param {string} periodValue
 * @param {Date} [now]
 */
export function resolveReportPeriodRange(periodValue, now = new Date()) {
	const rollingDays = parseInt(periodValue, 10);
	const isRolling = Number.isFinite(rollingDays) && rollingDays > 0 && String(rollingDays) === periodValue;

	if (periodValue === 'all') {
		const chartStart = addLocalDays(startOfLocalDay(now), -364);
		const chartEnd = addLocalDays(startOfLocalDay(now), 1);
		return {
			start: chartStart,
			end: chartEnd,
			prevStart: null,
			prevEnd: null,
			chartDateKeys: chartKeysBetween(chartStart, chartEnd),
			dayCount: 365,
			displayLabel: 'Todo',
			fetchStartIso: chartStart.toISOString(),
			fetchEndIso: chartEnd.toISOString(),
			hasComparison: false,
		};
	}

	if (isRolling) {
		const cutoff = new Date(now);
		cutoff.setDate(now.getDate() - rollingDays);
		const prevCutoff = new Date(cutoff);
		prevCutoff.setDate(cutoff.getDate() - rollingDays);
		const chartStart = addLocalDays(startOfLocalDay(now), -(rollingDays - 1));
		const chartEnd = addLocalDays(startOfLocalDay(now), 1);
		return {
			start: cutoff,
			end: null,
			prevStart: prevCutoff,
			prevEnd: cutoff,
			chartDateKeys: chartKeysBetween(chartStart, chartEnd),
			dayCount: rollingDays,
			displayLabel: formatReportPeriodLabel(periodValue),
			fetchStartIso: cutoff.toISOString(),
			fetchEndIso: null,
			hasComparison: true,
		};
	}

	if (periodValue === 'yesterday') {
		const todayStart = startOfLocalDay(now);
		const start = addLocalDays(todayStart, -1);
		const end = todayStart;
		const prevStart = addLocalDays(start, -1);
		return {
			start,
			end,
			prevStart,
			prevEnd: start,
			chartDateKeys: chartKeysBetween(start, end),
			dayCount: 1,
			displayLabel: 'Ayer',
			fetchStartIso: start.toISOString(),
			fetchEndIso: end.toISOString(),
			hasComparison: true,
		};
	}

	if (periodValue === 'week') {
		const start = startOfLocalWeek(now);
		const end = addLocalDays(start, 7);
		const prevStart = addLocalDays(start, -7);
		return {
			start,
			end,
			prevStart,
			prevEnd: start,
			chartDateKeys: chartKeysBetween(start, end),
			dayCount: 7,
			displayLabel: 'Semana actual',
			fetchStartIso: start.toISOString(),
			fetchEndIso: end.toISOString(),
			hasComparison: true,
		};
	}

	if (periodValue === 'month') {
		const start = startOfLocalMonth(now);
		const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
		const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
		return {
			start,
			end,
			prevStart,
			prevEnd: start,
			chartDateKeys: chartKeysBetween(start, end),
			dayCount: chartKeysBetween(start, end).length,
			displayLabel: 'Mes actual',
			fetchStartIso: start.toISOString(),
			fetchEndIso: end.toISOString(),
			hasComparison: true,
		};
	}

	const customYmd = parseCustomDay(periodValue);
	if (customYmd) {
		const [y, mo, d] = customYmd.split('-').map(Number);
		const start = new Date(y, mo - 1, d);
		const end = addLocalDays(start, 1);
		const prevStart = addLocalDays(start, -1);
		return {
			start,
			end,
			prevStart,
			prevEnd: start,
			chartDateKeys: chartKeysBetween(start, end),
			dayCount: 1,
			displayLabel: formatReportPeriodLabel(periodValue),
			fetchStartIso: start.toISOString(),
			fetchEndIso: end.toISOString(),
			hasComparison: true,
		};
	}

	// Fallback: últimos 7 días
	return resolveReportPeriodRange('7', now);
}

/** @param {Date} d @param {{ start: Date | null, end: Date | null }} range */
export function isInReportRange(d, range) {
	if (!(d instanceof Date) || Number.isNaN(d.getTime())) return false;
	if (range.start == null && range.end == null) return true;
	if (range.start == null) return range.end ? d < range.end : true;
	if (!range.end) return d >= range.start;
	return d >= range.start && d < range.end;
}
