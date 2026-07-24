import { describe, expect, it } from 'vitest';

import {
	buildManualDeliveryPayload,
	isManualNamedDeliveryMode,
	validateManualDeliveryDetails,
} from '@/modules/cash/hooks/manual-order/manualOrderShared';

const manualNamedConfig = {
	deliveryPricingStrategy: 'named_areas',
	namedAreaResolution: 'manual_select',
	namedAreas: [{ id: 'zone-1', name: 'Los Valles', feeFlat: 2000 }],
	externalDeliveryProvider: null,
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
});
