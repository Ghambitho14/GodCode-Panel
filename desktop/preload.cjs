'use strict';

/**
 * Lo único que la web ve de la app de escritorio: `window.godcodeDesktop`.
 * La web lo usa en `src/modules/cash/admin/printing/desktopBridge.js`.
 */

const { contextBridge, ipcRenderer } = require('electron');

const versionArg = process.argv.find((arg) => arg.startsWith('--godcode-caja-version='));

contextBridge.exposeInMainWorld('godcodeDesktop', {
	version: versionArg ? versionArg.slice('--godcode-caja-version='.length) : '',
	/** @returns {Promise<Array<{ name: string; displayName: string; isDefault: boolean }>>} */
	listPrinters: () => ipcRenderer.invoke('printers:list'),
	/** @returns {Promise<{ cashierPrinter: string; kitchenPrinter: string | null; autoPrint: boolean }>} */
	getConfig: () => ipcRenderer.invoke('config:get'),
	setConfig: (patch) => ipcRenderer.invoke('config:set', patch),
	/** @returns {Promise<{ ok: boolean; skipped?: boolean; reason?: string }>} */
	printTicket: (payload) => ipcRenderer.invoke('print:ticket', payload),
});
