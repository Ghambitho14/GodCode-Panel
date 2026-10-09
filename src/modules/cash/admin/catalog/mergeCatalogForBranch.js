/**
 * Fusiona catálogo global de empresa con overrides por sucursal.
 * @param {{
 *   companyRaw: { categories?: unknown[], products?: unknown[] },
 *   branchRaw: {
 *     categoryBranchRows?: unknown[],
 *     branchPrices?: unknown[],
 *     branchStatuses?: unknown[],
 *     branchSizes?: { id: string, product_id: string, name: string, price: number, sort_order?: number }[],
 *   },
 *   isAllBranches: boolean,
 * }} args
 */
export function mergeCatalogForBranch({ companyRaw, branchRaw, isAllBranches }) {
	const categoryBranchRows = branchRaw?.categoryBranchRows || [];
	const branchPrices = branchRaw?.branchPrices || [];
	const branchStatuses = branchRaw?.branchStatuses || [];
	const branchSizes = branchRaw?.branchSizes || [];
	const priceByProductId = new Map(branchPrices.map((p) => [p.product_id, p]));
	const statusByProductId = new Map(branchStatuses.map((s) => [s.product_id, s]));
	// Tamaños de la sucursal por producto, en el orden del menú (`sort_order`, luego nombre,
	// como los devuelve `admin_set_product_sizes`).
	const sizesByProductId = new Map();
	for (const row of branchSizes) {
		if (!row?.product_id || row.id == null) continue;
		const list = sizesByProductId.get(row.product_id) || [];
		list.push({ id: row.id, name: row.name, price: row.price, sort_order: Number(row.sort_order) || 0 });
		sizesByProductId.set(row.product_id, list);
	}
	const bySizeOrder = (a, b) => (a.sort_order - b.sort_order) || String(a.name ?? '').localeCompare(String(b.name ?? ''));
	const mergedProducts = (companyRaw?.products || []).map((prod) => {
		if (isAllBranches) return prod;
		const priceData = priceByProductId.get(prod.id);
		const statusData = statusByProductId.get(prod.id);
		return {
			...prod,
			price: priceData ? priceData.price : 0,
			has_discount: priceData ? priceData.has_discount : false,
			discount_price: priceData ? priceData.discount_price : 0,
			is_active: statusData ? statusData.is_active : Boolean(prod.is_active),
			is_special: statusData ? statusData.is_special : false,
			category_id: statusData?.category_id || prod.category_id,
			price_id: priceData?.id,
			branch_relation_id: statusData?.id,
			inventory_pause_reason: statusData?.inventory_pause_reason ?? null,
			inventory_paused_at: statusData?.inventory_paused_at ?? null,
			sizes: [...(sizesByProductId.get(prod.id) || [])].sort(bySizeOrder),
		};
	});
	const branchCategoryMap = categoryBranchRows.reduce((acc, row) => {
		acc[row.category_id] = { order: row.order, is_active: row.is_active };
		return acc;
	}, {});
	const categoriesData = (companyRaw?.categories || []).map((cat) => {
		if (isAllBranches) return { ...cat, order: cat.order ?? 0, is_active: cat.is_active ?? true };
		const branchInfo = branchCategoryMap[cat.id];
		return {
			id: cat.id,
			name: cat.name,
			company_id: cat.company_id,
			order: branchInfo?.order ?? cat.order ?? 0,
			is_active: branchInfo?.is_active ?? true,
		};
	}).sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
	return { categoriesData, mergedProducts };
}
