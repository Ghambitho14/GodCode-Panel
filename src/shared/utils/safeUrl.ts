/**
 * Saneo de URLs que vienen de datos no confiables antes de renderizarlas.
 *
 * El caso que lo motiva: `orders.delivery_address.maps_url` lo escribe el
 * storefront, y el panel del cajero lo pinta en un `href`. Un `javascript:…` ahí
 * ejecuta código en una sesión privilegiada — con el enlace rotulado "ver en
 * mapa", el clic es parte del flujo normal de trabajo.
 *
 * Falla cerrado: ante cualquier duda devuelve `null`. Los sitios que lo consumen
 * ya tienen un guard (`{url ? … : null}`), así que un valor inválido hace
 * desaparecer el enlace en vez de renderizar algo peligroso.
 */

/** Protocolos que se consideran seguros para un enlace de navegación. */
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Devuelve la URL normalizada si es `http(s)`, o `null` en cualquier otro caso.
 *
 * Se parsea **sin base** a propósito: una ruta relativa (`/algo`, `//evil.com`)
 * no debe resolverse contra el origen del panel, porque el valor no es nuestro.
 *
 * Se devuelve `parsed.href` y no la cadena original: la forma normalizada del
 * parser neutraliza de paso los trucos con espacios de control y con mayúsculas
 * en el esquema (`JaVaScRiPt:`).
 *
 * @param value Valor crudo, de cualquier tipo — típicamente de la base de datos.
 * @returns La URL segura, o `null` si no lo es.
 */
export function toSafeHttpUrl(value: unknown): string | null {
	if (typeof value !== "string") return null;

	const trimmed = value.trim();
	if (!trimmed) return null;

	let parsed: URL;
	try {
		parsed = new URL(trimmed);
	} catch {
		return null;
	}

	if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return null;

	return parsed.href;
}
