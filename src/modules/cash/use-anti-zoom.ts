import { useEffect } from "react";

/** Viewport fijo en móvil: evita zoom al enfocar inputs y el “zoom pegado” al cerrar teclado en iOS. */
export const MOBILE_VIEWPORT_META =
	"width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover, interactive-widget=resizes-content";

function applyViewportMeta() {
	const meta = document.querySelector('meta[name="viewport"]');
	if (meta) meta.setAttribute("content", MOBILE_VIEWPORT_META);
}

function isFormField(el: EventTarget | null) {
	return el instanceof HTMLElement && el.matches("input, textarea, select");
}

/** Sincroniza altura/ancho real (visual viewport) para layout y barra URL dinámica del navegador. */
export function syncMobileViewportVars() {
	const vv = window.visualViewport;
	const height = vv?.height ?? window.innerHeight;
	const width = vv?.width ?? window.innerWidth;
	const offsetTop = vv?.offsetTop ?? 0;

	document.documentElement.style.setProperty("--app-vh", `${height}px`);
	document.documentElement.style.setProperty("--app-vw", `${width}px`);
	document.documentElement.style.setProperty("--app-vv-offset-top", `${offsetTop}px`);
}

function nudgeWindowScroll() {
	// Ayuda a que iOS/Chrome recalculen escala y barra del navegador tras el teclado.
	window.scrollTo(0, 0);
}

function recoverViewportAfterKeyboard() {
	applyViewportMeta();
	syncMobileViewportVars();
	nudgeWindowScroll();
	requestAnimationFrame(() => {
		nudgeWindowScroll();
		syncMobileViewportVars();
	});
}

/**
 * Evita zoom accidental, resetea viewport al cerrar teclado y expone --app-vh/--app-vw
 * para que el shell use la altura real del dispositivo (con/sin barra URL).
 */
export function useAntiZoom() {
	useEffect(() => {
		applyViewportMeta();
		syncMobileViewportVars();

		const handleGestureStart = (event: Event) => event.preventDefault();
		const handleWheel = (event: WheelEvent) => {
			if (event.ctrlKey || event.metaKey) event.preventDefault();
		};
		const handleKeydown = (event: KeyboardEvent) => {
			if ((event.ctrlKey || event.metaKey) && ["+", "-", "=", "0"].includes(event.key)) {
				event.preventDefault();
			}
		};

		const onViewportChange = () => syncMobileViewportVars();
		const vv = window.visualViewport;

		const onFocusOut = (event: FocusEvent) => {
			if (!isFormField(event.target)) return;
			recoverViewportAfterKeyboard();
		};

		const onOrientationChange = () => {
			window.setTimeout(recoverViewportAfterKeyboard, 120);
		};

		document.addEventListener("gesturestart", handleGestureStart);
		document.addEventListener("wheel", handleWheel, { passive: false });
		document.addEventListener("keydown", handleKeydown);
		document.addEventListener("focusout", onFocusOut);
		window.addEventListener("resize", onViewportChange);
		window.addEventListener("orientationchange", onOrientationChange);

		if (vv) {
			vv.addEventListener("resize", onViewportChange);
			vv.addEventListener("scroll", onViewportChange);
		}

		return () => {
			document.removeEventListener("gesturestart", handleGestureStart);
			document.removeEventListener("wheel", handleWheel as EventListener);
			document.removeEventListener("keydown", handleKeydown);
			document.removeEventListener("focusout", onFocusOut);
			window.removeEventListener("resize", onViewportChange);
			window.removeEventListener("orientationchange", onOrientationChange);
			if (vv) {
				vv.removeEventListener("resize", onViewportChange);
				vv.removeEventListener("scroll", onViewportChange);
			}
		};
	}, []);
}
