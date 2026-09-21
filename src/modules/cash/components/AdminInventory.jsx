import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useBranchMoney } from "@/modules/cash/hooks/useBranchMoney";
import {
	Search,
	Download,
	Plus,
	Trash2,
	Edit,
	AlertTriangle,
	Package,
	History,
	ChefHat,
	Check,
	ChevronDown,
	ChevronRight,
	Link2Off,
	X,
	Save,
	Loader2,
} from "lucide-react";
import { supabase, TABLES } from "@/integrations/supabase";
import { fetchAllPaginated, PANEL_PAGINATION_PAGE_SIZE } from "@/shared/utils/fetchAllPaginated";
import InventoryItemModal from "./InventoryItemModal";
import AdminHelpTip from "./AdminHelpTip";
import { downloadExcel } from "@/shared/utils/exportUtils";
import { isTypingContext } from "@/modules/cash/admin/utils/keyboardAdmin";
import { getInputUnitOptions, getUnitLabel, normalizeUnit, toNativeQty } from "@/lib/recipe-units";
import { branchSettingsService } from "@/modules/cash/services/branchSettingsService";
import { invalidateBranchInventory } from "@/modules/cash/services/panelDataCache";
import {
	INVENTORY_MOVEMENTS_PANEL_SELECT,
	PRODUCT_INVENTORY_RECIPE_SELECT,
} from "@/modules/cash/services/inventorySelects";
import useInventoryBranchLoad from "@/modules/cash/admin/tabs/inventory/useInventoryBranchLoad";
import { Button } from "@/components/ui/button";

const SUB_TABS = [
	{ id: "supplies", label: "Artículos", icon: Package },
	{ id: "recipes", label: "Recetas", icon: ChefHat },
	{ id: "movements", label: "Movimientos", icon: History },
];

const ENFORCE_HELP =
	"Activado: si falta stock según la receta, el producto no se vende y puede pausarse en el menú. Desactivado: se vende igual (útil mientras cargas el inventario).";

const SUPPLIES_HELP =
	"Cada artículo es stock físico de esta sucursal: materia prima, bebidas, empaque. Escribe directamente sobre la cantidad para corregirla; queda registrada en Movimientos.";

const RECIPES_HELP =
	"Indica qué artículos consume cada producto del catálogo. Al confirmar un pedido se descuenta ese consumo del stock.";

const UNLINKED_HELP =
	"Bebidas y extras que vendes en el carrito pero que todavía no descuentan stock. Regístralos para llevarles inventario.";

function formatMovementType(t) {
	const m = {
		sale: "Venta",
		adjustment: "Ajuste",
		purchase: "Entrada",
		return: "Devolución",
		transfer: "Transferencia",
	};
	return m[t] || t;
}

const ITEM_TYPE_LABELS = {
	kitchen: "General",
	beverage: "Bebida",
	sellable_extra: "Extra",
	other: "Otro",
};

const ITEM_TYPE_ORDER = ["kitchen", "beverage", "sellable_extra", "other"];

const RECIPE_PAGE_SIZE = 60;
const UNLINKED_PREVIEW = 4;

/** Texto editable del stock: sin separador de miles, para poder volver a leerlo. */
function stockToInput(value, decimalComma) {
	const num = Number(value);
	if (!Number.isFinite(num)) return "0";
	const s = String(Number(num.toFixed(4)));
	return decimalComma ? s.replace(".", ",") : s;
}

/** Acepta tanto «2.5» como «2,5». */
function inputToStock(raw) {
	const s = String(raw ?? "").trim().replace(",", ".");
	if (!s) return NaN;
	return Number(s);
}

const AdminInventory = ({
	showNotify,
	branchId,
	branches,
	companyId,
	products = [],
	categories = [],
	onRefreshCatalog,
	prefetchedBranchStock = null,
}) => {
	const { locale } = useBranchMoney();
	const {
		items,
		setItems,
		companyInventoryItems,
		loading,
		cartCatalogCategoryHints,
		unlinkedCartItems,
		loadItems,
		loadCompanyInventoryItems,
	} = useInventoryBranchLoad({
		showNotify,
		branchId,
		companyId,
		branches,
		prefetchedBranchStock,
	});

	const [searchTerm, setSearchTerm] = useState("");
	const [statusFilter, setStatusFilter] = useState("all");
	const [itemTypeFilter, setItemTypeFilter] = useState("all");
	const [sortKey, setSortKey] = useState("name");
	const [sortDir, setSortDir] = useState("asc");
	const [subTab, setSubTab] = useState("supplies");
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [editingItem, setEditingItem] = useState(null);
	const [movements, setMovements] = useState([]);
	const [movementsLoading, setMovementsLoading] = useState(false);
	const [expandedItemId, setExpandedItemId] = useState(null);
	const [recentByItem, setRecentByItem] = useState(() => new Map());
	const [unlinkedExpanded, setUnlinkedExpanded] = useState(false);
	const [stockDrafts, setStockDrafts] = useState(() => ({}));
	const [stockSavingId, setStockSavingId] = useState(null);
	const [stockSavedId, setStockSavedId] = useState(null);
	const [recipes, setRecipes] = useState([]);
	const [recipesLoading, setRecipesLoading] = useState(false);
	const [recipeSearch, setRecipeSearch] = useState("");
	const [recipeEditingProduct, setRecipeEditingProduct] = useState(null);
	const [recipeLines, setRecipeLines] = useState([]);
	const [recipeSaving, setRecipeSaving] = useState(false);
	const [recipePickProductOpen, setRecipePickProductOpen] = useState(false);
	const [recipeFilter, setRecipeFilter] = useState("all");
	const [recipePickSearch, setRecipePickSearch] = useState("");
	const [recipePickShowAll, setRecipePickShowAll] = useState(false);
	const [recipeListLimit, setRecipeListLimit] = useState(RECIPE_PAGE_SIZE);
	const [inventoryEnforceOnSale, setInventoryEnforceOnSale] = useState(true);
	const [inventoryEnforceSaving, setInventoryEnforceSaving] = useState(false);
	const [insumoLineFilter, setInsumoLineFilter] = useState("");
	const [newItemPreset, setNewItemPreset] = useState(null);
	const pendingCatalogLinkRef = useRef(null);
	const stockDraftsRef = useRef({});
	const stockInFlightRef = useRef(new Set());
	const savedFlashRef = useRef(null);

	/** es-VE escribe «2,5»; en-US «2.5». El input respeta lo que ve el usuario. */
	const decimalComma = useMemo(() => (1.1).toLocaleString(locale).includes(","), [locale]);

	/*
	 * «21/9/2026, 6:41:37 a. m.» medía 150px y, al compartir columna en la
	 * tarjeta del móvil, partía en dos el nombre del artículo. Los segundos no
	 * aportan nada en una bitácora de stock.
	 */
	const movementDateFormat = useMemo(
		() =>
			new Intl.DateTimeFormat(locale, {
				day: "2-digit",
				month: "2-digit",
				year: "2-digit",
				hour: "2-digit",
				minute: "2-digit",
				// 24h, como el reloj de la cabecera del panel (y seis caracteres menos).
				hour12: false,
			}),
		[locale],
	);
	const canEditStock = branchId && branchId !== "all";

	useEffect(() => {
		stockDraftsRef.current = stockDrafts;
	}, [stockDrafts]);

	useEffect(() => () => clearTimeout(savedFlashRef.current), []);

	useEffect(() => {
		const onKey = (e) => {
			if (isModalOpen || recipeEditingProduct || recipePickProductOpen) return;
			if (isTypingContext(e.target)) return;
			const map = { 1: "supplies", 2: "recipes", 3: "movements" };
			const next = map[e.key];
			if (!next) return;
			e.preventDefault();
			setSubTab(next);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [isModalOpen, recipeEditingProduct, recipePickProductOpen]);

	const patchCatalogInventoryLink = useCallback(
		async (link, inventoryItemId) => {
			if (!branchId || branchId === "all" || !link?.catalogItemId) return;
			try {
				const data = await branchSettingsService.getCartUpsellSettings(branchId);
				if (!data) throw new Error("GET");
				const key = link.variant === "beverages" ? "cartBeveragesCatalog" : "cartGlobalExtrasCatalog";
				const arr = Array.isArray(data[key]) ? data[key] : [];
				const next = arr.map((row) => {
					if (String(row?.id) !== String(link.catalogItemId)) return row;
					return { ...row, inventoryItemId };
				});
				await branchSettingsService.saveDeliverySettings(branchId, { [key]: next });
				showNotify("Artículo creado y vinculado al ítem del carrito.", "success");
			} catch {
				showNotify(
					"Artículo guardado. Vincúlalo manualmente en Menú → Bebidas o Extras si hace falta.",
					"error",
				);
			}
		},
		[branchId, showNotify],
	);

	useEffect(() => {
		if (!branchId || branchId === "all") {
			setInventoryEnforceOnSale(true);
			return;
		}
		let cancelled = false;
		(async () => {
			try {
				const data = await branchSettingsService.getCartUpsellSettings(branchId);
				if (cancelled) return;
				setInventoryEnforceOnSale(data?.inventoryEnforceOnSale !== false);
			} catch {
				if (!cancelled) setInventoryEnforceOnSale(true);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [branchId]);

	const handleInventoryEnforceToggle = useCallback(
		async (enabled) => {
			if (!branchId || branchId === "all" || inventoryEnforceSaving) return;
			setInventoryEnforceSaving(true);
			try {
				await branchSettingsService.saveDeliverySettings(branchId, {
					inventoryEnforceOnSale: enabled,
				});
				setInventoryEnforceOnSale(enabled);
				if (!enabled) {
					const { error } = await supabase
						.from(TABLES.product_branch)
						.update({
							inventory_pause_reason: null,
							inventory_paused_at: null,
							is_active: true,
						})
						.eq("branch_id", branchId)
						.eq("inventory_pause_reason", "out_of_stock");
					if (error) throw error;
					showNotify(
						"Control de stock desactivado. Los productos pausados solo por inventario se reactivaron.",
						"success",
					);
				} else {
					showNotify(
						"Control de stock activado: sin stock no se vende y los productos pueden pausarse automáticamente.",
						"success",
					);
				}
				onRefreshCatalog?.();
			} catch (e) {
				showNotify(e?.message || "Error al guardar la configuración", "error");
			} finally {
				setInventoryEnforceSaving(false);
			}
		},
		[branchId, inventoryEnforceSaving, showNotify, onRefreshCatalog],
	);

	const loadMovements = useCallback(async () => {
		if (!branchId || branchId === "all" || !companyId) {
			setMovements([]);
			return;
		}
		setMovementsLoading(true);
		try {
			const { data, error } = await supabase
				.from(TABLES.inventory_movements)
				.select(INVENTORY_MOVEMENTS_PANEL_SELECT)
				.eq("branch_id", branchId)
				.eq("company_id", companyId)
				.order("created_at", { ascending: false })
				.limit(200);
			if (error) throw error;
			setMovements(data || []);
		} catch (e) {
			console.warn("movements", e);
			setMovements([]);
		} finally {
			setMovementsLoading(false);
		}
	}, [branchId, companyId]);

	const loadRecipes = useCallback(async () => {
		if (!companyId) {
			setRecipes([]);
			return;
		}
		setRecipesLoading(true);
		try {
			const data = await fetchAllPaginated(
				supabase
					.from(TABLES.product_inventory_recipe)
					.select(PRODUCT_INVENTORY_RECIPE_SELECT)
					.eq("company_id", companyId),
				{ pageSize: PANEL_PAGINATION_PAGE_SIZE },
			);
			setRecipes(data);
		} catch (e) {
			console.warn("recipes", e);
			setRecipes([]);
		} finally {
			setRecipesLoading(false);
		}
	}, [companyId]);

	const handleInventoryModalSaved = useCallback(
		async (detail) => {
			// Capturar antes de await: onClose() del modal vacía el ref en el mismo tick.
			const link = pendingCatalogLinkRef.current;
			if (subTab === "supplies") {
				await loadItems();
			} else if (subTab === "movements") {
				void loadMovements();
			} else if (subTab === "recipes") {
				await loadCompanyInventoryItems();
				void loadRecipes();
			}
			pendingCatalogLinkRef.current = null;
			setNewItemPreset(null);
			if (detail?.isNew && link && detail?.id) {
				await patchCatalogInventoryLink(link, detail.id);
				if (subTab === "supplies") await loadItems();
			}
		},
		[subTab, loadItems, loadMovements, loadRecipes, loadCompanyInventoryItems, patchCatalogInventoryLink],
	);

	useEffect(() => {
		if (subTab === "supplies") {
			void loadItems();
		} else if (subTab === "movements") {
			void loadMovements();
		} else if (subTab === "recipes") {
			void loadCompanyInventoryItems();
			void loadRecipes();
		}
	}, [subTab, loadItems, loadMovements, loadRecipes, loadCompanyInventoryItems]);

	const itemNameById = useMemo(() => {
		const m = new Map();
		for (const it of items) m.set(it.id, it.name);
		for (const it of companyInventoryItems) if (!m.has(it.id)) m.set(it.id, it.name);
		return m;
	}, [items, companyInventoryItems]);

	const itemUnitById = useMemo(() => {
		const m = new Map();
		for (const it of items) m.set(it.id, normalizeUnit(it.unit || "un"));
		for (const it of companyInventoryItems) {
			if (!m.has(it.id)) m.set(it.id, normalizeUnit(it.unit || "un"));
		}
		return m;
	}, [items, companyInventoryItems]);

	/**
	 * Etiquetas para autocompletar categoría: insumos existentes + bebidas/extras del carrito
	 * de esta sucursal (solo grupos del menú, sin nombres de ítems).
	 */
	const existingInventoryCategoryLabels = useMemo(() => {
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
		for (const s of cartCatalogCategoryHints) add(s);
		for (const it of companyInventoryItems || []) add(it?.category);
		out.sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
		return out;
	}, [companyInventoryItems, cartCatalogCategoryHints]);

	const recipeItemOptions = companyInventoryItems.length > 0 ? companyInventoryItems : items;

	const recipeItemOptionsWithStock = useMemo(() => {
		const stockById = new Map(items.map((it) => [String(it.id).toLowerCase(), it.stock]));
		return recipeItemOptions.map((it) => ({
			...it,
			stock: stockById.has(String(it.id).toLowerCase()) ? stockById.get(String(it.id).toLowerCase()) : null,
		}));
	}, [recipeItemOptions, items]);

	const loadRecentForItem = useCallback(
		async (inventoryItemId) => {
			if (!branchId || branchId === "all" || !companyId) return;
			const { data, error } = await supabase
				.from(TABLES.inventory_movements)
				.select("id, quantity_delta, movement_type, created_at, note, order_id")
				.eq("branch_id", branchId)
				.eq("inventory_item_id", inventoryItemId)
				.order("created_at", { ascending: false })
				.limit(8);
			if (error) return;
			setRecentByItem((prev) => {
				const next = new Map(prev);
				next.set(inventoryItemId, data || []);
				return next;
			});
		},
		[branchId, companyId],
	);

	const summary = useMemo(() => {
		let lowStock = 0;
		let outOfStock = 0;
		items.forEach((item) => {
			if (item.stock <= 0) outOfStock++;
			else if (item.stock <= item.min_stock) lowStock++;
		});
		return { lowStock, outOfStock, total: items.length };
	}, [items]);

	/**
	 * Solo ofrecemos el filtro de tipo cuando la sucursal tiene más de uno: en la
	 * mayoría de locales todos los artículos son «General» y la fila de chips era
	 * un control que no filtraba nada.
	 */
	const availableItemTypes = useMemo(() => {
		const present = new Set(items.map((it) => it.item_type || "kitchen"));
		return ITEM_TYPE_ORDER.filter((id) => present.has(id));
	}, [items]);
	const showTypeFilter = availableItemTypes.length > 1;
	const effectiveTypeFilter = showTypeFilter ? itemTypeFilter : "all";

	const filteredItems = useMemo(() => {
		let list = items.filter((item) => {
			const q = searchTerm.toLowerCase();
			const matchText =
				item.name.toLowerCase().includes(q) ||
				(item.category && item.category.toLowerCase().includes(q)) ||
				(Array.isArray(item.tags) &&
					item.tags.some((t) => String(t).toLowerCase().includes(q))) ||
				(item.beverage_kind && String(item.beverage_kind).toLowerCase().includes(q));
			if (!matchText) return false;
			if (effectiveTypeFilter !== "all" && (item.item_type || "kitchen") !== effectiveTypeFilter) return false;
			if (statusFilter === "low") return item.stock > 0 && item.stock <= item.min_stock;
			if (statusFilter === "out") return item.stock <= 0;
			return true;
		});
		list = [...list].sort((a, b) => {
			let av;
			let bv;
			if (sortKey === "stock") {
				av = a.stock;
				bv = b.stock;
			} else {
				av = (a.name || "").toLowerCase();
				bv = (b.name || "").toLowerCase();
			}
			if (av < bv) return sortDir === "asc" ? -1 : 1;
			if (av > bv) return sortDir === "asc" ? 1 : -1;
			return 0;
		});
		return list;
	}, [items, searchTerm, statusFilter, effectiveTypeFilter, sortKey, sortDir]);

	const toggleSort = (key) => {
		if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
		else {
			setSortKey(key);
			setSortDir("asc");
		}
	};

	const handleExport = () => {
		const dataToExport = filteredItems.map((item) => ({
			Artículo: item.name,
			Tipo: ITEM_TYPE_LABELS[item.item_type] || item.item_type,
			Categoria: item.category || "Sin categoría",
			"Tipo bebida": item.beverage_kind || "",
			Etiquetas: Array.isArray(item.tags) ? item.tags.join(", ") : "",
			Stock: item.stock,
			"Stock mínimo": item.min_stock,
			Unidad: getUnitLabel(item.unit || "un", { short: true }),
			Estado: item.stock <= 0 ? "Agotado" : item.stock <= item.min_stock ? "Bajo" : "OK",
		}));
		downloadExcel(
			dataToExport,
			`Inventario_${new Date().toLocaleDateString(locale).replace(/\//g, "-")}.xls`,
		);
	};

	const handleDelete = async (id) => {
		if (!window.confirm("¿Estás seguro de eliminar este artículo?")) return;
		try {
			const { error } = await supabase
				.from(TABLES.inventory_items)
				.delete()
				.eq("id", id)
				.eq("company_id", companyId);
			if (error) throw error;
			showNotify("Artículo eliminado", "success");
			loadItems();
		} catch (error) {
			console.error(error);
			showNotify("Error al eliminar", "error");
		}
	};

	/**
	 * Ajuste rápido desde la lista: corregir una cantidad era abrir un modal de siete
	 * campos para tocar un número. Aquí se escribe encima, se guarda al salir del campo
	 * y queda el movimiento de ajuste igual que si se hubiera hecho desde el modal.
	 */
	const commitStock = useCallback(
		async (item) => {
			if (stockInFlightRef.current.has(item.id)) return;
			const raw = stockDraftsRef.current[item.id];
			// Soltar el borrador devuelve el campo a item.stock, asi que solo se suelta
			// cuando la fila ya trae el valor nuevo: si no, parpadeaba la cifra vieja.
			const clearDraft = () =>
				setStockDrafts((prev) => {
					if (!(item.id in prev)) return prev;
					const next = { ...prev };
					delete next[item.id];
					return next;
				});

			if (raw == null || !canEditStock) {
				clearDraft();
				return;
			}

			const next = inputToStock(raw);
			const prev = Number(item.stock) || 0;
			if (!Number.isFinite(next) || next < 0) {
				clearDraft();
				showNotify("Escribe una cantidad válida (por ejemplo 12 o 2,5).", "error");
				return;
			}
			if (Math.abs(next - prev) < 1e-9) {
				clearDraft();
				return;
			}

			stockInFlightRef.current.add(item.id);
			setStockSavingId(item.id);
			try {
				/*
				 * Sin upsert: `on_conflict` exige una restriccion unica sobre
				 * (inventory_item_id, branch_id) que esta tabla no tiene, y Postgres
				 * responde 42P10. La fila de sucursal ya viene cargada con su id, asi
				 * que se actualiza directamente y solo se inserta si aun no existe.
				 */
				let relationId = item.branch_relation_id || null;
				if (relationId) {
					const { error } = await supabase
						.from(TABLES.inventory_branch)
						.update({ current_stock: next, min_stock: Number(item.min_stock) || 0 })
						.eq("id", relationId);
					if (error) throw error;
				} else {
					const { data, error } = await supabase
						.from(TABLES.inventory_branch)
						.insert({
							inventory_item_id: item.id,
							branch_id: branchId,
							current_stock: next,
							min_stock: Number(item.min_stock) || 0,
						})
						.select("id")
						.single();
					if (error) throw error;
					relationId = data?.id || null;
				}

				if (companyId) {
					const { error: movErr } = await supabase.from(TABLES.inventory_movements).insert({
						company_id: companyId,
						branch_id: branchId,
						inventory_item_id: item.id,
						quantity_delta: next - prev,
						movement_type: "adjustment",
						note: "Ajuste rápido desde la lista",
						metadata: {},
					});
					// El movimiento es la bitácora, no el dato: si falla, el stock ya quedó bien.
					if (movErr) console.warn("inventory_movements:", movErr);
				}

				// El panel precarga el stock de la sucursal y lo cachea 60 s: sin
				// esto, volver a entrar en la pestana ensenaba la cifra anterior.
				invalidateBranchInventory(branchId);
				setItems((list) =>
					list.map((it) =>
						it.id === item.id
							? { ...it, stock: next, existsInBranch: true, branch_relation_id: relationId }
							: it,
					),
				);
				setRecentByItem((m) => {
					if (!m.has(item.id)) return m;
					const copy = new Map(m);
					copy.delete(item.id);
					return copy;
				});
				clearDraft();
				setStockSavedId(item.id);
				clearTimeout(savedFlashRef.current);
				savedFlashRef.current = setTimeout(() => setStockSavedId(null), 1600);
			} catch (e) {
				console.error("stock inline", e);
				clearDraft();
				showNotify("No se pudo guardar la cantidad. Inténtalo de nuevo.", "error");
			} finally {
				stockInFlightRef.current.delete(item.id);
				setStockSavingId(null);
			}
		},
		[branchId, companyId, canEditStock, showNotify, setItems],
	);

	const handleEdit = (item) => {
		pendingCatalogLinkRef.current = null;
		setNewItemPreset(null);
		setEditingItem(item);
		setIsModalOpen(true);
	};

	const handleCreate = () => {
		pendingCatalogLinkRef.current = null;
		setNewItemPreset(null);
		setEditingItem(null);
		setIsModalOpen(true);
	};

	const openRegisterFromCart = (row) => {
		pendingCatalogLinkRef.current = {
			variant: row.variant,
			catalogItemId: row.item.id,
		};
		setEditingItem(null);
		setNewItemPreset({
			name: String(row.item.name || "").trim(),
			category: row.variant === "beverages" ? "Bebidas" : "Extras",
			itemType: row.variant === "beverages" ? "beverage" : "sellable_extra",
			beverageKind:
				row.variant === "beverages"
					? String(row.item.beverageKind ?? row.item.beverage_kind ?? "").trim()
					: "",
		});
		setIsModalOpen(true);
	};

	const recipesByProduct = useMemo(() => {
		const m = new Map();
		for (const r of recipes) {
			const pid = r.product_id;
			if (!m.has(pid)) m.set(pid, []);
			m.get(pid).push(r);
		}
		return m;
	}, [recipes]);

	const categoryNameById = useMemo(() => {
		const m = new Map();
		for (const c of categories || []) {
			if (c?.id) m.set(c.id, String(c.name ?? "").trim() || "Sin categoría");
		}
		return m;
	}, [categories]);

	const recipeProductBaseList = useMemo(() => {
		return (products || []).map((p) => {
			const lines = recipesByProduct.get(p.id) || [];
			const hasRecipe = lines.length > 0;
			const insumoNames = lines
				.map((l) => itemNameById.get(l.inventory_item_id))
				.filter(Boolean);
			return {
				...p,
				categoryName: categoryNameById.get(p.category_id) || "",
				hasRecipe,
				insumoCount: lines.length,
				insumoNames,
			};
		});
	}, [products, recipesByProduct, categoryNameById, itemNameById]);

	const recipeStats = useMemo(() => {
		let withRecipe = 0;
		for (const p of recipeProductBaseList) {
			if (p.hasRecipe) withRecipe++;
		}
		return {
			withRecipe,
			withoutRecipe: recipeProductBaseList.length - withRecipe,
			total: recipeProductBaseList.length,
		};
	}, [recipeProductBaseList]);

	const matchesRecipeSearch = useCallback((p, q) => {
		if (!q) return true;
		if ((p.name || "").toLowerCase().includes(q)) return true;
		if ((p.categoryName || "").toLowerCase().includes(q)) return true;
		for (const name of p.insumoNames || []) {
			if (String(name).toLowerCase().includes(q)) return true;
		}
		return false;
	}, []);

	const recipeProductList = useMemo(() => {
		const q = recipeSearch.trim().toLowerCase();
		let list = recipeProductBaseList.filter((p) => {
			if (!matchesRecipeSearch(p, q)) return false;
			if (recipeFilter === "with") return p.hasRecipe;
			if (recipeFilter === "without") return !p.hasRecipe;
			return true;
		});
		list = [...list].sort((a, b) => {
			if (a.hasRecipe !== b.hasRecipe) return a.hasRecipe ? 1 : -1;
			return (a.name || "").localeCompare(b.name || "", "es", { sensitivity: "base" });
		});
		return list;
	}, [recipeProductBaseList, recipeSearch, recipeFilter, matchesRecipeSearch]);

	const recipeProductListVisible = useMemo(
		() => recipeProductList.slice(0, recipeListLimit),
		[recipeProductList, recipeListLimit],
	);

	const recipePickProductList = useMemo(() => {
		const q = recipePickSearch.trim().toLowerCase();
		return recipeProductBaseList
			.filter((p) => {
				if (!recipePickShowAll && p.hasRecipe) return false;
				return matchesRecipeSearch(p, q);
			})
			.sort((a, b) => {
				if (a.hasRecipe !== b.hasRecipe) return a.hasRecipe ? 1 : -1;
				return (a.name || "").localeCompare(b.name || "", "es", { sensitivity: "base" });
			})
			.slice(0, 80);
	}, [recipeProductBaseList, recipePickSearch, recipePickShowAll, matchesRecipeSearch]);

	const usedInsumoIds = useMemo(
		() => new Set(recipeLines.map((l) => String(l.inventory_item_id))),
		[recipeLines],
	);

	/** Lo que queda por añadir: sin lo que ya está en la receta y acotado por la búsqueda. */
	const addableInsumoOptions = useMemo(() => {
		const q = insumoLineFilter.trim().toLowerCase();
		return recipeItemOptionsWithStock.filter((it) => {
			if (usedInsumoIds.has(String(it.id))) return false;
			if (!q) return true;
			const name = (it.name || "").toLowerCase();
			const cat = (it.category || "").toLowerCase();
			return name.includes(q) || cat.includes(q);
		});
	}, [recipeItemOptionsWithStock, insumoLineFilter, usedInsumoIds]);

	const openRecipeEditor = (product) => {
		setRecipeEditingProduct(product);
		setInsumoLineFilter("");
		const lines = recipesByProduct.get(product.id) || [];
		const opts = companyInventoryItems.length > 0 ? companyInventoryItems : items;
		setRecipeLines(
			lines.map((l) => {
				const item = opts.find((it) => String(it.id) === String(l.inventory_item_id));
				const native = normalizeUnit(item?.unit || "un");
				return {
					id: l.id,
					inventory_item_id: l.inventory_item_id,
					qty_per_sale: Number(l.qty_per_sale) || 1,
					input_unit: native,
				};
			}),
		);
	};

	const openAddRecipePicker = () => {
		setRecipePickSearch("");
		setRecipePickShowAll(false);
		setRecipePickProductOpen(true);
	};

	/*
	 * Antes cada línea era un desplegable de artículos: seis ingredientes
	 * significaban seis desplegables idénticos apilados. Ahora el artículo se
	 * elige una vez al añadirlo y la línea solo queda con su cantidad.
	 */
	const addRecipeLineFor = (itemId) => {
		if (!itemId) return;
		const item = recipeItemOptionsWithStock.find((it) => String(it.id) === String(itemId));
		setRecipeLines((prev) => [
			...prev,
			{
				id: null,
				inventory_item_id: itemId,
				qty_per_sale: 1,
				input_unit: normalizeUnit(item?.unit || "un"),
			},
		]);
		setInsumoLineFilter("");
	};

	const updateRecipeLine = (index, field, value) => {
		setRecipeLines((prev) => prev.map((line, i) => (i === index ? { ...line, [field]: value } : line)));
	};

	const removeRecipeLine = (index) => {
		setRecipeLines((prev) => prev.filter((_, i) => i !== index));
	};

	const pickProductForRecipe = (product) => {
		setRecipePickProductOpen(false);
		openRecipeEditor(product);
	};

	const saveRecipes = async () => {
		if (!recipeEditingProduct || !companyId) return;
		setRecipeSaving(true);
		try {
			const productId = recipeEditingProduct.id;
			const { error: delErr } = await supabase
				.from(TABLES.product_inventory_recipe)
				.delete()
				.eq("product_id", productId)
				.eq("company_id", companyId);
			if (delErr) throw delErr;
			const itemOpts = recipeItemOptions;
			const rows = recipeLines
				.filter((l) => l.inventory_item_id && String(l.inventory_item_id).trim())
				.map((l) => {
					const inv = itemOpts.find((it) => String(it.id) === String(l.inventory_item_id));
					const native = normalizeUnit(inv?.unit || "un");
					const qtyNative = toNativeQty(
						Number(l.qty_per_sale),
						l.input_unit || native,
						native,
					);
					return {
						company_id: companyId,
						product_id: productId,
						inventory_item_id: String(l.inventory_item_id).trim(),
						qty_per_sale: Math.max(0.0001, qtyNative || 0),
					};
				});
			if (rows.length > 0) {
				const { error: insErr } = await supabase.from(TABLES.product_inventory_recipe).insert(rows);
				if (insErr) throw insErr;
			}
			showNotify("Receta guardada", "success");
			setRecipeEditingProduct(null);
			await loadRecipes();
		} catch (e) {
			showNotify(e?.message || "Error al guardar receta", "error");
		} finally {
			setRecipeSaving(false);
		}
	};

	const movementRows = useMemo(() => {
		return movements.map((m) => ({
			...m,
			itemName: itemNameById.get(m.inventory_item_id) || "—",
			unitShort: getUnitLabel(itemUnitById.get(m.inventory_item_id) || "un", { short: true }),
		}));
	}, [movements, itemNameById, itemUnitById]);

	const unlinkedVisible = unlinkedExpanded
		? unlinkedCartItems
		: unlinkedCartItems.slice(0, UNLINKED_PREVIEW);
	const unlinkedRest = unlinkedCartItems.length - unlinkedVisible.length;

	/*
	 * Las tres cifras eran una pestaña «Resumen» entera que solo se miraba: ahora son
	 * el filtro de la lista, así que «2 agotados» se puede pulsar para ver cuáles.
	 */
	const statCards = [
		{ id: "all", label: "Artículos", value: summary.total, tone: null, Icon: Package },
		{ id: "low", label: "Stock bajo", value: summary.lowStock, tone: "warn", Icon: AlertTriangle },
		{ id: "out", label: "Agotados", value: summary.outOfStock, tone: "danger", Icon: AlertTriangle },
	];

	return (
		<div className="inventory-view animate-fade">
			<nav className="inventory-subtabs" aria-label="Secciones de inventario">
				{SUB_TABS.map(({ id, label, icon: Icon }) => (
					<Button variant="default"
						key={id}
						type="button"
						className={`inventory-subtab ${subTab === id ? "inventory-subtab--active" : ""}`}
						aria-current={subTab === id ? "page" : undefined}
						onClick={() => setSubTab(id)}
					>
						<Icon size={17} aria-hidden />
						{label}
					</Button>
				))}
			</nav>

			{branchId && branchId !== "all" ? (
				<div className="inventory-enforce-row">
					<span className="inventory-enforce-row__label">
						Control de stock en ventas
						<AdminHelpTip text={ENFORCE_HELP} />
					</span>
					<span className="inventory-enforce-row__state">
						{inventoryEnforceOnSale ? "Activado" : "Desactivado"}
					</span>
					<label className="inventory-enforce-row__switch switch-control">
						<input
							type="checkbox"
							checked={inventoryEnforceOnSale}
							disabled={inventoryEnforceSaving}
							onChange={(e) => void handleInventoryEnforceToggle(e.target.checked)}
							aria-label="Control de stock en ventas"
						/>
						<span className="slider" aria-hidden="true" />
					</label>
				</div>
			) : null}

			{subTab === "supplies" && (
				<>
					<div className="inventory-stats" role="group" aria-label="Estado del inventario">
						{statCards.map(({ id, label, value, tone, Icon }) => {
							const active = statusFilter === id;
							// Un «0» en naranja o rojo alarmaba sin motivo: el color solo aparece
							// cuando de verdad hay artículos en ese estado.
							const toneClass = tone && value > 0 ? ` inventory-stat--${tone}` : "";
							return (
								<button
									key={id}
									type="button"
									className={`inventory-stat${toneClass}${active ? " inventory-stat--active" : ""}`}
									aria-pressed={active}
									onClick={() => setStatusFilter(active && id !== "all" ? "all" : id)}
								>
									<span className="inventory-stat__icon" aria-hidden>
										<Icon size={18} strokeWidth={2} />
									</span>
									<span className="inventory-stat__value">{value}</span>
									<span className="inventory-stat__label">{label}</span>
								</button>
							);
						})}
					</div>

					{branchId !== "all" && unlinkedCartItems.length > 0 ? (
						<div className="inventory-unlinked" role="region" aria-label="Ítems del carrito sin artículo">
							<p className="inventory-unlinked__head">
								<Link2Off size={16} strokeWidth={2} aria-hidden />
								<strong>
									{unlinkedCartItems.length}{" "}
									{unlinkedCartItems.length === 1
										? "ítem del carrito sin artículo"
										: "ítems del carrito sin artículo"}
								</strong>
								<AdminHelpTip text={UNLINKED_HELP} />
							</p>
							<ul className="inventory-unlinked__list">
								{unlinkedVisible.map((row) => (
									<li key={`${row.variant}-${row.item.id}`}>
										<span className="inventory-unlinked__name">{row.item.name}</span>
										<span className="inventory-unlinked__kind">
											{row.variant === "beverages" ? "Bebida" : "Extra"}
										</span>
										<button
											type="button"
											className="inventory-unlinked__cta"
											onClick={() => openRegisterFromCart(row)}
										>
											<Plus size={14} strokeWidth={2.25} aria-hidden />
											Registrar
										</button>
									</li>
								))}
							</ul>
							{unlinkedRest > 0 ? (
								<button
									type="button"
									className="inventory-unlinked__more"
									onClick={() => setUnlinkedExpanded(true)}
								>
									Ver los {unlinkedRest} restantes
								</button>
							) : null}
						</div>
					) : null}

					<div className="admin-toolbar inventory-toolbar">
						<div className="search-box">
							<Search size={18} aria-hidden />
							<input
								type="search"
								placeholder="Buscar artículo…"
								value={searchTerm}
								onChange={(e) => setSearchTerm(e.target.value)}
								aria-label="Buscar en inventario"
							/>
						</div>

						{showTypeFilter ? (
							<div className="inventory-toolbar__chips">
								<span className="inventory-toolbar__chip-label">Tipo</span>
								{["all", ...availableItemTypes].map((id) => (
									<button
										key={id}
										type="button"
										className={`inventory-chip ${itemTypeFilter === id ? "inventory-chip--active" : ""}`}
										onClick={() => setItemTypeFilter(id)}
									>
										{id === "all" ? "Todos" : ITEM_TYPE_LABELS[id]}
									</button>
								))}
							</div>
						) : null}

						<div className="inventory-toolbar__actions">
							<Button
								variant="secondary"
								type="button"
								onClick={handleExport}
								title="Exportar a Excel"
								aria-label="Exportar a Excel"
							>
								<Download size={16} aria-hidden />
								<span className="inventory-btn-text">Exportar</span>
							</Button>
							<Button variant="default" type="button" onClick={handleCreate}>
								<Plus size={16} aria-hidden />
								{/* Un solo hijo flexible: como dos, el `gap` del botón separaba
								    «Nuevo» y «artículo» más que un espacio normal. */}
								<span>
									Nuevo<span className="inventory-btn-word"> artículo</span>
								</span>
							</Button>
						</div>
					</div>

					{loading ? (
						<div className="inventory-loading">
							<Loader2 size={18} className="animate-spin" aria-hidden /> Cargando inventario…
						</div>
					) : filteredItems.length === 0 ? (
						<div className="inventory-empty">
							<p>
								{items.length === 0
									? "Todavía no hay artículos en esta sucursal."
									: "Ningún artículo coincide con lo que buscas."}
							</p>
							{items.length === 0 && (
								<Button variant="default" type="button" onClick={handleCreate}>
									<Plus size={16} aria-hidden /> Crear el primero
								</Button>
							)}
						</div>
					) : (
						<div className="inventory-table-container inventory-table-container--cards">
							<table className="inventory-table">
								<thead>
									<tr>
										<th>
											<button type="button" className="inventory-th-sort" onClick={() => toggleSort("name")}>
												Artículo {sortKey === "name" ? (sortDir === "asc" ? "↑" : "↓") : ""}
											</button>
										</th>
										<th>
											<button type="button" className="inventory-th-sort" onClick={() => toggleSort("stock")}>
												Stock {sortKey === "stock" ? (sortDir === "asc" ? "↑" : "↓") : ""}
											</button>
											<AdminHelpTip text={SUPPLIES_HELP} />
										</th>
										<th>Estado</th>
										<th className="inventory-th-actions">Acciones</th>
									</tr>
								</thead>
								<tbody>
									{filteredItems.map((item) => {
										let statusBadge;
										if (item.stock <= 0) statusBadge = <span className="stock-badge out">Agotado</span>;
										else if (item.stock <= item.min_stock)
											statusBadge = <span className="stock-badge low">Bajo</span>;
										else statusBadge = <span className="stock-badge available">OK</span>;
										const expanded = expandedItemId === item.id;
										const recent = recentByItem.get(item.id) || [];
										const unitShort = getUnitLabel(item.unit || "un", { short: true });
										const typeLabel = ITEM_TYPE_LABELS[item.item_type];
										const draft = stockDrafts[item.id];
										const saving = stockSavingId === item.id;
										const saved = stockSavedId === item.id;

										return (
											<React.Fragment key={item.id}>
												<tr className={expanded ? "inventory-row--open" : ""}>
													<td className="inventory-td-name">
														{branchId !== "all" ? (
															<button
																type="button"
																className="inventory-name-btn"
																aria-expanded={expanded}
																onClick={() => {
																	if (expanded) {
																		setExpandedItemId(null);
																	} else {
																		setExpandedItemId(item.id);
																		void loadRecentForItem(item.id);
																	}
																}}
															>
																{expanded ? (
																	<ChevronDown size={16} aria-hidden />
																) : (
																	<ChevronRight size={16} aria-hidden />
																)}
																<span className="inventory-name-btn__text">{item.name}</span>
															</button>
														) : (
															<span className="inventory-name-btn__text">{item.name}</span>
														)}
														{/* «General» es el tipo de casi todo: solo se marca lo que se sale de ahí. */}
														{item.item_type && item.item_type !== "kitchen" ? (
															<span className="inventory-type-badge">
																{typeLabel || item.item_type}
																{item.item_type === "beverage" && item.beverage_kind
																	? ` · ${item.beverage_kind}`
																	: ""}
															</span>
														) : null}
														{item.linkedFromCart ? (
															<span className="inventory-cart-link-badge">Carrito</span>
														) : null}
													</td>
													<td className="inventory-td-stock">
														{canEditStock ? (
															<span
																className={`inventory-stock-edit${saving ? " inventory-stock-edit--busy" : ""}`}
															>
																<input
																	className="inventory-stock-input"
																	type="text"
																	inputMode="decimal"
																	value={draft ?? stockToInput(item.stock, decimalComma)}
																	disabled={saving}
																	aria-label={`Cantidad de ${item.name} en ${unitShort}`}
																	onFocus={(e) => e.target.select()}
																	onChange={(e) =>
																		setStockDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
																	}
																	onBlur={() => void commitStock(item)}
																	onKeyDown={(e) => {
																		if (e.key === "Enter") {
																			e.preventDefault();
																			e.currentTarget.blur();
																		} else if (e.key === "Escape") {
																			e.preventDefault();
																			setStockDrafts((prev) => {
																				const next = { ...prev };
																				delete next[item.id];
																				return next;
																			});
																			e.currentTarget.blur();
																		}
																	}}
																/>
																<span className="inventory-stock-unit">{unitShort}</span>
																{saving ? (
																	<Loader2 size={14} className="animate-spin" aria-hidden />
																) : saved ? (
																	<Check size={14} className="inventory-stock-ok" aria-hidden />
																) : null}
															</span>
														) : (
															<span className="inventory-stock-static">
																{Number(item.stock).toLocaleString(locale, { maximumFractionDigits: 3 })}{" "}
																{unitShort}
															</span>
														)}
														{Number(item.min_stock) > 0 ? (
															<span className="inventory-stock-min">
																mín. {Number(item.min_stock).toLocaleString(locale, { maximumFractionDigits: 3 })}
															</span>
														) : null}
													</td>
													<td className="inventory-td-status">{statusBadge}</td>
													<td className="inventory-td-actions">
														<div className="inventory-row-actions">
															<button
																type="button"
																className="btn-edit-sm"
																onClick={() => handleEdit(item)}
																aria-label={`Editar ${item.name}`}
															>
																<Edit size={16} aria-hidden />
															</button>
															<button
																type="button"
																className="btn-trash-sm"
																onClick={() => handleDelete(item.id)}
																aria-label={`Eliminar ${item.name}`}
															>
																<Trash2 size={16} aria-hidden />
															</button>
														</div>
													</td>
												</tr>
												{expanded && branchId !== "all" ? (
													<tr className="inventory-expand-row">
														<td colSpan={4}>
															<div className="inventory-expand-panel">
																<strong>Últimos movimientos</strong>
																{recent.length === 0 ? (
																	<p className="inventory-expand-empty">Sin movimientos todavía.</p>
																) : (
																	<ul className="inventory-expand-list">
																		{recent.map((mv) => (
																			<li key={mv.id}>
																				<span className="inventory-expand-type">
																					{formatMovementType(mv.movement_type)}
																				</span>
																				<span
																					className={
																						Number(mv.quantity_delta) < 0
																							? "inventory-expand-delta neg"
																							: "inventory-expand-delta pos"
																					}
																				>
																					{Number(mv.quantity_delta) > 0 ? "+" : ""}
																					{mv.quantity_delta} {unitShort}
																				</span>
																				<span className="inventory-expand-meta">
																					{movementDateFormat.format(new Date(mv.created_at))}
																					{mv.order_id ? ` · Pedido #${String(mv.order_id).slice(-6)}` : ""}
																				</span>
																			</li>
																		))}
																	</ul>
																)}
															</div>
														</td>
													</tr>
												) : null}
											</React.Fragment>
										);
									})}
								</tbody>
							</table>
						</div>
					)}
				</>
			)}

			{subTab === "movements" && (
				<div className="inventory-movements">
					{branchId === "all" ? (
						<p className="inventory-muted">Selecciona una sucursal para ver sus movimientos.</p>
					) : movementsLoading ? (
						<p className="inventory-muted">
							<Loader2 size={16} className="animate-spin" aria-hidden /> Cargando movimientos…
						</p>
					) : movementRows.length === 0 ? (
						<div className="inventory-empty">
							<p>Aquí quedará registrada cada entrada y salida de stock de esta sucursal.</p>
						</div>
					) : (
						<div className="inventory-table-container inventory-table-container--cards">
							<table className="inventory-table inventory-table--compact">
								<thead>
									<tr>
										<th>Fecha</th>
										<th>Artículo</th>
										<th>Motivo</th>
										<th>Cambio</th>
										<th>Nota</th>
									</tr>
								</thead>
								<tbody>
									{movementRows.map((m) => {
										const noteText = [m.note, m.order_id ? `#${String(m.order_id).slice(-6)}` : ""]
											.filter(Boolean)
											.join(" · ");
										return (
											<tr key={m.id}>
												<td className="inventory-mv-date">
													{movementDateFormat.format(new Date(m.created_at))}
												</td>
												<td className="inventory-td-name inventory-mv-item">{m.itemName}</td>
												<td className="inventory-mv-type">{formatMovementType(m.movement_type)}</td>
												<td
													className={`inventory-movement-delta ${
														Number(m.quantity_delta) < 0
															? "inventory-movement-delta--neg"
															: "inventory-movement-delta--pos"
													}`}
												>
													{Number(m.quantity_delta) > 0 ? "+" : ""}
													{m.quantity_delta} {m.unitShort}
												</td>
												{/* Sin nota se pinta una raya en escritorio, para no dejar la
												    columna vacia; en la tarjeta del movil esa raya sobra. */}
												<td className={`inventory-mv-note${noteText ? "" : " inventory-mv-note--empty"}`}>
													{noteText || "—"}
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					)}
				</div>
			)}

			{subTab === "recipes" && (
				<div className="inventory-recipes">
					<div className="admin-toolbar inventory-toolbar">
						<div className="search-box">
							<Search size={18} aria-hidden />
							<input
								type="search"
								placeholder="Buscar producto o artículo…"
								value={recipeSearch}
								onChange={(e) => {
									setRecipeSearch(e.target.value);
									setRecipeListLimit(RECIPE_PAGE_SIZE);
								}}
								aria-label="Buscar productos para receta"
							/>
						</div>

						<div className="inventory-toolbar__chips">
							{[
								{ id: "all", label: "Todos" },
								{ id: "without", label: "Sin receta" },
								{ id: "with", label: "Con receta" },
							].map((c) => (
								<button
									key={c.id}
									type="button"
									className={`inventory-chip ${recipeFilter === c.id ? "inventory-chip--active" : ""}`}
									onClick={() => {
										setRecipeFilter(c.id);
										setRecipeListLimit(RECIPE_PAGE_SIZE);
									}}
								>
									{c.label}
								</button>
							))}
						</div>

						<div className="inventory-toolbar__actions">
							<Button variant="default" type="button" onClick={openAddRecipePicker}>
								<Plus size={16} aria-hidden /> Agregar receta
							</Button>
						</div>
					</div>

					<p className="inventory-summary-line">
						{recipeStats.withRecipe} de {recipeStats.total}{" "}
						{recipeStats.total === 1 ? "producto descuenta" : "productos descuentan"} stock
						{recipeStats.withoutRecipe > 0 ? ` · ${recipeStats.withoutRecipe} sin receta` : ""}
						<AdminHelpTip text={RECIPES_HELP} />
					</p>

					{recipesLoading ? (
						<p className="inventory-muted">
							<Loader2 size={16} className="animate-spin" aria-hidden /> Cargando recetas…
						</p>
					) : recipeProductList.length === 0 ? (
						<div className="inventory-empty">
							<p>Ningún producto coincide con lo que buscas.</p>
						</div>
					) : (
						<>
							<div className="inventory-recipe-grid">
								{recipeProductListVisible.map((product) => {
									const summaryText =
										product.insumoNames?.length > 0
											? `${product.insumoCount} ${product.insumoCount === 1 ? "artículo" : "artículos"}: ` +
												product.insumoNames.slice(0, 2).join(", ") +
												(product.insumoNames.length > 2 ? ` +${product.insumoNames.length - 2}` : "")
											: "Todavía no descuenta stock";
									return (
										<button
											key={product.id}
											type="button"
											className="inventory-recipe-card"
											onClick={() => openRecipeEditor(product)}
										>
											<span className="inventory-recipe-card__head">
												<strong className="inventory-recipe-card__name">{product.name}</strong>
												{product.hasRecipe ? null : (
													<span className="inventory-recipe-card__badge--empty">Sin receta</span>
												)}
											</span>
											{product.categoryName ? (
												<span className="inventory-recipe-card__cat">{product.categoryName}</span>
											) : null}
											<span className="inventory-recipe-card__meta">{summaryText}</span>
										</button>
									);
								})}
							</div>
							{recipeProductList.length > recipeListLimit ? (
								<div className="inventory-recipes__more">
									<Button variant="secondary"
										type="button"
										onClick={() => setRecipeListLimit((n) => n + RECIPE_PAGE_SIZE)}
									>
										Mostrar más ({recipeProductList.length - recipeListLimit} restantes)
									</Button>
								</div>
							) : null}
						</>
					)}
				</div>
			)}

			{recipePickProductOpen ? (
				<div
					className="modal-overlay"
					role="dialog"
					aria-modal="true"
					aria-labelledby="recipe-pick-title"
					onClick={() => setRecipePickProductOpen(false)}
				>
					<div
						className="modal-content inventory-recipe-modal inventory-recipe-picker animate-scale-in"
						onClick={(e) => e.stopPropagation()}
					>
						<header className="modal-header">
							<h3 id="recipe-pick-title">Elige el producto</h3>
							<Button variant="default"
								type="button"
								className="btn-close"
								aria-label="Cerrar"
								onClick={() => setRecipePickProductOpen(false)}
							>
								<X size={22} />
							</Button>
						</header>
						<div className="inventory-recipe-picker__toolbar">
							<div className="search-box inventory-recipe-picker__search">
								<Search size={18} aria-hidden />
								<input
									type="search"
									placeholder="Buscar producto o categoría…"
									value={recipePickSearch}
									onChange={(e) => setRecipePickSearch(e.target.value)}
									aria-label="Buscar en lista de productos"
									autoFocus
								/>
							</div>
							<label className="inventory-recipe-picker__toggle">
								<input
									type="checkbox"
									checked={recipePickShowAll}
									onChange={(e) => setRecipePickShowAll(e.target.checked)}
								/>
								Incluir los que ya tienen receta
							</label>
						</div>
						<div className="modal-form-scroll inventory-recipe-picker__list">
							{recipePickProductList.length === 0 ? (
								<p className="inventory-recipe-empty-hint">
									Sin coincidencias. Prueba otra búsqueda o incluye los que ya tienen receta.
								</p>
							) : (
								<ul className="inventory-recipe-picker__items">
									{recipePickProductList.map((p) => (
										<li key={p.id}>
											<button
												type="button"
												className="inventory-recipe-picker__item"
												onClick={() => pickProductForRecipe(p)}
											>
												<span className="inventory-recipe-picker__item-name">{p.name}</span>
												{p.categoryName ? (
													<span className="inventory-recipe-picker__item-cat">{p.categoryName}</span>
												) : null}
												{p.hasRecipe ? (
													<span className="inventory-recipe-picker__item-badge">Ya tiene receta</span>
												) : null}
											</button>
										</li>
									))}
								</ul>
							)}
						</div>
					</div>
				</div>
			) : null}

			{recipeEditingProduct ? (
				<div
					className="modal-overlay"
					role="dialog"
					aria-modal="true"
					aria-labelledby="recipe-edit-title"
					onClick={() => !recipeSaving && setRecipeEditingProduct(null)}
				>
					<div
						className="modal-content inventory-recipe-modal animate-scale-in"
						onClick={(e) => e.stopPropagation()}
					>
						<header className="modal-header">
							<div>
								<h3 id="recipe-edit-title">{recipeEditingProduct.name}</h3>
								<p className="inventory-modal-subtitle">Se descuenta esto por cada unidad vendida</p>
							</div>
							<Button variant="default"
								type="button"
								className="btn-close"
								aria-label="Cerrar"
								disabled={recipeSaving}
								onClick={() => setRecipeEditingProduct(null)}
							>
								<X size={22} />
							</Button>
						</header>
						<form
							onSubmit={(e) => {
								e.preventDefault();
								void saveRecipes();
							}}
						>
							<div className="modal-form-scroll inventory-recipe-editor__body">
								{recipeLines.length === 0 ? (
									<p className="inventory-recipe-empty-hint">
										Sin artículos: este producto se venderá sin descontar stock.
									</p>
								) : (
									<ul className="inventory-recipe-lines">
										{recipeLines.map((line, idx) => {
											const sel = recipeItemOptionsWithStock.find(
												(i) => String(i.id) === String(line.inventory_item_id),
											);
											const nativeUnit = normalizeUnit(sel?.unit || "un");
											const unitOpts = getInputUnitOptions(nativeUnit);
											const stockLabel =
												sel && sel.stock != null && Number.isFinite(Number(sel.stock))
													? `Quedan ${Number(sel.stock).toLocaleString(locale, { maximumFractionDigits: 3 })} ${getUnitLabel(nativeUnit, { short: true })}`
													: null;
											return (
												<li key={idx} className="inventory-recipe-line">
													<span className="inventory-recipe-line__item">
														<span className="inventory-recipe-line__name">
															{sel?.name || "Artículo que ya no existe"}
														</span>
														{stockLabel ? (
															<span className="inventory-recipe-line__stock">{stockLabel}</span>
														) : null}
													</span>
													<input
														type="number"
														step="any"
														min="0"
														className="inventory-recipe-line__qty"
														aria-label={`Cantidad de ${sel?.name || "el artículo"} por venta`}
														value={line.qty_per_sale}
														onChange={(e) => updateRecipeLine(idx, "qty_per_sale", e.target.value)}
													/>
													{/* Un solo valor posible no merece un desplegable. */}
													{unitOpts.length > 1 ? (
														<select
															className="inventory-recipe-line__unit"
															aria-label={`Unidad de ${sel?.name || "el artículo"}`}
															value={line.input_unit || nativeUnit}
															onChange={(e) => updateRecipeLine(idx, "input_unit", e.target.value)}
														>
															{unitOpts.map((u) => (
																<option key={u} value={u}>
																	{getUnitLabel(u, { short: true })}
																</option>
															))}
														</select>
													) : (
														<span className="inventory-recipe-line__unit-static">
															{getUnitLabel(nativeUnit, { short: true })}
														</span>
													)}
													<button
														type="button"
														className="inventory-recipe-line__remove"
														aria-label={`Quitar ${sel?.name || "la línea"} de la receta`}
														onClick={() => removeRecipeLine(idx)}
													>
														<X size={16} aria-hidden />
													</button>
												</li>
											);
										})}
									</ul>
								)}

								<div className="inventory-recipe-add">
									{recipeItemOptionsWithStock.length > 12 ? (
										<div className="search-box inventory-recipe-add__search">
											<Search size={16} aria-hidden />
											<input
												type="search"
												placeholder="Acotar la lista…"
												value={insumoLineFilter}
												onChange={(e) => setInsumoLineFilter(e.target.value)}
												aria-label="Acotar la lista de artículos"
											/>
										</div>
									) : null}
									<span className="inventory-recipe-add__field">
										<Plus size={16} strokeWidth={2.25} aria-hidden />
										<select
											className="inventory-recipe-add__select"
											aria-label="Añadir un artículo a la receta"
											value=""
											disabled={addableInsumoOptions.length === 0}
											onChange={(e) => addRecipeLineFor(e.target.value)}
										>
											<option value="">
												{addableInsumoOptions.length === 0
													? "No queda ningún artículo por añadir"
													: "Añadir un artículo…"}
											</option>
											{addableInsumoOptions.map((item) => {
												const u = normalizeUnit(item.unit || "un");
												const stock =
													item.stock != null && Number.isFinite(Number(item.stock))
														? ` · quedan ${Number(item.stock).toLocaleString(locale, { maximumFractionDigits: 3 })} ${getUnitLabel(u, { short: true })}`
														: "";
												return (
													<option key={item.id} value={item.id}>
														{item.name}
														{stock}
													</option>
												);
											})}
										</select>
									</span>
								</div>
							</div>
							<footer className="modal-footer">
								<Button variant="secondary"
									type="button"
									disabled={recipeSaving}
									onClick={() => setRecipeEditingProduct(null)}
								>
									Cancelar
								</Button>
								<Button variant="default" type="submit" disabled={recipeSaving}>
									<Save size={18} aria-hidden />
									{recipeSaving ? "Guardando…" : "Guardar receta"}
								</Button>
							</footer>
						</form>
					</div>
				</div>
			) : null}

			<InventoryItemModal
				isOpen={isModalOpen}
				onClose={() => {
					setIsModalOpen(false);
					pendingCatalogLinkRef.current = null;
					setNewItemPreset(null);
				}}
				onItemSaved={handleInventoryModalSaved}
				itemToEdit={editingItem}
				showNotify={showNotify}
				branchId={branchId}
				branches={branches}
				companyId={companyId}
				existingCategoryLabels={existingInventoryCategoryLabels}
				newItemPreset={newItemPreset}
			/>
		</div>
	);
};

export default AdminInventory;
