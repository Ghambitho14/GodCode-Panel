import { describe, expect, it } from 'vitest';

import {
	buildManualDeliveryPayload,
	describeDeliveryFeeError,
	isManualNamedDeliveryMode,
	validateManualDeliveryDetails,
} from '@/modules/cash/hooks/manual-order/manualOrderShared';

const manualNamedConfig = {
	enabled: true,
	deliveryPricingStrategy: 'named_areas',
	namedAreaResolution: 'manual_select',
	namedAreas: [{ id: 'zone-1', name: 'Los Valles', feeFlat: 2000 }],
	externalDeliveryProvider: null,
};

const addressMatchedConfig = {
	enabled: true,
	deliveryPricingStrategy: 'named_areas',
	namedAreaResolution: 'address_matched',
	namedAreas: [{ id: 'zone-1', name: 'Los Valles', feeFlat: 2000 }],
	externalDeliveryProvider: null,
};

const distanceConfig = {
	enabled: true,
	deliveryPricingStrategy: 'distance',
	maxDeliveryKm: 10,
	minOrderSubtotal: 5000,
	namedAreas: [],
	externalDeliveryProvider: null,
};

const externalConfig = {
	enabled: true,
	deliveryPricingStrategy: 'external',
	externalDeliveryProvider: 'uber_direct',
	namedAreas: [],
};

describe('delivery manual por zonas', () => {
	it('reconoce que la zona se selecciona manualmente', () => {
		expect(isManualNamedDeliveryMode({
			deliveryPricingStrategy: 'named_areas',
			namedAreaResolution: 'manual_select',
			namedAreas: [{ id: 'zone-1', name: 'Zona 1', feeFlat: 2000 }],
			externalDeliveryProvider: null,
		})).toBe(true);
	});

	it('no trata como selección manual una zona detectada desde dirección', () => {
		expect(isManualNamedDeliveryMode({
			deliveryPricingStrategy: 'named_areas',
			namedAreaResolution: 'address_matched',
			namedAreas: [{ id: 'zone-1', name: 'Zona 1', feeFlat: 2000 }],
			externalDeliveryProvider: null,
		})).toBe(false);
	});

	it('construye dirección canónica desde zona y referencia sin pedir otra dirección', () => {
		expect(buildManualDeliveryPayload({
			order_type: 'delivery',
			delivery_address: '',
			delivery_reference: 'Casa 14, portón negro',
			delivery_named_area_id: 'zone-1',
			delivery_km: '',
		}, manualNamedConfig)).toEqual({
			address: 'Zona: Los Valles · Ref: Casa 14, portón negro',
			reference: 'Casa 14, portón negro',
			zoneId: 'zone-1',
			km: null,
		});
	});

	it('requiere zona y una referencia concreta, no una segunda dirección', () => {
		expect(validateManualDeliveryDetails({
			order_type: 'delivery',
			delivery_named_area_id: '',
			delivery_reference: '',
		}, manualNamedConfig)).toBe('Selecciona la zona de entrega.');

		expect(validateManualDeliveryDetails({
			order_type: 'delivery',
			delivery_named_area_id: 'zone-1',
			delivery_reference: '',
		}, manualNamedConfig)).toContain('Indica una referencia');

		expect(validateManualDeliveryDetails({
			order_type: 'delivery',
			delivery_named_area_id: 'zone-1',
			delivery_reference: 'Casa 14',
			delivery_address: '',
		}, manualNamedConfig)).toBeNull();
	});

	it('en address_matched exige dirección además de zona', () => {
		expect(validateManualDeliveryDetails({
			order_type: 'delivery',
			delivery_named_area_id: 'zone-1',
			delivery_address: 'abc',
			delivery_reference: '',
		}, addressMatchedConfig)).toBe('La dirección de delivery es obligatoria.');

		expect(validateManualDeliveryDetails({
			order_type: 'delivery',
			delivery_named_area_id: 'zone-1',
			delivery_address: 'Calle Principal 123',
			delivery_reference: '',
			total: 10000,
		}, addressMatchedConfig)).toBeNull();
	});
});

describe('delivery por distancia y externo', () => {
	it('exige dirección y bloquea km fuera de rango o pedido bajo el mínimo', () => {
		expect(validateManualDeliveryDetails({
			order_type: 'delivery',
			delivery_address: '',
			delivery_km: '3',
			total: 10000,
		}, distanceConfig)).toBe('La dirección de delivery es obligatoria.');

		expect(validateManualDeliveryDetails({
			order_type: 'delivery',
			delivery_address: 'Calle 1 #20',
			delivery_km: '15',
			total: 10000,
		}, distanceConfig)).toContain('máximo permitido');

		expect(validateManualDeliveryDetails({
			order_type: 'delivery',
			delivery_address: 'Calle 1 #20',
			delivery_km: '3',
			total: 1000,
		}, distanceConfig)).toContain('mínimo para delivery');

		expect(validateManualDeliveryDetails({
			order_type: 'delivery',
			delivery_address: 'Calle 1 #20',
			delivery_km: '3',
			total: 10000,
		}, distanceConfig)).toBeNull();
	});

	it('en pricing externo solo exige dirección y no cotiza fee local', () => {
		expect(validateManualDeliveryDetails({
			order_type: 'delivery',
			delivery_address: 'Av. Libertador 100',
			total: 100,
		}, externalConfig)).toBeNull();

		expect(validateManualDeliveryDetails({
			order_type: 'delivery',
			delivery_address: 'x',
			total: 100,
		}, externalConfig)).toBe('La dirección de delivery es obligatoria.');
	});

	it('describe códigos de error de tarifa', () => {
		expect(describeDeliveryFeeError(-1, { maxDeliveryKm: 8 })).toContain('8 km');
		expect(describeDeliveryFeeError(-2, { minOrderSubtotal: 50 })).toContain('50');
		expect(describeDeliveryFeeError(-3)).toBe('Selecciona la zona de entrega.');
		expect(describeDeliveryFeeError(-4)).toContain('ya no está disponible');
	});
});
