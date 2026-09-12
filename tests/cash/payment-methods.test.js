import { describe, expect, it } from 'vitest';
import {
	normalizePaymentMethods,
	normalizeConfiguredPaymentMethods,
	settlementToAccountingMinor,
	validatePaymentLines,
	deriveLegacyPaymentFields,
} from '../../src/modules/cash/domain/payment-methods';

describe('manual order payment lines', () => {
	it('normalizes branch methods and combines arbitrary rails', () => {
		const methods = normalizePaymentMethods(['efectivo', 'card', 'zelle'], { accountingCurrency: 'USD' });
		const lines = [
			{ id: 'a', methodId: 'efectivo', amountMinor: 400, currency: 'USD' },
			{ id: 'b', methodId: 'card', amountMinor: 600, currency: 'USD' },
		];
		const result = validatePaymentLines(lines, { totalMinor: 1000, currency: 'USD' }, methods);
		expect(result.valid).toBe(true);
		expect(deriveLegacyPaymentFields(result.lines, 'USD')).toMatchObject({ payment_type: 'mixto', payment_method_specific: 'mixed' });
	});

	it('canonicalizes legacy aliases without duplicating a configured method', () => {
		const methods = normalizePaymentMethods(['tienda', 'cash', 'tarjeta'], { accountingCurrency: 'CLP' });
		expect(methods.map((method) => method.id)).toEqual(['efectivo', 'card']);
	});

	it('does not invent defaults when the authoritative branch configuration is empty', () => {
		expect(normalizeConfiguredPaymentMethods([], { accountingCurrency: 'CLP' })).toEqual([]);
		expect(normalizeConfiguredPaymentMethods(null, { accountingCurrency: 'CLP' })).toEqual([]);
	});

	it('normalizes only methods persisted for the branch', () => {
		const methods = normalizeConfiguredPaymentMethods(['efectivo', 'zelle'], { accountingCurrency: 'CLP' });
		expect(methods.map((method) => method.id)).toEqual(['efectivo', 'zelle']);
	});

	it('canonicalizes legacy cash identifiers to efectivo while preserving the cash rail', () => {
		const methods = normalizePaymentMethods(['cash', 'tienda', 'efectivo'], { accountingCurrency: 'CLP' });
		expect(methods).toHaveLength(1);
		expect(methods[0]).toMatchObject({ id: 'efectivo', rail: 'cash' });
	});

	it('converts VES settlement using persisted decimal rate', () => {
		expect(settlementToAccountingMinor(36500, 'VES', 'USD', '36.5')).toBe(1000);
	});

	it('rejects a mismatch of one minor unit', () => {
		const methods = normalizePaymentMethods(['cash'], { accountingCurrency: 'USD' });
		const result = validatePaymentLines([{ id: 'a', methodId: 'efectivo', amountMinor: 999, currency: 'USD' }], { totalMinor: 1000, currency: 'USD' }, methods);
		expect(result.valid).toBe(false);
		expect(result.errors.at(-1)).toMatchObject({ code: 'total_mismatch', paidMinor: 999 });
	});

	it('computes cash change in the tender currency', () => {
		const methods = normalizePaymentMethods(['cash'], { accountingCurrency: 'USD' });
		const result = validatePaymentLines([
			{ id: 'efectivo', methodId: 'efectivo', amountMinor: 1050, currency: 'USD', tenderedAmountMinor: 2000 },
		], { totalMinor: 1050, currency: 'USD' }, methods);
		expect(result.valid).toBe(true);
		expect(result.lines[0]).toMatchObject({ tenderedAmountMinor: 2000, changeAmountMinor: 950, tenderedCurrency: 'USD' });
	});

	it('preserves settlement policy and rejects a method excluded from mixed payments', () => {
		const methods = normalizePaymentMethods([
			{ id: 'efectivo', allowMixedPayment: true },
			{ id: 'zelle', allowMixedPayment: false },
		], { accountingCurrency: 'USD' });
		expect(methods[1]).toMatchObject({
			id: 'zelle',
			evidencePolicy: 'required',
			settlementTrigger: 'evidence_uploaded',
			allowMixedPayment: false,
		});
		const result = validatePaymentLines([
			{ id: 'efectivo', methodId: 'efectivo', amountMinor: 500, currency: 'USD' },
			{ id: 'zelle', methodId: 'zelle', amountMinor: 500, currency: 'USD' },
		], { totalMinor: 1000, currency: 'USD' }, methods);
		expect(result.valid).toBe(false);
		expect(result.errors).toContainEqual({
			methodId: 'zelle',
			code: 'mixed_payment_not_allowed',
		});
	});
});

describe('metodos configurados que el registro no traia', () => {
	// Una sucursal con MercadoPago activo no veia el metodo en el selector de
	// cobro: `normalizeRawDefinition` devolvia null y se filtraba sin avisar.
	// Si era el unico metodo de la sucursal, el panel se quedaba sin ninguno.
	it('MercadoPago sobrevive junto a otros metodos', () => {
		const methods = normalizePaymentMethods(['efectivo', 'mercadopago'], { accountingCurrency: 'CLP' });
		expect(methods.map((method) => method.id)).toEqual(['efectivo', 'mercadopago']);
	});

	it('MercadoPago se clasifica igual que Stripe: tarjeta liquidada por webhook', () => {
		const [method] = normalizePaymentMethods(['mercadopago'], { accountingCurrency: 'CLP' });
		expect(method).toMatchObject({
			id: 'mercadopago',
			rail: 'card',
			evidencePolicy: 'optional',
			settlementTrigger: 'gateway_webhook',
		});
	});

	it('una sucursal con un solo metodo no reconocido ya no se queda sin ninguno', () => {
		// El caso grave: sin metodos, el panel no puede cobrar nada.
		expect(normalizePaymentMethods(['mercadopago'], { accountingCurrency: 'CLP' })).toHaveLength(1);
		expect(normalizeConfiguredPaymentMethods(['yape'], { accountingCurrency: 'PEN' })).toHaveLength(1);
	});

	it('se puede cobrar un pedido con un metodo no reconocido', () => {
		const methods = normalizeConfiguredPaymentMethods(['efectivo', 'mercadopago'], { accountingCurrency: 'CLP' });
		const result = validatePaymentLines(
			[{ id: 'l1', methodId: 'mercadopago', amountMinor: 1000, currency: 'CLP' }],
			{ totalMinor: 1000, currency: 'CLP' },
			methods,
		);
		expect(result.valid).toBe(true);
		expect(deriveLegacyPaymentFields(result.lines, 'CLP')).toMatchObject({
			payment_type: 'tarjeta',
			payment_method_specific: 'mercadopago',
		});
	});

	// El defecto calca la rama `else` de payment_method_policy_v3, que es quien
	// decide al liquidar. Los metodos del registro siguen por su propia rama.
	it.each([
		['yape', 'online', 'manual_verification', 'none'],
		['transferencia_bancaria', 'online', 'evidence_uploaded', 'required'],
		['cash_usd', 'cash', 'cash_confirmation', 'none'],
		['mercadopago', 'card', 'gateway_webhook', 'optional'],
	])('clasifica %s como %s', (key, rail, settlementTrigger, evidencePolicy) => {
		const [method] = normalizePaymentMethods([key], { accountingCurrency: 'USD' });
		expect(method).toMatchObject({ rail, settlementTrigger, evidencePolicy });
	});

	it('un metodo desconocido no se da por cobrado solo: exige verificacion manual', () => {
		const [method] = normalizePaymentMethods(['metodo_raro_del_local'], { accountingCurrency: 'CLP' });
		expect(method.settlementTrigger).toBe('manual_verification');
	});

	it('una clave heredada de Object.prototype no cuenta como metodo conocido', () => {
		// `PAYMENT_METHOD_REGISTRY['constructor']` devuelve el constructor de Object,
		// que es truthy: sin la guarda de hasOwnProperty se colaba como definicion.
		const [method] = normalizePaymentMethods(['constructor'], { accountingCurrency: 'CLP' });
		expect(method).toMatchObject({ id: 'constructor', rail: 'online' });
	});

	it('sigue descartando entradas sin nombre', () => {
		expect(normalizePaymentMethods(['', '   ', null], { accountingCurrency: 'CLP' })).toEqual([]);
	});
});
