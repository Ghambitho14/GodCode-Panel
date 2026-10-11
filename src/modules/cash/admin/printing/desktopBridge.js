/**
 * Puente con la app de escritorio (GodCode Caja, en `desktop/`). Su preload expone
 * `window.godcodeDesktop` para imprimir sin el diálogo del navegador. En un navegador
 * normal no existe y todo sigue como siempre.
 */

/**
 * @typedef {{ name: string; displayName: string; isDefault: boolean }} DesktopPrinter
 * @typedef {{ cashierPrinter: string; kitchenPrinter: string | null; autoPrint: boolean }} DesktopPrinterConfig
 * @typedef {{
 *   version: string;
 *   listPrinters: () => Promise<DesktopPrinter[]>;
 *   getConfig: () => Promise<DesktopPrinterConfig>;
 *   setConfig: (patch: Partial<DesktopPrinterConfig>) => Promise<DesktopPrinterConfig>;
 *   printTicket: (payload: { html: string; variant: 'kitchen' | 'cashier'; auto?: boolean }) =>
 *     Promise<{ ok: boolean; skipped?: boolean; reason?: string }>;
 * }} DesktopBridge
 */

/** @returns {DesktopBridge | null} */
export function getDesktopBridge() {
	if (typeof window === 'undefined') return null;
	const bridge = /** @type {any} */ (window).godcodeDesktop;
	if (
		!bridge
		|| typeof bridge.printTicket !== 'function'
		|| typeof bridge.listPrinters !== 'function'
		|| typeof bridge.getConfig !== 'function'
		|| typeof bridge.setConfig !== 'function'
	) {
		return null;
	}
	return bridge;
}
