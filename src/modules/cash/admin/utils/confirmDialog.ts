/**
 * Confirmaciones y avisos del panel como promesas, para reemplazar
 * `window.confirm` / `window.alert` sin cambiar la forma de los handlers:
 *
 *   if (!(await confirmDialog({ title: 'Cancelar pedido', text: '…', danger: true }))) return;
 *   await alertDialog({ title: 'Imagen muy pesada', text: 'Máximo 20 MB.' });
 *
 * La ventana la dibuja `AdminConfirmDialogHost` (montado en Admin.jsx). Si no
 * hay host (pruebas, pantallas fuera del panel) se usa el diálogo del navegador,
 * así el flujo nunca se queda colgado.
 */

export interface ConfirmDialogOptions {
	title?: string;
	text?: string;
	confirmLabel?: string;
	cancelLabel?: string;
	/** Acción destructiva: botón rojo y el foco arranca en Cancelar. */
	danger?: boolean;
}

export interface AlertDialogOptions {
	title?: string;
	text?: string;
	confirmLabel?: string;
}

export interface DialogRequest extends ConfirmDialogOptions {
	kind: "confirm" | "alert";
	resolve: (value: boolean) => void;
}

let current: DialogRequest | null = null;
const listeners = new Set<() => void>();

function emit() {
	for (const listener of listeners) listener();
}

function normalize<T extends object>(options: string | T | null | undefined): T {
	if (typeof options === "string") return { text: options } as T;
	return options && typeof options === "object" ? options : ({} as T);
}

function fallbackMessage(opts: { title?: string; text?: string }): string {
	return [opts.title, opts.text].filter(Boolean).join("\n\n");
}

/** Para `useSyncExternalStore` del host. */
export function subscribeConfirmDialog(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function getConfirmDialogState(): DialogRequest | null {
	return current;
}

/** Cierra el diálogo abierto con el valor elegido. */
export function resolveConfirmDialog(value: boolean): void {
	const request = current;
	if (!request) return;
	current = null;
	emit();
	request.resolve(value);
}

export function confirmDialog(options: string | ConfirmDialogOptions): Promise<boolean> {
	const opts = normalize<ConfirmDialogOptions>(options);
	if (listeners.size === 0) {
		return Promise.resolve(typeof window === "undefined" ? true : window.confirm(fallbackMessage(opts)));
	}
	// Dos pedidos seguidos: el anterior se da por cancelado y gana el nuevo.
	if (current) resolveConfirmDialog(false);
	return new Promise((resolve) => {
		current = { ...opts, kind: "confirm", resolve };
		emit();
	});
}

export function alertDialog(options: string | AlertDialogOptions): Promise<void> {
	const opts = normalize<AlertDialogOptions>(options);
	if (listeners.size === 0) {
		if (typeof window !== "undefined") window.alert(fallbackMessage(opts));
		return Promise.resolve();
	}
	if (current) resolveConfirmDialog(false);
	return new Promise((resolve) => {
		current = { ...opts, kind: "alert", resolve: () => resolve() };
		emit();
	});
}
