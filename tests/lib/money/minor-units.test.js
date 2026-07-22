import { describe, expect, it } from 'vitest';
import {
	isoFractionDigits,
	parseMoneyInput,
	majorToMinor,
	minorToMajor,
	sumMinor,
	formatMinor,
} from '../../../src/lib/money/minor-units';

describe('minor units money domain', () => {
	it.each([
		['CLP', 0], ['USD', 2], ['VES', 2], ['JPY', 0], ['KWD', 3],
	])('uses ISO fraction digits for %s', (currency, digits) => {
		expect(isoFractionDigits(currency)).toBe(digits);
	});

	it.each([
		['10.50', { currency: 'USD', locale: 'en-US' }, 1050],
		['10,50', { currency: 'USD', locale: 'es-VE' }, 1050],
		['1.234,56', { currency: 'USD', locale: 'es-VE' }, 123456],
		['1,234.56', { currency: 'USD', locale: 'en-US' }, 123456],
		['12.345', { currency: 'CLP', locale: 'es-CL' }, 12345],
		['1.234', { currency: 'KWD', locale: 'en-US' }, 1234],
	])('parses localized %s exactly', (input, options, expected) => {
		expect(parseMoneyInput(input, options)).toMatchObject({ valid: true, minor: expected });
	});

	it('rejects accidental precision and negatives by default', () => {
		expect(parseMoneyInput('10.505', { currency: 'USD' }).reason).toBe('too_many_decimals');
		expect(parseMoneyInput('-1.00', { currency: 'USD' }).reason).toBe('negative_not_allowed');
	});

	it('converts, sums and formats without losing the minor unit', () => {
		expect(majorToMinor(10.505, 'USD')).toBe(1051);
		expect(majorToMinor(1.005, 'USD')).toBe(101);
		expect(majorToMinor(-1.005, 'USD')).toBe(-101);
		expect(minorToMajor(1051, 'USD')).toBe(10.51);
		expect(sumMinor([1000, 50, 1])).toBe(1051);
		expect(formatMinor(1051, { currency: 'USD', locale: 'en-US' })).toBe('$10.51');
		expect(formatMinor(Number.MAX_SAFE_INTEGER, { currency: 'USD', locale: 'en-US' }))
			.toBe('$90,071,992,547,409.91');
	});
});
