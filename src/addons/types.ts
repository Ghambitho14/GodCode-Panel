import type { ComponentType, LazyExoticComponent } from "react";

/**
 * Los datos del extra (`src/addons/<modulo>/manifest.json`). Además de usarse en el panel, salen
 * en `/addons-manifest.json` para que el super admin de GodCode los liste solos.
 */
export type AddonManifest = {
	/** Igual al nombre de la carpeta y a «Módulo del panel» del extra en el super admin. */
	id: string;
	/** Nombre en el menú si el extra no trae uno (normalmente manda el nombre del extra). */
	label: string;
	description?: string;
	/** Dónde va en el menú: suelto, dentro de Ventas o dentro de Menú. */
	navGroup?: "root" | "sales" | "menu";
	/** Roles que lo ven. Sin definir: admin y ceo. */
	allowedRoles?: string[];
};

/**
 * Lo que exporta cada extra a medida (`src/addons/<modulo>/index.tsx`, export default): el
 * manifiesto más la pantalla. Ver `src/addons/README.md`.
 */
export type AddonModule = AddonManifest & {
	/** La pantalla. Usa `lazy(() => import("./Screen"))` para no cargarla si no se abre. */
	Component: LazyExoticComponent<ComponentType> | ComponentType;
};
