const MAX_FRACTION_DIGITS = 6;

/** @typedef {number} MinorAmount */

function assertSafeMinor(value) {
	if (!Number.isSafeInteger(value)) {
		throw new RangeError('El monto excede el rango contable admitido.');
	}
	return value;
}

function pow10(digits) {
	return 10 ** Math.max(0, Math.min(MAX_FRACTION_DIGITS, Number(digits) || 0));
}

function canonicalDecimalToMinor(value, fractionDigits) {
	const match = String(value).trim().match(/^([+-])?(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
	if (!match) throw new TypeError('Monto inválido.');
	const [, sign = '', whole, fraction = '', exponentRaw = '0'] = match;
	const coefficient = BigInt(`${whole}${fraction}` || '0');
	const exponent = Number(exponentRaw) - fraction.length + fractionDigits;
	let absoluteMinor;
	if (exponent >= 0) {
		absoluteMinor = coefficient * (10n ** BigInt(exponent));
	} else {
		const divisor = 10n ** BigInt(-exponent);
		absoluteMinor = (coefficient + divisor / 2n) / divisor;
	}
	const signed = sign === '-' ? -absoluteMinor : absoluteMinor;
	return assertSafeMinor(Number(signed));
}

/** Obtiene la escala oficial ISO-4217 que conoce el runtime. */
export function isoFractionDigits(currency, override) {
	if (override != null && Number.isInteger(Number(override))) {
		const digits = Number(override);
		if (digits < 0 || digits > MAX_FRACTION_DIGITS) {
			throw new RangeError('currencyFractionDigits debe estar entre 0 y 6.');
		}
		return digits;
	}
	const code = String(currency ?? '').trim().toUpperCase();
	if (!/^[A-Z]{3}$/.test(code)) throw new Error('Código de moneda ISO inválido.');
	try {
		return new Intl.NumberFormat('en', { style: 'currency', currency: code })
			.resolvedOptions().maximumFractionDigits;
	} catch {
		throw new Error(`Moneda ISO no soportada: ${code}`);
	}
}

function localeSeparators(locale) {
	const parts = new Intl.NumberFormat(locale || 'en-US').formatToParts(12345.6);
	return {
		group: parts.find((part) => part.type === 'group')?.value ?? ',',
		decimal: parts.find((part) => part.type === 'decimal')?.value ?? '.',
	};
}

function normalizeNumericText(input, locale, fractionDigits) {
	let text = String(input ?? '').trim().replace(/\u00a0|\u202f/g, ' ');
	if (!text) return { valid: false, reason: 'empty', normalized: '' };
	const negative = /^\s*-/.test(text) || /^\s*\(.+\)\s*$/.test(text);
	text = text.replace(/[^0-9.,'’\s]/g, '').replace(/['’\s]/g, '');
	if (!text || !/\d/.test(text)) return { valid: false, reason: 'invalid', normalized: '' };

	const { decimal: localeDecimal } = localeSeparators(locale);
	const dot = text.lastIndexOf('.');
	const comma = text.lastIndexOf(',');
	let decimalSeparator = null;
	if (dot >= 0 && comma >= 0) {
		decimalSeparator = dot > comma ? '.' : ',';
	} else {
		const candidate = dot >= 0 ? '.' : comma >= 0 ? ',' : null;
		if (candidate) {
			const occurrences = text.split(candidate).length - 1;
			const trailing = text.length - text.lastIndexOf(candidate) - 1;
			if (occurrences === 1 && fractionDigits > 0 && trailing > 0 && trailing <= fractionDigits) {
				decimalSeparator = candidate;
			} else if (candidate === localeDecimal && occurrences === 1 && trailing > 0) {
				decimalSeparator = candidate;
			}
		}
	}

	let integerPart = text;
	let fractionPart = '';
	if (decimalSeparator) {
		const index = text.lastIndexOf(decimalSeparator);
		integerPart = text.slice(0, index);
		fractionPart = text.slice(index + 1).replace(/\D/g, '');
	}
	integerPart = integerPart.replace(/\D/g, '') || '0';
	if (fractionPart.length > fractionDigits) {
		return { valid: false, reason: 'too_many_decimals', normalized: '' };
	}
	const normalized = `${negative ? '-' : ''}${integerPart}${fractionDigits > 0 && fractionPart ? `.${fractionPart}` : ''}`;
	return { valid: true, reason: null, normalized, integerPart, fractionPart, negative };
}

/**
 * Convierte texto localizado a unidades mínimas sin pasar por coma flotante.
 * @returns {{ valid: boolean; minor: MinorAmount|null; normalized: string; reason: string|null }}
 */
export function parseMoneyInput(input, options = {}) {
	const currency = String(options.currency ?? '').trim().toUpperCase();
	const fractionDigits = isoFractionDigits(currency, options.fractionDigits);
	const parsed = normalizeNumericText(input, options.locale, fractionDigits);
	if (!parsed.valid) return { ...parsed, minor: null };
	if (parsed.negative && options.allowNegative !== true) {
		return { valid: false, minor: null, normalized: parsed.normalized, reason: 'negative_not_allowed' };
	}
	const paddedFraction = String(parsed.fractionPart ?? '').padEnd(fractionDigits, '0');
	const absolute = BigInt(parsed.integerPart || '0') * BigInt(pow10(fractionDigits))
		+ BigInt(paddedFraction || '0');
	const signed = parsed.negative ? -absolute : absolute;
	const asNumber = Number(signed);
	if (!Number.isSafeInteger(asNumber)) {
		return { valid: false, minor: null, normalized: parsed.normalized, reason: 'out_of_range' };
	}
	return { valid: true, minor: asNumber, normalized: parsed.normalized, reason: null };
}

/** Convierte unidades mayores a minor units aplicando redondeo decimal half-away-from-zero. */
export function majorToMinor(value, currency, fractionDigits) {
	if (typeof value === 'string') {
		const result = parseMoneyInput(value, { currency, fractionDigits, locale: 'en-US', allowNegative: true });
		if (!result.valid) {
			if (result.reason === 'too_many_decimals') {
				return canonicalDecimalToMinor(value, isoFractionDigits(currency, fractionDigits));
			}
			throw new Error(`Monto inválido: ${result.reason}`);
		}
		return result.minor;
	}
	const number = Number(value);
	if (!Number.isFinite(number)) throw new TypeError('Monto inválido.');
	const digits = isoFractionDigits(currency, fractionDigits);
	return canonicalDecimalToMinor(number.toString(), digits);
}

export function minorToMajor(minor, currency, fractionDigits) {
	return assertSafeMinor(Number(minor)) / pow10(isoFractionDigits(currency, fractionDigits));
}

export function sumMinor(values) {
	return assertSafeMinor((values || []).reduce((sum, value) => sum + assertSafeMinor(Number(value)), 0));
}

export function formatMinor(minor, options = {}) {
	const currency = String(options.currency ?? '').trim().toUpperCase();
	const digits = isoFractionDigits(currency, options.fractionDigits);
	const checked = assertSafeMinor(Number(minor));
	const negative = checked < 0;
	const absolute = BigInt(Math.abs(checked));
	const scale = 10n ** BigInt(digits);
	const whole = absolute / scale;
	const fraction = (absolute % scale).toString().padStart(digits, '0');
	const formatter = new Intl.NumberFormat(options.locale, {
		style: 'currency',
		currency,
		minimumFractionDigits: digits,
		maximumFractionDigits: digits,
	});
	const formattedWhole = negative ? (whole === 0n ? -0 : -whole) : whole;
	return formatter.formatToParts(formattedWhole)
		.map((part) => part.type === 'fraction' ? fraction : part.value)
		.join('');
}

export function minorAmountsEqual(left, right, toleranceMinor = 0) {
	const tolerance = Math.max(0, Number(toleranceMinor) || 0);
	return Math.abs(assertSafeMinor(Number(left)) - assertSafeMinor(Number(right))) <= tolerance;
}
