import { useEffect, useRef } from 'react';

const STATE_KEY = 'gcModal';

/**
 * Integra una ventana (modal, hoja, panel) con el historial del navegador:
 * al abrirse mete una entrada, así el gesto o botón "atrás" del teléfono la
 * cierra en vez de salir del panel. Si se cierra desde la propia ventana, la
 * entrada se quita sola.
 *
 * Si `onBack` no cierra la ventana (p. ej. pregunta "¿cerrar sin guardar?" y
 * el usuario se arrepiente), la entrada se vuelve a poner para que el
 * siguiente "atrás" vuelva a preguntar.
 *
 * @param {boolean} open
 * @param {(() => void) | undefined} onBack
 */
export function useHistoryBack(open, onBack) {
	const onBackRef = useRef(onBack);
	onBackRef.current = onBack;
	/** Entrada cuyo `history.back()` está por ejecutarse (ver cleanup). */
	const pendingRemovalRef = useRef(null);

	useEffect(() => {
		if (!open || typeof window === 'undefined' || !window.history?.pushState) return undefined;
		let entry;
		const pending = pendingRemovalRef.current;
		if (pending) {
			// StrictMode (desarrollo) desmonta y vuelve a montar al instante: se reutiliza la
			// entrada; si se quitara y se pusiera otra, el back() tardío cerraría la ventana.
			pending.cancelled = true;
			pendingRemovalRef.current = null;
			entry = pending.entry;
		} else {
			const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
			entry = { [STATE_KEY]: token };
			try {
				window.history.pushState(entry, '');
			} catch {
				return undefined;
			}
		}
		const token = entry[STATE_KEY];
		const isOurs = () => window.history.state?.[STATE_KEY] === token;
		const onPop = () => {
			if (isOurs()) return;
			// Volver a poner la entrada: si la ventana se cierra, el cleanup la quita.
			try {
				window.history.pushState(entry, '');
			} catch {}
			onBackRef.current?.();
		};
		window.addEventListener('popstate', onPop);
		return () => {
			window.removeEventListener('popstate', onPop);
			const removal = { entry, cancelled: false };
			pendingRemovalRef.current = removal;
			queueMicrotask(() => {
				if (removal.cancelled) return;
				if (pendingRemovalRef.current === removal) pendingRemovalRef.current = null;
				if (isOurs()) window.history.back();
			});
		};
	}, [open]);
}

export default useHistoryBack;
