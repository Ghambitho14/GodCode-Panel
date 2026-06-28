import {
	addLocalDays,
	chartKeysBetween,
	startOfLocalMonth,
	startOfLocalWeek,
	ymdLocal,
} from './reportPeriodRange';

/** Clave YYYY-MM-DD en calendario local del navegador (alineado al gráfico de ventas). */
export function expenseDayKeyLocal(iso) {
	return ymdLocal(new Date(iso));
}

/** Lunes como inicio de semana; clave = YYYY-MM-DD del lunes (local). */
export function expenseWeekKeyLocal(iso) {
	const d = new Date(iso);
	const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
	const dow = (x.getDay() + 6) % 7;
	x.setDate(x.getDate() - dow);
	return ymdLocal(x);
}

/** Clave YYYY-MM (calendario local). */
export function expenseMonthKeyLocal(iso) {
	const d = new Date(iso);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * @param {string} iso
 * @param {'day' | 'week' | 'month'} agg
 */
export function expenseBucketKey(iso, agg) {
	if (agg === 'week') return expenseWeekKeyLocal(iso);
	if (agg === 'month') return expenseMonthKeyLocal(iso);
	return expenseDayKeyLocal(iso);
}

/**
 * Todas las claves de bucket en [rangeStart, rangeEndExclusive) para el nivel de agregación.
 * @param {Date} rangeStart
 * @param {Date} rangeEndExclusive
 * @param {'day' | 'week' | 'month'} agg
 * @returns {string[]}
 */
export function expenseBucketKeysForRange(rangeStart, rangeEndExclusive, agg) {
	if (!(rangeStart instanceof Date) || !(rangeEndExclusive instanceof Date)) {
		return [];
	}
	if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEndExclusive.getTime())) {
		return [];
	}
	if (rangeStart >= rangeEndExclusive) {
		return [];
	}

	if (agg === 'day') {
		return chartKeysBetween(rangeStart, rangeEndExclusive);
	}

	if (agg === 'week') {
		const keys = [];
		let cursor = startOfLocalWeek(rangeStart);
		while (cursor < rangeEndExclusive) {
			keys.push(ymdLocal(cursor));
			cursor = addLocalDays(cursor, 7);
		}
		return keys;
	}

	if (agg === 'month') {
		const keys = [];
		let cursor = startOfLocalMonth(rangeStart);
		while (cursor < rangeEndExclusive) {
			keys.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
			cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
		}
		return keys;
	}

	return [];
}

/**
 * @param {string} key bucket key (YYYY-MM-DD o YYYY-MM)
 * @param {'day' | 'week' | 'month'} agg
 */
export function labelForExpenseBucket(key, agg) {
	if (agg === 'month') {
		const [y, m] = key.split('-').map(Number);
		if (!Number.isFinite(y) || !Number.isFinite(m)) return key;
		return new Date(y, m - 1, 1).toLocaleDateString('es-CL', { month: 'short', year: 'numeric' });
	}
	if (agg === 'week') {
		const [y, mo, d] = key.split('-').map(Number);
		if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return key;
		const start = new Date(y, mo - 1, d);
		const end = new Date(y, mo - 1, d);
		end.setDate(end.getDate() + 6);
		return `Sem. ${start.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}`;
	}
	const [y, mo, d] = key.split('-').map(Number);
	if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return key;
	return new Date(y, mo - 1, d).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
}
