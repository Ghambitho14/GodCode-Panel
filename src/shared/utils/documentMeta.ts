import { DEFAULT_FAVICON_HREF, getSafeFaviconUrl } from "./documentFavicon";

export const DEFAULT_DOCUMENT_TITLE = "GodCode Caja — Acceso al local";
export const DEFAULT_DOCUMENT_DESCRIPTION =
	"Acceso de caja y operación diaria del local con GodCode.";

type DocumentMetaInput = {
	title: string;
	description: string;
	imageUrl?: string | null;
};

function resolveImageUrl(imageUrl: string | null | undefined): string {
	if (!imageUrl || imageUrl === DEFAULT_FAVICON_HREF) return DEFAULT_FAVICON_HREF;
	if (imageUrl.startsWith("/")) return imageUrl;
	const safe = getSafeFaviconUrl(imageUrl);
	return safe ?? DEFAULT_FAVICON_HREF;
}

function upsertMetaByName(name: string, content: string): void {
	let meta = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
	if (!meta) {
		meta = document.createElement("meta");
		meta.setAttribute("name", name);
		document.head.appendChild(meta);
	}
	meta.setAttribute("content", content);
}

function upsertMetaByProperty(property: string, content: string): void {
	let meta = document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
	if (!meta) {
		meta = document.createElement("meta");
		meta.setAttribute("property", property);
		document.head.appendChild(meta);
	}
	meta.setAttribute("content", content);
}

/**
 * Actualiza título, descripción y tags OG/Twitter del documento.
 */
export function setDocumentMeta({ title, description, imageUrl }: DocumentMetaInput): void {
	if (typeof document === "undefined") return;

	const resolvedTitle = title.trim() || DEFAULT_DOCUMENT_TITLE;
	const resolvedDescription = description.trim() || DEFAULT_DOCUMENT_DESCRIPTION;
	const resolvedImage = resolveImageUrl(imageUrl);

	document.title = resolvedTitle;
	upsertMetaByName("description", resolvedDescription);
	upsertMetaByProperty("og:title", resolvedTitle);
	upsertMetaByProperty("og:description", resolvedDescription);
	upsertMetaByProperty("og:image", resolvedImage);
	upsertMetaByName("twitter:title", resolvedTitle);
	upsertMetaByName("twitter:description", resolvedDescription);
	upsertMetaByName("twitter:image", resolvedImage);
}

/**
 * Restaura metadatos por defecto del login (valores alineados a `index.html`).
 */
export function resetDocumentMeta(): void {
	setDocumentMeta({
		title: DEFAULT_DOCUMENT_TITLE,
		description: DEFAULT_DOCUMENT_DESCRIPTION,
		imageUrl: DEFAULT_FAVICON_HREF,
	});
}
