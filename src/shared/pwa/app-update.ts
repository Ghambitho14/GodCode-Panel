import { registerSW } from "virtual:pwa-register";

/**
 * Versiones nuevas del panel sin Ctrl+F5.
 *
 * El service worker guarda la app entera y la sirve aunque ya haya un deploy
 * nuevo: la versión nueva se instala en segundo plano y la página abierta sigue
 * con el JS viejo hasta la siguiente carga. En una tablet de caja, con la PWA
 * instalada y sin Ctrl+F5 a mano, eso podía durar el día entero.
 *
 * - Se busca versión nueva cada 15 minutos y al volver a la pestaña: una SPA
 *   que no navega nunca le da al navegador ocasión de revisar sw.js.
 * - Cuando la nueva queda activa se avisa con un botón. No se recarga a la
 *   fuerza: podría borrarle al cajero un cobro a medio escribir.
 * - Si el panel está en segundo plano y no hay nada abierto, se recarga solo.
 * - Si una sección no carga porque sus archivos ya no existen en el servidor
 *   (eran del deploy anterior), se recarga para traer la versión nueva.
 */

const CHECK_INTERVAL_MS = 15 * 60_000;
const PRELOAD_RELOAD_KEY = "gc:pwa-preload-reload-at";
const PRELOAD_RELOAD_COOLDOWN_MS = 30_000;

type Listener = () => void;

const listeners = new Set<Listener>();
let updateReady = false;
let started = false;

export function subscribeAppUpdate(listener: Listener) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function isAppUpdateReady() {
	return updateReady;
}

export function applyAppUpdate() {
	window.location.reload();
}

/** Recargar sin que nadie pierda nada: pestaña oculta, sin diálogos ni un campo con foco. */
export function canReloadUnnoticed(doc: Document = document) {
	if (doc.visibilityState !== "hidden") return false;
	if (doc.querySelector('[aria-modal="true"], [role="dialog"], [role="alertdialog"]')) return false;
	const active = doc.activeElement;
	if (
		active instanceof HTMLElement
		&& (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName))
	) {
		return false;
	}
	return true;
}

export function markAppUpdateReady() {
	if (updateReady) return;
	updateReady = true;
	listeners.forEach((listener) => listener());
	if (canReloadUnnoticed()) applyAppUpdate();
}

function reloadAfterFailedChunk(event: Event) {
	let lastReloadAt = 0;
	try {
		lastReloadAt = Number(sessionStorage.getItem(PRELOAD_RELOAD_KEY)) || 0;
	} catch {
		// Sin sessionStorage: el tope por tiempo no aplica, pero recargar sigue siendo lo correcto.
	}
	// Si el archivo sigue sin cargar tras recargar (sin red), no entrar en bucle.
	if (Date.now() - lastReloadAt < PRELOAD_RELOAD_COOLDOWN_MS) return;
	try {
		sessionStorage.setItem(PRELOAD_RELOAD_KEY, String(Date.now()));
	} catch {
		// Ídem.
	}
	event.preventDefault();
	applyAppUpdate();
}

export function startAppUpdates() {
	if (started || typeof window === "undefined") return;
	started = true;

	window.addEventListener("vite:preloadError", reloadAfterFailedChunk);
	if (!("serviceWorker" in navigator)) return;

	document.addEventListener("visibilitychange", () => {
		if (updateReady && canReloadUnnoticed()) applyAppUpdate();
	});

	registerSW({
		immediate: true,
		onNeedReload: markAppUpdateReady,
		onRegisteredSW(_swUrl, registration) {
			if (!registration) return;
			const checkForUpdate = () => {
				if (navigator.onLine === false || registration.installing) return;
				registration.update().catch(() => {
					// Sin red o servidor caído: se reintenta en la próxima revisión.
				});
			};
			window.setInterval(checkForUpdate, CHECK_INTERVAL_MS);
			document.addEventListener("visibilitychange", () => {
				if (document.visibilityState === "visible") checkForUpdate();
			});
		},
	});
}
