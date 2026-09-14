import { toSafeHttpUrl } from "@/shared/utils/safeUrl";

const TENANT_PROTOCOL = (
	import.meta.env.VITE_PUBLIC_TENANT_PROTOCOL
	|| import.meta.env.VITE_TENANT_PROTOCOL
	|| import.meta.env.NEXT_PUBLIC_TENANT_PROTOCOL
	|| "https"
).replace(/:$/, "");

const TENANT_BASE_DOMAIN = (
	import.meta.env.VITE_PUBLIC_TENANT_BASE_DOMAIN
	|| import.meta.env.VITE_TENANT_BASE_DOMAIN
	|| import.meta.env.NEXT_PUBLIC_TENANT_BASE_DOMAIN
	|| "www.godcode.me"
).replace(/\/+$/, "");

const STOREFRONT_ORIGIN = (
	import.meta.env.VITE_PUBLIC_STOREFRONT_ORIGIN
	|| import.meta.env.VITE_STOREFRONT_ORIGIN
	|| `${TENANT_PROTOCOL}://${TENANT_BASE_DOMAIN}`
).replace(/\/+$/, "");

function readUrlCandidate(value: unknown): string | null {
	const trimmed = String(value ?? "").trim();
	if (!trimmed) return null;

	const absolute = toSafeHttpUrl(trimmed);
	if (absolute) return absolute;

	// Ruta relativa: se resuelve contra el storefront a propósito — a diferencia de
	// `maps_url`, aquí sí es un valor nuestro y `/mi-local` es una forma legítima
	// de configurarlo. El resultado vuelve a pasar por el saneo porque la base
	// también sale de configuración.
	if (trimmed.startsWith("/")) {
		return toSafeHttpUrl(`${STOREFRONT_ORIGIN}${trimmed}`);
	}

	// Falla cerrado: sin esto un `javascript:…` volvía intacto y terminaba en el
	// href del enlace al menú público.
	return null;
}

function extractFromIntegration(raw: unknown): string | null {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
	const root = raw as Record<string, unknown>;
	const menu = root.menu;
	if (menu && typeof menu === "object" && !Array.isArray(menu)) {
		const m = menu as Record<string, unknown>;
		for (const key of ["publicUrl", "public_url", "storefrontUrl", "storefront_url", "url"]) {
			const resolved = readUrlCandidate(m[key]);
			if (resolved) return resolved;
		}
	}
	for (const key of ["storefrontUrl", "storefront_url", "publicMenuUrl", "public_menu_url"]) {
		const resolved = readUrlCandidate(root[key]);
		if (resolved) return resolved;
	}
	return null;
}

function extractCustomDomain(raw: unknown): string | null {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
	const root = raw as Record<string, unknown>;
	for (const key of ["customDomain", "custom_domain", "domain", "publicDomain", "public_domain"]) {
		const resolved = readCustomDomain(root[key]);
		if (resolved) return resolved;
	}
	return null;
}

function buildUrlFromSlug(slug: string): string {
	const normalized = slug.trim().toLowerCase().replace(/\s+/g, "-");
	const encoded = encodeURIComponent(normalized);
	if (STOREFRONT_ORIGIN.includes("{slug}")) {
		return STOREFRONT_ORIGIN.replace("{slug}", encoded);
	}
	return `${STOREFRONT_ORIGIN}/${encoded}`;
}

function readCustomDomain(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (!trimmed) return null;

	// Un dominio se escribe normalmente sin esquema (`mitienda.com`), así que se
	// asume `https://`. Pero solo cuando de verdad no hay esquema: prefijar algo
	// que ya trae uno (`javascript:`, `httpx:`) produce una URL sin sentido en vez
	// de un rechazo, y `startsWith("http")` dejaba pasar `httpx:` tal cual.
	// `(?!\d)` para no confundir un puerto (`mitienda.com:8080`) con un esquema.
	const hasScheme = /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(trimmed);
	if (hasScheme && !/^https?:\/\//i.test(trimmed)) return null;

	const candidate = hasScheme ? trimmed : `https://${trimmed}`;
	const safe = toSafeHttpUrl(candidate);
	if (!safe) return null;

	return safe.replace(/\/+$/, "");
}

export function resolveStorefrontMenuUrl(options: {
	explicitUrl?: string | null;
	publicSlug?: string | null;
	customDomain?: string | null;
	integrationSettings?: unknown;
} = {}): string | null {
	const explicit = readUrlCandidate(options.explicitUrl);
	if (explicit) return explicit;

	const fromIntegration = extractFromIntegration(options.integrationSettings);
	if (fromIntegration) return fromIntegration;

	const customDomain = readCustomDomain(options.customDomain) || extractCustomDomain(options.integrationSettings);
	if (customDomain) return customDomain;

	const slug = String(
		options.publicSlug
		|| import.meta.env.VITE_PUBLIC_COMPANY_SLUG
		|| import.meta.env.VITE_COMPANY_SLUG
		|| "",
	).trim();
	if (slug) return buildUrlFromSlug(slug);

	return null;
}
