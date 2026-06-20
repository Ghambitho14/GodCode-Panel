import { describe, expect, it } from 'vitest';
import { expenseBucketKeysForRange } from '@/modules/cash/utils/cashExpenseBuckets';

function localDate(ymd) {
	const [y, mo, d] = ymd.split('-').map(Number);
	return new Date(y, mo - 1, d);
}

describe('expenseBucketKeysForRange', () => {
	it('genera 30 días para junio 2026', () => {
		const keys = expenseBucketKeysForRange(
			localDate('2026-06-01'),
			localDate('2026-07-01'),
			'day',
		);
		expect(keys).toHaveLength(30);
		expect(keys[0]).toBe('2026-06-01');
		expect(keys[29]).toBe('2026-06-30');
	});

	it('genera todas las semanas que tocan junio 2026', () => {
		const keys = expenseBucketKeysForRange(
			localDate('2026-06-01'),
			localDate('2026-07-01'),
			'week',
		);
		expect(keys[0]).toBe('2026-06-01');
		expect(keys[keys.length - 1]).toBe('2026-06-29');
		expect(keys).toHaveLength(5);
	});

	it('genera un bucket de mes para junio 2026', () => {
		const keys = expenseBucketKeysForRange(
			localDate('2026-06-01'),
			localDate('2026-07-01'),
			'month',
		);
		expect(keys).toEqual(['2026-06']);
	});

	it('genera 7 días para ventana rolling de 7 días', () => {
		const keys = expenseBucketKeysForRange(
			localDate('2026-06-14'),
			localDate('2026-06-21'),
			'day',
		);
		expect(keys).toHaveLength(7);
		expect(keys[0]).toBe('2026-06-14');
		expect(keys[6]).toBe('2026-06-20');
	});

	it('genera 12 meses para un año calendario completo', () => {
		const keys = expenseBucketKeysForRange(
			localDate('2026-01-01'),
			localDate('2027-01-01'),
			'month',
		);
		expect(keys).toHaveLength(12);
		expect(keys[0]).toBe('2026-01');
		expect(keys[11]).toBe('2026-12');
	});

	it('devuelve array vacío con rango inválido', () => {
		expect(expenseBucketKeysForRange(null, localDate('2026-07-01'), 'day')).toEqual([]);
		expect(expenseBucketKeysForRange(localDate('2026-07-01'), localDate('2026-06-01'), 'day')).toEqual([]);
	});
});
