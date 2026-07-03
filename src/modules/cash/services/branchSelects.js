/** Listado de sucursales del panel — SIN delivery_settings (JSONB pesado). */
export const BRANCHES_LIST_SELECT =
	'id, name, company_id, is_active, currency, country, phone, address, slug, ' +
	'whatsapp_url, instagram_url, map_url, schedule, ' +
	'bank_name, account_type, account_number, account_rut, account_email, account_holder';

/** @type {readonly string[]} */
export const BRANCHES_LIST_FIELD_KEYS = BRANCHES_LIST_SELECT.split(',').map((k) => k.trim());

/**
 * Solo campos del list select (+ aliases camelCase de URLs).
 * Ignora delivery_settings y cualquier campo extra (p. ej. localStorage viejo).
 * @param {Record<string, unknown> | null | undefined} branch
 */
export function pickBranchListFields(branch) {
	if (!branch || typeof branch !== 'object') return branch ?? null;

	/** @type {Record<string, unknown>} */
	const slim = {};
	for (const key of BRANCHES_LIST_FIELD_KEYS) {
		if (key in branch) slim[key] = branch[key];
	}

	const wa = branch.whatsapp_url ?? branch.whatsappUrl;
	const ig = branch.instagram_url ?? branch.instagramUrl;
	const map = branch.map_url ?? branch.mapUrl;
	if (wa != null) slim.whatsapp_url = wa;
	if (ig != null) slim.instagram_url = ig;
	if (map != null) slim.map_url = map;

	return slim;
}
