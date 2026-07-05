import type { DatabaseCompanyTheme } from "@/shared/types/company-theme";

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
 * Si `theme_config` es null o le faltan campos, cada token cae a su default
 * y la UI sigue viendose como hoy (no rompe nada).
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

const FIXED_PALETTE = {
	primary: "#2563eb",
	secondary: "#3b82f6",
	price: "#ef4444",
	discount: "#22c55e",
	hover: "#1d4ed8",
	background: "#f8fafc",
};

export function buildTenantThemeCss(_company: CompanyRow | null): string {
	const primaryColor = FIXED_PALETTE.primary;
	const secondaryColor = FIXED_PALETTE.secondary;
	const priceColor = FIXED_PALETTE.price;
	const discountColor = FIXED_PALETTE.discount;
	const hoverColor = FIXED_PALETTE.hover;
	const accentShadow = toRgba(primaryColor, 0.3, "rgba(37, 99, 235, 0.3)");
	const accentShadowStrong = toRgba(primaryColor, 0.5, "rgba(37, 99, 235, 0.5)");
	const cardBorder = toRgba(primaryColor, 0.18, "rgba(37, 99, 235, 0.18)");
	const backgroundColor = FIXED_PALETTE.background;
	return `.tenant-theme-vars,.manual-order-portal-scope{--tenant-primary:${sanitizeCssValue(primaryColor)};--accent-primary:${sanitizeCssValue(primaryColor)};--accent-secondary:${sanitizeCssValue(secondaryColor)};--price-color:${sanitizeCssValue(priceColor)};--discount-color:${sanitizeCssValue(discountColor)};--accent-hover:${sanitizeCssValue(hoverColor)};--accent-shadow:${sanitizeCssValue(accentShadow)};--accent-shadow-strong:${sanitizeCssValue(accentShadowStrong)};--card-border:${sanitizeCssValue(cardBorder)};--bg-primary:${sanitizeCssValue(backgroundColor)};--tenant-bg-image:none;}`;
}
