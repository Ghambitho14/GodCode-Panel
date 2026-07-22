import { isVenezuelaCountry } from '@/lib/geo/tenant-locale';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

/** @typedef {{ idName: string; phonePrefix: string; formatId: (value: string) => string; validateId: (value: string) => boolean; validatePhone: (value: string) => boolean }} FormStrategy */

const VE_ID_REGEX = /^[VJEG]-[0-9]{7,9}$/i;

/**
 * @param {string} value
 * @returns {string}
 */
function formatVeId(value) {
	if (!value) return '';
	let v = String(value).trim().toUpperCase();
	if (!/^[VJEG]/.test(v)) {
		const digits = v.replace(/[^0-9]/g, '');
		if (digits) v = `V-${digits}`;
	}
	v = v.replace(/^([VJEG])(\d)/, '$1-$2');
	v = v.replace(/[^VJEG0-9-]/g, '');
	return v.slice(0, 12);
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function validateVeId(value) {
	return VE_ID_REGEX.test(String(value ?? '').trim());
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function validateVePhone(value) {
	return Boolean(parsePhoneNumberFromString(String(value ?? ''), 'VE')?.isValid());
}

/**
 * @param {string} value
 * @returns {string}
 */
function formatClRut(value) {
	if (!value) return '';
	let v = value.replace(/[^0-9kK]/g, '');
	if (v.length > 1) {
		const dv = v.slice(-1);
		const cuerpo = v.slice(0, -1);
		let cuerpoFormateado = '';
		for (let i = cuerpo.length - 1, j = 1; i >= 0; i--, j++) {
			cuerpoFormateado = cuerpo.charAt(i) + cuerpoFormateado;
			if (j % 3 === 0 && i !== 0) cuerpoFormateado = `.${cuerpoFormateado}`;
		}
		return `${cuerpoFormateado}-${dv}`;
	}
	return v;
}

/**
 * @param {string} rut
 * @returns {boolean}
 */
function validateClRut(rut) {
	if (!rut || rut.trim().length < 3) return false;
	const cleanRut = rut.replace(/[^0-9kK]/g, '');
	if (cleanRut.length < 2) return false;

	const body = cleanRut.slice(0, -1);
	const dv = cleanRut.slice(-1).toUpperCase();

	let sum = 0;
	let multiplier = 2;

	for (let i = body.length - 1; i >= 0; i--) {
		sum += parseInt(body.charAt(i), 10) * multiplier;
		multiplier = multiplier === 7 ? 2 : multiplier + 1;
	}

	const expectedDv = 11 - (sum % 11);
	const calculatedDv = expectedDv === 11 ? '0' : expectedDv === 10 ? 'K' : expectedDv.toString();
	return dv === calculatedDv;
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function validateClPhone(value) {
	return Boolean(parsePhoneNumberFromString(String(value ?? ''), 'CL')?.isValid());
}

function formatGenericDocument(value) {
	return String(value ?? '').trim().slice(0, 40);
}

function validateGenericDocument(value) {
	return String(value ?? '').trim().length <= 40;
}

function validateGlobalPhone(value) {
	return Boolean(parsePhoneNumberFromString(String(value ?? ''))?.isValid());
}

/** @type {Record<string, FormStrategy>} */
const STRATEGIES = {
	VE: {
		idName: 'Cédula / RIF',
		phonePrefix: '+58 ',
		formatId: formatVeId,
		validateId: validateVeId,
		validatePhone: validateVePhone,
	},
	CL: {
		idName: 'RUT',
		phonePrefix: '+56 ',
		formatId: formatClRut,
		validateId: validateClRut,
		validatePhone: validateClPhone,
	},
};

const GLOBAL_STRATEGY = {
	idName: 'Documento',
	phonePrefix: '+',
	formatId: formatGenericDocument,
	validateId: validateGenericDocument,
	validatePhone: validateGlobalPhone,
};

/**
 * @param {unknown} country
 * @returns {FormStrategy}
 */
export function getFormStrategy(country) {
	if (isVenezuelaCountry(country)) return STRATEGIES.VE;
	const code = String(country ?? '').trim().toUpperCase();
	if (code === 'CL' || code === 'CHILE') return STRATEGIES.CL;
	return GLOBAL_STRATEGY;
}

/**
 * @param {{
 *   branchCountry?: unknown;
 *   businessCountry?: unknown;
 *   cartCountry?: unknown;
 * }} opts
 * @returns {string}
 */
export function resolveCheckoutCountryCode(opts = {}) {
	const branch = opts.branchCountry;
	if (branch != null && String(branch).trim()) return String(branch).trim();
	const business = opts.businessCountry;
	if (business != null && String(business).trim()) return String(business).trim();
	const cart = opts.cartCountry;
	if (cart != null && String(cart).trim()) return String(cart).trim();
	return '';
}

/**
 * @param {unknown} methodKey
 * @returns {boolean}
 */
export function paymentMethodRequiresReceipt(methodKey) {
	const key = String(methodKey ?? '').trim().toLowerCase();
	return key === 'pago_movil' || key === 'transferencia_bancaria' || key === 'zelle';
}

export { formatClRut as formatRut, validateClRut as validateRut };
