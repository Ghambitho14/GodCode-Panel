/**
 * Recorre un query PostgREST en páginas con `.range(from, to)`.
 * @param {import('@supabase/supabase-js').PostgrestFilterBuilder<any, any, any>} queryBuilder
 * @param {{ pageSize?: number }} [options]
 */
export async function fetchAllPaginated(queryBuilder, { pageSize = 500 } = {}) {
	const size = Math.max(1, Math.min(pageSize, 1000));
	const all = [];
	let from = 0;

	while (true) {
		const to = from + size - 1;
		const { data, error } = await queryBuilder.range(from, to);
		if (error) throw error;
		const rows = data ?? [];
		if (rows.length === 0) break;
		all.push(...rows);
		if (rows.length < size) break;
		from += size;
	}

	return all;
}
