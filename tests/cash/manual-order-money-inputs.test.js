import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseMoneyInput } from '@/lib/money/minor-units';

const flowDir = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../src/modules/cash/components/manual-order',
);

const sources = readdirSync(flowDir)
	.filter((f) => f.endsWith('.jsx'))
	.map((f) => [f, readFileSync(path.join(flowDir, f), 'utf8')]);

/**
 * `<input type="number">` descarta la coma decimal: al teclear "15,50" el valor
 * queda en cadena vacia, y con `step="1"` incluso "15.50" es stepMismatch. Los
 * handlers ya usaban parseMoneyInput, asi que el importe correcto nunca llegaba
 * a ejecutarse. Afectaba al desglose de pago mixto, al efectivo recibido y al
 * costo de envio, que en USD necesitan centimos.
 */
describe('inputs de dinero del pedido manual', () => {
	it('ningun campo del flujo usa type="number"', () => {
		const offenders = sources
			.filter(([, src]) => src.includes('type="number"'))
			.map(([file]) => file);
		expect(offenders).toEqual([]);
	});

	it('ningun campo del flujo usa inputMode="numeric"', () => {
		const offenders = sources
			.filter(([, src]) => src.includes('inputMode="numeric"'))
			.map(([file]) => file);
		expect(offenders).toEqual([]);
	});

	it('el parser acepta coma y punto con dos decimales', () => {
		const opts = { currency: 'USD', locale: 'es-VE', fractionDigits: 2 };
		expect(parseMoneyInput('15,50', opts)).toMatchObject({ valid: true, minor: 1550 });
		expect(parseMoneyInput('15.50', opts)).toMatchObject({ valid: true, minor: 1550 });
	});
});

/**
 * `updateDeliveryFee` hacia `Number(val) || 0`: "2,50" era NaN y el envio se
 * guardaba como 0 sin avisar. Ahora parsea las cadenas tecleadas y deja pasar
 * los numeros calculados tal cual.
 */
describe('costo de envio', () => {
	const hook = readFileSync(
		path.resolve(flowDir, '../../hooks/manual-order/useManualOrderForm.js'),
		'utf8',
	);

	it('no vuelve a parsear el importe tecleado con Number()', () => {
		expect(hook).not.toContain('delivery_fee: Number(val) || 0');
	});

	it('usa parseMoneyInput para las cadenas y respeta los numeros calculados', () => {
		const fn = hook.slice(hook.indexOf('const updateDeliveryFee'));
		expect(fn).toContain("typeof val === 'number'");
		expect(fn).toContain('parseMoneyInput');
	});
});
