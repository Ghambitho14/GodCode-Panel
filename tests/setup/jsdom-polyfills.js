/**
 * Huecos de jsdom que el código de producción sí encuentra en un navegador real.
 *
 * jsdom no implementa el scroll programático: `Element.prototype.scrollTo` y
 * `scrollIntoView` no existen, así que cualquier componente que centre una
 * categoría o desplace un carrusel revienta con "scrollTo is not a function"
 * aunque el comportamiento sea correcto en el navegador.
 *
 * Los definimos como no-ops que sí actualizan `scrollTop`/`scrollLeft` cuando
 * se les pasan, para que un test pueda seguir asertando sobre la posición.
 */

function applyScrollOptions(element, options) {
	if (!options || typeof options !== "object") return;
	if (typeof options.top === "number") element.scrollTop = options.top;
	if (typeof options.left === "number") element.scrollLeft = options.left;
}

if (typeof Element !== "undefined") {
	if (typeof Element.prototype.scrollTo !== "function") {
		Element.prototype.scrollTo = function scrollTo(optionsOrX, maybeY) {
			if (typeof optionsOrX === "number") {
				this.scrollLeft = optionsOrX;
				if (typeof maybeY === "number") this.scrollTop = maybeY;
				return;
			}
			applyScrollOptions(this, optionsOrX);
		};
	}

	if (typeof Element.prototype.scrollIntoView !== "function") {
		Element.prototype.scrollIntoView = function scrollIntoView() {};
	}
}

if (typeof window !== "undefined" && typeof window.scrollTo !== "function") {
	window.scrollTo = function scrollTo() {};
}
