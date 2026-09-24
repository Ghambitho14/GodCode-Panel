import { describe, expect, it } from 'vitest';
import { buildGoogleMapsPointUrl, isExampleOrigin, parseLatLngPair } from '@/lib/geo';
import { deliveryLocationNote } from '@/shared/utils/orderUtils';

describe('origen del local', () => {
	it('detecta las coordenadas de ejemplo que se quedaron guardadas', () => {
		expect(isExampleOrigin(-33.4489, -70.6693)).toBe(true);
		expect(isExampleOrigin('11.0208', '-63.8937')).toBe(true);
		expect(isExampleOrigin(-33.4251, -70.7902)).toBe(false);
		expect(isExampleOrigin('', '')).toBe(false);
	});

	it('lee «lat, lng» tal como lo copia Google Maps', () => {
		expect(parseLatLngPair('-33.4251, -70.7902')).toEqual({ lat: -33.4251, lng: -70.7902 });
		expect(parseLatLngPair('(11.0012,-63.8561)')).toEqual({ lat: 11.0012, lng: -63.8561 });
		expect(parseLatLngPair('https://www.google.com/maps/@-33.4251,-70.7902,17z')).toEqual({ lat: -33.4251, lng: -70.7902 });
		expect(parseLatLngPair('-33.4251')).toBeNull();
		expect(parseLatLngPair('hola, mundo')).toBeNull();
		expect(parseLatLngPair('200, 10')).toBeNull();
	});

	it('arma el enlace para ver el punto', () => {
		expect(buildGoogleMapsPointUrl(-33.4, -70.7)).toBe('https://www.google.com/maps/search/?api=1&query=-33.4%2C-70.7');
	});
});

describe('deliveryLocationNote', () => {
	it('avisa solo lo que el cajero necesita saber', () => {
		expect(deliveryLocationNote({ location_source: 'pin' })?.tone).toBe('ok');
		expect(deliveryLocationNote({ location_source: 'gps_approx' })?.tone).toBe('warn');
		expect(deliveryLocationNote({ location_source: 'address_approx' })?.tone).toBe('warn');
		expect(deliveryLocationNote({ line1: 'Calle 1' })).toBeNull();
		expect(deliveryLocationNote(null)).toBeNull();
	});
});
