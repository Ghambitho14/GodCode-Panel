import { describe, expect, it } from 'vitest';
import { getCountryProfile, normalizeInternationalPhone, validateProfileDocument } from '../../../src/lib/geo/country-profiles';

describe('country profiles', () => {
	it('provides complete Chile and Venezuela profiles', () => {
		expect(getCountryProfile('Chile', { currency: 'CLP' })).toMatchObject({ countryCode: 'CL', locale: 'es-CL', currency: 'CLP' });
		expect(getCountryProfile('VE', { currency: 'USD' })).toMatchObject({ countryCode: 'VE', locale: 'es-VE', currency: 'USD' });
	});

	it('validates E.164 phones using country metadata', () => {
		expect(normalizeInternationalPhone('0412-1234567', 'VE')).toEqual({ valid: true, e164: '+584121234567', reason: null });
		expect(normalizeInternationalPhone('+56 9 1234 5678', 'CL').valid).toBe(true);
		expect(normalizeInternationalPhone('123', 'CL').valid).toBe(false);
	});

	it('uses safe global fallback and requires configured currency', () => {
		const fallback = getCountryProfile('ZZ', { currency: 'EUR' });
		expect(fallback.countryCode).toBeNull();
		expect(validateProfileDocument('', fallback, false)).toBe(true);
		expect(() => getCountryProfile('ZZ')).toThrow(/moneda ISO/i);
	});
});
