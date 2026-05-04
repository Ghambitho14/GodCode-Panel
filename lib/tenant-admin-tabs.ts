/**
 * Única fuente de verdad para las pestañas del panel admin del tenant.
 *
 * Contrato con Supabase (`public.companies.theme_config`):
 * - `panelAccess`: array con ids de pestaña habilitados para la empresa.
 * - `roleNavPermissions`: legacy por rol, solo para transición de datos.
 *
 * Delivery (panel → Opciones de menú): `public.branches.delivery_settings` (JSONB por sucursal): `enabled`,
 * `pricePerKm`, `baseFee`, `minFee`, `maxFee`, `maxDeliveryKm`, `freeDeliveryFromSubtotal`, `minOrderSubtotal`, `customerNotes`.
 * El menú público recibe el mismo objeto vía RPC `get_public_branches` (columna `delivery_settings` en el SELECT).
 * - Claves de rol habituales: `admin`, `ceo`, `cashier`, `owner` (si falta un rol, se usan los defaults de código).
 * - Cada string del array debe ser un id de `TENANT_ADMIN_TAB_IDS`. El SaaS y esta app deben usar **los mismos ids**.
 *
 * Ejemplo:
 * `"roleNavPermissions": { "admin": ["orders","caja","products"], "ceo": ["orders","caja"], "cashier": ["orders","caja"] }`
 *
 * Al agregar una pestaña nueva:
 * 1. Añadirla en TENANT_ADMIN_TAB_OPTIONS y en DEFAULT_ROLE_NAV_PERMISSIONS si aplica.
 * 2. AdminSidebar + Admin.jsx.
 * 3. Actualizar el gestor del SaaS para mostrar/guardar el mismo `id`.
 *    Incluir también el id en `panelAccess` / configuración de tema si la empresa debe ver la pestaña (`coupons`, etc.).
 */

/** Roles de panel que suelen configurarse en theme_config (referencia para el SaaS). */
export const TENANT_ADMIN_PRIVILEGED_NAV_ROLES = ["owner", "admin", "ceo"] as const;

export const TENANT_ADMIN_TAB_OPTIONS = [
	{ id: "orders", label: "Cocina / Pedidos" },
	{ id: "caja", label: "Caja" },
	{ id: "analytics", label: "Reportes" },
	{ id: "categories", label: "Categorías" },
	/** Catálogo vendible (platos); no confundir con la pestaña `inventory` (insumos / stock). */
	{ id: "products", label: "Menú y carta" },
	{ id: "inventory", label: "Inventario (insumos)" },
	{ id: "menu_beverages", label: "Bebidas" },
	{ id: "menu_extras", label: "Extras" },
	{ id: "menu_options", label: "Opciones de sucursal" },
	{ id: "clients", label: "Clientes" },
	{ id: "coupons", label: "Cupones" },
] as const;

export const TENANT_ADMIN_TAB_IDS = TENANT_ADMIN_TAB_OPTIONS.map((t) => t.id);

export type TenantAdminTabId = (typeof TENANT_ADMIN_TAB_OPTIONS)[number]["id"];

const ALL_TABS = TENANT_ADMIN_TAB_IDS as unknown as string[];

export const DEFAULT_ROLE_NAV_PERMISSIONS: Record<string, string[]> = {
	owner: [...ALL_TABS],
	admin: [...ALL_TABS],
	ceo: [...ALL_TABS],
	cashier: ["orders", "caja"],
};

export function getDefaultRoleNavPermissions(): Record<string, string[]> {
	return { ...DEFAULT_ROLE_NAV_PERMISSIONS };
}

/** Alinea el rol de `public.users` con las claves de permisos del panel. */
export function normalizeTenantPanelUserRole(role: string | null | undefined): string | null {
	const r = String(role ?? "").trim().toLowerCase();
	if (!r) return null;
	return r === "staff" ? "cashier" : r;
}

/** Ids antiguos que pudo guardar otra app; se mapean al id del panel. */
const STORED_TAB_ID_ALIASES: Record<string, string> = {
	admin_menu_options: "menu_options",
	/** SaaS o formularios que usan etiqueta corta en lugar del id canónico */
	bebidas: "menu_beverages",
	beverages: "menu_beverages",
	cart_beverages: "menu_beverages",
	/** Nombre usado por el SaaS en `roleNavPermissions` antes de alinear ids con el panel */
	global_extras: "menu_extras",
	extras: "menu_extras",
	cart_extras: "menu_extras",
};

/** Normaliza un id leído de configuración legacy antes de validar contra TENANT_ADMIN_TAB_IDS. */
export function normalizeStoredNavTabId(tabId: string): string {
	const t = String(tabId ?? "").trim();
	if (!t) return t;
	return STORED_TAB_ID_ALIASES[t] ?? t;
}

/** Labels base (español) por id + overrides desde `theme_config.tabLabels`. */
export function buildResolvedTabLabels(tabLabelsFromTheme?: Record<string, string> | null): Record<string, string> {
	const base: Record<string, string> = {};
	for (const t of TENANT_ADMIN_TAB_OPTIONS) {
		base[t.id] = t.label;
	}
	if (tabLabelsFromTheme && typeof tabLabelsFromTheme === "object") {
		for (const [k, v] of Object.entries(tabLabelsFromTheme)) {
			if (typeof v === "string" && v.trim()) {
				base[String(k).trim()] = v.trim();
			}
		}
	}
	return base;
}

/** Pestañas por defecto para formulario de cajero (misma fuente que permisos por defecto). */
export function getCashierDefaultAllowedTabIds(): string[] {
	return [...DEFAULT_ROLE_NAV_PERMISSIONS.cashier];
}
