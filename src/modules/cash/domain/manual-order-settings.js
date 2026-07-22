const REQUIREMENT_FIELDS = ['name', 'phone', 'document', 'address', 'zone', 'operatorReference'];

const DEFAULT_REQUIREMENTS = Object.freeze({
	table: Object.freeze({ name: false, phone: false, document: false, address: false, zone: false, operatorReference: true }),
	pickup: Object.freeze({ name: true, phone: false, document: false, address: false, zone: false, operatorReference: false }),
	delivery: Object.freeze({ name: true, phone: true, document: false, address: true, zone: true, operatorReference: false }),
});

function normalizeRequirements(raw, fallback) {
	return Object.fromEntries(REQUIREMENT_FIELDS.map((field) => [field, raw?.[field] == null ? fallback[field] : Boolean(raw[field])]));
}

export function normalizeManualOrderSettings(raw, fallbackFulfillments = null) {
	const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
	const fulfillments = source.enabledFulfillments ?? fallbackFulfillments ?? {};
	const fractionDigits = source.currencyFractionDigits;
	return {
		version: 1,
		enabled: source.enabled === true,
		currencyFractionDigits: Number.isInteger(Number(fractionDigits)) ? Number(fractionDigits) : undefined,
		enabledFulfillments: {
			table: fulfillments.table !== false && fulfillments.mesa !== false,
			pickup: fulfillments.pickup !== false && fulfillments.retiro !== false,
			delivery: fulfillments.delivery !== false,
		},
		customerRequirements: {
			table: normalizeRequirements(source.customerRequirements?.table, DEFAULT_REQUIREMENTS.table),
			pickup: normalizeRequirements(source.customerRequirements?.pickup, DEFAULT_REQUIREMENTS.pickup),
			delivery: normalizeRequirements(source.customerRequirements?.delivery, DEFAULT_REQUIREMENTS.delivery),
		},
		cashDenominations: source.cashDenominations && typeof source.cashDenominations === 'object'
			? source.cashDenominations
			: {},
		allowImmediateSessionPayment: {
			table: false,
			pickup: source.allowImmediateSessionPayment?.pickup !== false,
			delivery: source.allowImmediateSessionPayment?.delivery !== false,
		},
	};
}

export function requirementsFor(settings, fulfillment) {
	return normalizeManualOrderSettings(settings).customerRequirements[fulfillment] ?? DEFAULT_REQUIREMENTS.pickup;
}

export { DEFAULT_REQUIREMENTS };
