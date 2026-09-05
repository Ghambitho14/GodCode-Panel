import { describe, expect, it } from 'vitest';
import { parseMoneyInput, minorToMajor, toAmountInputValue } from '@/shared/utils/money';

/**
 * Los campos de cierre de caja los teclea una persona, que escribe el importe
 * como se escribe en su país: "15,20" en es-VE, "15.20" en en-US. El riesgo no
 * es que la coma llegue a la base (nunca llega: se parsea a número antes de
 * enviar), sino parsearla con parseFloat, que se come los centavos en silencio.
 */
const parseAmount = (raw, { currency = 'USD', locale = 'es-VE' } = {}) => {
	if (raw === '' || raw == null) return null;
	const parsed = parseMoneyInput(raw, { currency, locale });
	if (!parsed.valid) return null;
	return minorToMajor(parsed.minor, currency);
};

describe('importes tecleados en el cierre de caja', () => {
	it('lee la coma como separador decimal', () => {
		expect(parseAmount('15,20')).toBe(15.2);
		expect(parseAmount('15,2')).toBe(15.2);
		expect(parseAmount('0,05')).toBe(0.05);
	});

	it('sigue leyendo el punto igual que antes', () => {
		expect(parseAmount('15.20')).toBe(15.2);
		expect(parseAmount('74.6')).toBe(74.6);
	});

	it('coma y punto dan el mismo importe', () => {
		expect(parseAmount('15,20')).toBe(parseAmount('15.20'));
	});

	it('parseFloat se comía los centavos: por eso no se usa', () => {
		expect(parseFloat('15,20')).toBe(15);
		expect(parseAmount('15,20')).not.toBe(parseFloat('15,20'));
	});

	it('entiende el separador de miles', () => {
		expect(parseAmount('1.234,56')).toBe(1234.56);
		expect(parseAmount('1234,56')).toBe(1234.56);
	});

	it('rechaza texto no numérico, negativos y vacío', () => {
		expect(parseAmount('')).toBeNull();
		expect(parseAmount('abc')).toBeNull();
		expect(parseAmount('-5')).toBeNull();
	});

	it('rechaza más decimales de los que admite la moneda', () => {
		expect(parseAmount('15,205')).toBeNull();
	});

	it('acepta enteros en monedas sin decimales', () => {
		expect(parseAmount('1500', { currency: 'CLP', locale: 'es-CL' })).toBe(1500);
	});
});

describe('toAmountInputValue (botón "Usar esperado")', () => {
	it('usa el separador decimal del país', () => {
		expect(toAmountInputValue(74.6, { locale: 'es-VE', fractionDigits: 2 })).toBe('74,60');
		expect(toAmountInputValue(74.6, { locale: 'en-US', fractionDigits: 2 })).toBe('74.60');
	});

	it('no mete separador de miles, que sería ambiguo al releer', () => {
		const value = toAmountInputValue(1234.5, { locale: 'es-VE', fractionDigits: 2 });
		expect(value).toBe('1234,50');
		expect(parseAmount(value)).toBe(1234.5);
	});

	it('recorta la basura de coma flotante', () => {
		expect(toAmountInputValue(74.60000000000001, { locale: 'es-VE', fractionDigits: 2 })).toBe('74,60');
		expect(toAmountInputValue(0.1 + 0.2, { locale: 'en-US', fractionDigits: 2 })).toBe('0.30');
	});

	it('respeta monedas sin decimales', () => {
		expect(toAmountInputValue(1500, { locale: 'es-CL', fractionDigits: 0 })).toBe('1500');
	});

	it('devuelve 0 ante valores no numéricos', () => {
		expect(toAmountInputValue(null, { locale: 'en-US', fractionDigits: 2 })).toBe('0.00');
		expect(toAmountInputValue('x', { locale: 'en-US', fractionDigits: 2 })).toBe('0.00');
	});

	it('lo que escribe el botón lo relee el parser sin perder céntimos', () => {
		for (const amount of [15.2, 74.6, 0.05, 1234.56, 0.1 + 0.2]) {
			const written = toAmountInputValue(amount, { locale: 'es-VE', fractionDigits: 2 });
			expect(parseAmount(written), `monto ${amount}`).toBe(Number(amount.toFixed(2)));
		}
	});
});
