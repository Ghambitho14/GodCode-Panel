import { normalizePhoneDigits } from '@/shared/utils/phoneWhatsApp';

/**
 * Normaliza teléfono chileno al formato canónico del panel: +56 9 XXXX XXXX
 * @param {unknown} phone
 * @returns {string}
 */
export function normalizeManualPhone(phone) {
	const raw = phone == null ? '' : String(phone).trim();
	if (!raw) return '';

	let digits = normalizePhoneDigits(raw);
	if (!digits) return raw;

	if (digits.length === 9 && digits.startsWith('9')) {
		digits = `56${digits}`;
	} else if (digits.length === 8 && digits.startsWith('9')) {
		digits = `569${digits}`;
	} else if (digits.length > 11 && digits.startsWith('56')) {
		digits = digits.slice(0, 11);
	}

	if (digits.length < 11 || !digits.startsWith('56')) {
		return raw;
	}

	const local9 = digits.slice(2, 11);
	if (local9.length < 9) return raw;

	return `+56 ${local9.slice(0, 1)} ${local9.slice(1, 5)} ${local9.slice(5, 9)}`;
}

/**
 * @param {unknown} phone
 * @returns {string}
 */
export function normalizePhoneForSearch(phone) {
	return normalizePhoneDigits(phone);
}
