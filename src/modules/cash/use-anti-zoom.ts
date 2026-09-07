import { useEffect } from "react";

/**
 * Viewport móvil. NO lleva `maximum-scale=1`: impedia ampliar la pantalla y es
 * una violacion de WCAG 1.4.4. El zoom automatico de iOS al enfocar un input lo
 * dispara un font-size menor de 16px, no la falta de ese candado, asi que la
 * causa se ataca en CSS (ver `.form-input` a ancho de telefono).
 */
export const MOBILE_VIEWPORT_META =
	"width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content";

/**
 * Antes escribia --app-vh/--app-vw/--app-vv-offset-top en <html> en cada evento
 * de visualViewport. Ninguna hoja de estilo ni componente leia esas variables,
 * asi que solo forzaba recalculo de estilos mientras se abria el teclado.
 *
 * Se mantiene exportada y vacia porque app-shell la engancha al scroll del
 * shell; el dia que algo necesite la altura real, este es su sitio.
 */
export function syncMobileViewportVars() {
	/* sin efecto: ver comentario */
}

/**
 * Ajustes de viewport en movil.
 *
 * Lo que este hook hacia antes y se ha retirado, porque cada pieza causaba un
 * problema propio:
 *
 * - `gesturestart` con preventDefault bloqueaba el pellizco para ampliar en
 *   iOS Safari, y `wheel` con ctrl/meta y `keydown` con ctrl +/-/0 hacian lo
 *   mismo en escritorio. Entre los tres anulaban el zoom por completo: WCAG
 *   1.4.4 (AA). Quitar `maximum-scale=1` del meta no servia de nada mientras
 *   estos siguieran ahi.
 *
 * - `window.scrollTo(0, 0)` al salir de cualquier campo de formulario. En una
 *   pagina desplazada, tocar fuera de un input saltaba de golpe al principio.
 *   Tambien se disparaba al girar el dispositivo.
 *
 * - Reaplicar el meta viewport por JS: ahora es identico al de index.html, asi
 *   que era una escritura sin efecto repetida en cada evento.
 *
 * Queda como punto de enganche por si vuelve a hacer falta trabajo de viewport.
 */
export function useAntiZoom() {
	useEffect(() => {
		/* sin efectos: ver comentario del modulo */
	}, []);
}
