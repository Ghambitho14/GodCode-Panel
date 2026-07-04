const STOREFRONT_ORIGIN = (
	import.meta.env.VITE_PUBLIC_STOREFRONT_ORIGIN
	|| import.meta.env.VITE_STOREFRONT_ORIGIN
	|| "https://www.godcode.me"
).replace(/\/+$/, "");

function readUrlCandidate(value: unknown): string | null {
	const trimmed = String(value ?? "").trim();
	if (!trimmed) return null;
	try {
		const parsed = new URL(trimmed);
		if (parsed.protocol === "http:" || parsed.protocol === "https:") {
			return parsed.href;
		}
	} catch {
		/* path relativo u otro formato */
	}
	if (trimmed.startsWith("/")) {
		return `${STOREFRONT_ORIGIN}${trimmed}`;
	}
	return trimmed;
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

function buildUrlFromSlug(slug: string): string {
	const encoded = encodeURIComponent(slug);
	if (STOREFRONT_ORIGIN.includes("{slug}")) {
		return STOREFRONT_ORIGIN.replace("{slug}", encoded);
	}
	try {
		const origin = new URL(STOREFRONT_ORIGIN);
		if (origin.hostname === "godcode.me" || origin.hostname === "www.godcode.me") {
			return `https://${slug}.godcode.me`;
		}
	} catch {
		/* fallback abajo */
	}
	return `${STOREFRONT_ORIGIN}/${encoded}`;
}

export function resolveStorefrontMenuUrl(options: {
	explicitUrl?: string | null;
	publicSlug?: string | null;
	integrationSettings?: unknown;
} = {}): string | null {
	const explicit = readUrlCandidate(options.explicitUrl);
	if (explicit) return explicit;

	const fromIntegration = extractFromIntegration(options.integrationSettings);
	if (fromIntegration) return fromIntegration;

	const slug = String(
		options.publicSlug
		|| import.meta.env.VITE_PUBLIC_COMPANY_SLUG
		|| import.meta.env.VITE_COMPANY_SLUG
		|| "",
	).trim();
	if (slug) return buildUrlFromSlug(slug);

	return null;
}
