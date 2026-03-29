export type DatabaseCompanyTheme = {
	displayName?: string;
	logoUrl?: string | null;
	primaryColor?: string;
	secondaryColor?: string;
	priceColor?: string;
	discountColor?: string;
	hoverColor?: string;
	backgroundColor?: string;
	backgroundImageUrl?: string | null;
	roleNavPermissions?: Record<string, string[]>;
	/** Etiquetas por id de pestaña (`TENANT_ADMIN_TAB_IDS` o claves personalizadas). */
	tabLabels?: Record<string, string>;
	/** Whitelist: ids `tab_id` de `saas_admin_modules` visibles para esta empresa. Omitir = todos los activos. */
	enabledAdminModuleTabIds?: string[];
	enableSupportTab?: boolean;
	adminShortcutsEnabled?: boolean;
	/** Bloque menú público / carrusel (ver API tenant-menu-carousel). */
	menuCarousel?: unknown;
	[key: string]: unknown;
};