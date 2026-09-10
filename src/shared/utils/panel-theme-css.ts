import type { DatabaseCompanyTheme } from "@/shared/types/company-theme";
import { SHARED_THEME_CSS_VARS } from "@/shared/utils/theme-css-var-contract";

/**
 * Construye un bloque CSS con variables del tenant (`.tenant-theme-vars { ... }`).
 * Portado de panel-viejo/lib/panel-theme-css.ts (mismo contrato y mismos fallbacks).
 *
 * Uso esperado:
 *   <style>{buildTenantThemeCss({ theme_config })}</style>
 *   <div className="tenant-theme-vars"> ... </div>
 *
 * También aplica a `.manual-order-portal-scope` (modal portaleado en body).
 *
 * Los nombres de los tokens salen de `theme-css-var-contract.ts`, que es el mismo
 * fichero en el Portal: así un renombrado no puede desincronizar los dos repos en
 * silencio. Los valores sí son propios del Panel — ver `FIXED_PALETTE`.
 */

const toRgba = (hex: string, alpha: number, fallback: string) => {
	if (!hex) return fallback;
	const normalized = hex.trim();
	const shortMatch = /^#([a-fA-F0-9]{3})$/.exec(normalized);
	const longMatch = /^#([a-fA-F0-9]{6})$/.exec(normalized);
	const hexValue = shortMatch
		? shortMatch[1]
				.split("")
				.map((char) => char + char)
				.join("")
		: longMatch
			? longMatch[1]
			: null;
	if (!hexValue) return fallback;
	const r = Number.parseInt(hexValue.slice(0, 2), 16);
	const g = Number.parseInt(hexValue.slice(2, 4), 16);
	const b = Number.parseInt(hexValue.slice(4, 6), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const sanitizeCssValue = (value: string) => value.replace(/<|>|"|'|`/g, "").trim();

type CompanyRow = {
	theme_config?: DatabaseCompanyTheme | null;
};

/**
 * El Panel POS no se tematiza por tenant: es una herramienta interna de caja y
 * usa siempre la misma paleta. El parámetro `theme_config` se acepta para que la
 * firma case con la del storefront, pero no se lee.
 */
const FIXED_PALETTE = {
	primary: "#2563eb",
	secondary: "#3b82f6",
	price: "#ef4444",
	discount: "#22c55e",
	hover: "#1d4ed8",
	background: "#f8fafc",
};

/** Valor de cada token compartido. Las claves son el contrato, no texto libre. */
export function buildTenantThemeCssVarEntries(
	_company: CompanyRow | null,
): Array<[(typeof SHARED_THEME_CSS_VARS)[number], string]> {
	const primaryColor = FIXED_PALETTE.primary;
	return [
		["--tenant-primary", primaryColor],
		["--accent-primary", primaryColor],
		["--accent-secondary", FIXED_PALETTE.secondary],
		["--price-color", FIXED_PALETTE.price],
		["--discount-color", FIXED_PALETTE.discount],
		["--accent-hover", FIXED_PALETTE.hover],
		["--accent-shadow", toRgba(primaryColor, 0.3, "rgba(37, 99, 235, 0.3)")],
		["--accent-shadow-strong", toRgba(primaryColor, 0.5, "rgba(37, 99, 235, 0.5)")],
		["--card-border", toRgba(primaryColor, 0.18, "rgba(37, 99, 235, 0.18)")],
		["--bg-primary", FIXED_PALETTE.background],
		["--tenant-bg-image", "none"],
	];
}

export function buildTenantThemeCss(company: CompanyRow | null): string {
	const declarations = buildTenantThemeCssVarEntries(company)
		.map(([name, value]) => `${name}:${sanitizeCssValue(value)};`)
		.join("");
	return `.tenant-theme-vars,.manual-order-portal-scope{${declarations}}`;
}
