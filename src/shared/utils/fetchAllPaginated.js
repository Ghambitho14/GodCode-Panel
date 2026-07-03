/** Tamaño de página por defecto en fetchers del panel (PostgREST max = 1000). */
export const PANEL_PAGINATION_PAGE_SIZE = 1000;

/**
 * Recorre un query PostgREST en páginas con `.range(from, to)`.
 * @param {import('@supabase/supabase-js').PostgrestFilterBuilder<any, any, any>} queryBuilder
 * @param {{ pageSize?: number, maxPages?: number }} [options]
 */
export async function fetchAllPaginated(queryBuilder, { pageSize = 500, maxPages } = {}) {
	const size = Math.max(1, Math.min(pageSize, 1000));
	const all = [];
	let from = 0;
	let page = 0;

	while (true) {
		if (maxPages != null && page >= maxPages) break;
		const to = from + size - 1;
		const { data, error } = await queryBuilder.range(from, to);
		if (error) throw error;
		const rows = data ?? [];
		if (rows.length === 0) break;
		all.push(...rows);
		page += 1;
		if (rows.length < size) break;
		from += size;
	}

	return all;
}
