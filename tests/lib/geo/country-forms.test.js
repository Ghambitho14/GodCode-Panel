import { describe, expect, it } from 'vitest';
import { getFormStrategy } from '@/lib/geo/country-forms';

describe('country-forms VE', () => {
	it('usa etiqueta Cédula / RIF', () => {
		const strategy = getFormStrategy('VE');
		expect(strategy.idName).toBe('Cédula / RIF');
		expect(strategy.phonePrefix).toBe('+58 ');
	});

	it('valida cédula venezolana', () => {
		const strategy = getFormStrategy('VE');
		expect(strategy.validateId('V-12345678')).toBe(true);
		expect(strategy.validateId('1-9')).toBe(false);
	});
});
