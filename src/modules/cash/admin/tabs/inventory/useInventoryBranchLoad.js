import { useCallback, useMemo, useState } from "react";
import { supabase, TABLES } from "@/integrations/supabase";
import { fetchAllPaginated, PANEL_PAGINATION_PAGE_SIZE } from "@/shared/utils/fetchAllPaginated";
import { branchSettingsService } from "@/modules/cash/services/branchSettingsService";
import {
	INVENTORY_BRANCH_PANEL_SELECT,
	INVENTORY_ITEMS_PANEL_SELECT,
} from "@/modules/cash/services/inventorySelects";

const INV_ITEM_UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Etiquetas sugeridas desde catálogo carrito (bebidas / extras) de la sucursal. */
function categoryHintsFromCartCatalogs(cartBeveragesCatalog, cartGlobalExtrasCatalog) {
	const bev = Array.isArray(cartBeveragesCatalog) ? cartBeveragesCatalog : [];
	const ext = Array.isArray(cartGlobalExtrasCatalog) ? cartGlobalExtrasCatalog : [];
	const seen = new Set();
	const out = [];
	const add = (raw) => {
		const t = String(raw ?? "").trim();
		if (!t) return;
		const k = t.toLowerCase();
		if (seen.has(k)) return;
		seen.add(k);
		out.push(t);
	};
	if (bev.length) add("Bebidas");
	if (ext.length) add("Extras");
	for (const x of bev) add(x?.category);
	for (const x of ext) add(x?.category);
	return out;
}

/**
 * IDs de insumos referenciados por el carrito (bebidas/extras) e ítems del menú aún sin vínculo.
 */
function extractCartInventoryLinkInfo(cartBeveragesCatalog, cartGlobalExtrasCatalog) {
	const linkedIds = new Set();
	const unlinked = [];
	const ingest = (arr, variant) => {
		for (const x of Array.isArray(arr) ? arr : []) {
			if (!x || typeof x !== "object") continue;
			const raw = x.inventoryItemId ?? x.inventory_item_id;
			const sid = typeof raw === "string" ? raw.trim() : "";
			if (sid && INV_ITEM_UUID.test(sid)) {
				linkedIds.add(sid);
			} else if (variant === "extras" && String(x.name ?? "").trim()) {
				unlinked.push({ variant, item: x });
			}
		}
	};
	ingest(cartBeveragesCatalog, "beverages");
	ingest(cartGlobalExtrasCatalog, "extras");
	return { linkedIds, unlinked };
}

export default function useInventoryBranchLoad({
	showNotify,
	branchId,
	companyId,
	branches,
	prefetchedBranchStock = null,
}) {
	const [items, setItems] = useState([]);
	const [companyInventoryItems, setCompanyInventoryItems] = useState([]);
	const [loading, setLoading] = useState(true);
	const [cartCatalogCategoryHints, setCartCatalogCategoryHints] = useState([]);
	const [unlinkedCartItems, setUnlinkedCartItems] = useState([]);

	const allViewBranchIdsKey = useMemo(
		() => branches.filter((b) => b.id !== "all").map((b) => String(b.id)).sort().join(","),
		[branches],
	);

	const loadCompanyInventoryItems = useCallback(async () => {
		if (!companyId) {
			setCompanyInventoryItems([]);
			return;
		}
		const data = await fetchAllPaginated(
			supabase
				.from(TABLES.inventory_items)
				.select(INVENTORY_ITEMS_PANEL_SELECT)
				.eq("company_id", companyId)
				.order("name"),
			{ pageSize: PANEL_PAGINATION_PAGE_SIZE },
		);
		setCompanyInventoryItems(data);
	}, [companyId]);

	const loadItems = useCallback(async () => {
		if (!branchId) return;
		if (!companyId) {
			setItems([]);
			setLoading(false);
			setCartCatalogCategoryHints([]);
			setUnlinkedCartItems([]);
			return;
		}
		setLoading(true);
		let linkedInventoryIds = new Set();
		try {
			const allItems = await fetchAllPaginated(
				supabase
					.from(TABLES.inventory_items)
					.select(INVENTORY_ITEMS_PANEL_SELECT)
					.eq("company_id", companyId)
					.order("name"),
				{ pageSize: PANEL_PAGINATION_PAGE_SIZE },
			);
			setCompanyInventoryItems(allItems);

			let branchStock;
			if (
				branchId !== "all" &&
				Array.isArray(prefetchedBranchStock) &&
				prefetchedBranchStock.length > 0
			) {
				branchStock = prefetchedBranchStock.map((row) => ({
					id: row.id,
					branch_id: row.branch_id,
					inventory_item_id: row.inventory_item_id,
					current_stock: row.current_stock,
					min_stock: row.min_stock,
					updated_at: row.updated_at,
				}));
			} else {
				let query = supabase.from(TABLES.inventory_branch).select(INVENTORY_BRANCH_PANEL_SELECT);
				if (branchId !== "all") {
					query = query.eq("branch_id", branchId);
				} else {
					const validBranchIds = allViewBranchIdsKey ? allViewBranchIdsKey.split(",") : [];
					if (validBranchIds.length > 0) query = query.in("branch_id", validBranchIds);
				}
				branchStock = await fetchAllPaginated(query, { pageSize: PANEL_PAGINATION_PAGE_SIZE });
			}

			if (branchId !== "all") {
				try {
					const deliveryData = await branchSettingsService.getCartUpsellSettings(branchId);
					if (deliveryData) {
						const { linkedIds, unlinked } = extractCartInventoryLinkInfo(
							deliveryData.cartBeveragesCatalog,
							deliveryData.cartGlobalExtrasCatalog,
						);
						linkedInventoryIds = linkedIds;
						setUnlinkedCartItems(unlinked);
						setCartCatalogCategoryHints(
							categoryHintsFromCartCatalogs(
								deliveryData.cartBeveragesCatalog,
								deliveryData.cartGlobalExtrasCatalog,
							),
						);
					} else {
						setUnlinkedCartItems([]);
						setCartCatalogCategoryHints([]);
					}
				} catch {
					setUnlinkedCartItems([]);
					setCartCatalogCategoryHints([]);
				}
			} else {
				setUnlinkedCartItems([]);
				setCartCatalogCategoryHints([]);
			}

			const stocksByItemId = new Map();
			for (const s of branchStock || []) {
				const list = stocksByItemId.get(s.inventory_item_id);
				if (list) list.push(s);
				else stocksByItemId.set(s.inventory_item_id, [s]);
			}

			let mergedItems = (allItems || []).map((item) => {
				const itemStocks = stocksByItemId.get(item.id) || [];
				const stockEntry = branchId !== "all" ? itemStocks.find((s) => s.branch_id === branchId) : null;
				const totalStock =
					branchId === "all"
						? itemStocks.reduce((sum, s) => sum + (parseFloat(s.current_stock) || 0), 0)
						: parseFloat(stockEntry?.current_stock) || 0;
				const totalMinStock =
					branchId === "all"
						? itemStocks.reduce((sum, s) => sum + (parseFloat(s.min_stock) || 0), 0)
						: parseFloat(stockEntry?.min_stock) || parseFloat(item.min_stock) || 0;

				const linkedFromCart = branchId !== "all" && linkedInventoryIds.has(item.id);

				const itemType =
					typeof item.item_type === "string" && item.item_type.trim()
						? item.item_type.trim()
						: "kitchen";

				return {
					...item,
					item_type: itemType,
					stock: totalStock,
					min_stock: totalMinStock,
					branch_relation_id: stockEntry?.id,
					existsInBranch: !!stockEntry || branchId === "all",
					branch_ids: itemStocks.map((s) => s.branch_id),
					linkedFromCart,
				};
			});

			if (branchId !== "all") {
				mergedItems = mergedItems.filter(
					(item) => item.existsInBranch || linkedInventoryIds.has(item.id),
				);
			}

			setItems(mergedItems);
		} catch (error) {
			console.error("Error loading inventory:", error);
			if (error.code === "42P01") {
				showNotify("Tabla inventory_items no existe. Ejecuta el script SQL.", "error");
			} else {
				showNotify("Error al cargar inventario", "error");
			}
		} finally {
			setLoading(false);
		}
	}, [showNotify, branchId, companyId, allViewBranchIdsKey, prefetchedBranchStock]);

	return {
		items,
		setItems,
		companyInventoryItems,
		setCompanyInventoryItems,
		loading,
		cartCatalogCategoryHints,
		unlinkedCartItems,
		loadItems,
		loadCompanyInventoryItems,
	};
}
