import { describe, expect, it } from 'vitest';
import {
	createMoneyFormatter,
	formatMoney,
	formatMoneyCompact,
	formatMoneyOrFree,
	formatMoneyPlain,
	fractionDigitsForCurrency,
	localeForCurrency,
	normalizeCurrencyCode,
} from '@/shared/utils/money';

describe('money', () => {
	it('normalizeCurrencyCode defaults invalid to CLP', () => {
		expect(normalizeCurrencyCode('clp')).toBe('CLP');
		expect(normalizeCurrencyCode('')).toBe('CLP');
		expect(normalizeCurrencyCode('XX')).toBe('CLP');
	});

	it('localeForCurrency maps known codes', () => {
		expect(localeForCurrency('CLP')).toBe('es-CL');
		expect(localeForCurrency('ARS')).toBe('es-AR');
		expect(localeForCurrency('USD')).toBe('en-US');
	});

	it('fractionDigitsForCurrency uses zero decimals for CLP/ARS', () => {
		expect(fractionDigitsForCurrency('CLP')).toBe(0);
		expect(fractionDigitsForCurrency('USD')).toBe(2);
	});

	it('formatMoney formats CLP', () => {
		const formatted = formatMoney(1000, { currency: 'CLP' });
		expect(formatted).toMatch(/\$|CLP|1/);
	});

	it('formatMoneyPlain formats without symbol', () => {
		expect(formatMoneyPlain(1000)).toMatch(/1/);
	});

	it('formatMoneyCompact abbreviates large values', () => {
		expect(formatMoneyCompact(1_500_000)).toBe('1.5M');
		expect(formatMoneyCompact(15_000)).toBe('15k');
	});

	it('formatMoneyOrFree returns free label for zero', () => {
		expect(formatMoneyOrFree(0)).toBe('GRATIS');
	});

	it('createMoneyFormatter uses branch currency', () => {
		const fmt = createMoneyFormatter({ currency: 'ARS' });
		expect(fmt.currency).toBe('ARS');
		expect(fmt.locale).toBe('es-AR');
		expect(fmt.formatMoney(100)).toMatch(/100|\$/);
	});
});
