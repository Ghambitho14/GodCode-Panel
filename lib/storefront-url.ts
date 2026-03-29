/**
 * URL del menú público del negocio (app monolito), usando subdominio multi-tenant.
 */
export function getStorefrontMenuUrl(publicSlug: string | null | undefined): string | null {
	const slug = String(publicSlug ?? "").trim();
	if (!slug) return null;
	const protocol = (process.env.NEXT_PUBLIC_TENANT_PROTOCOL ?? "https").replace(/\/$/, "");
	const rawHost = process.env.NEXT_PUBLIC_TENANT_BASE_DOMAIN ?? "";
	const host = rawHost.replace(/^https?:\/\//i, "").replace(/\/$/, "").split("/")[0] ?? "";
	if (!host) return null;
	return `${protocol}://${slug}.${host}/menu`;
}