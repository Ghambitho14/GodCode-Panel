'use strict';

/**
 * GodCode Caja: ventana de escritorio que abre el panel publicado y le da una
 * forma de imprimir los tickets directo, sin el diálogo del navegador.
 *
 * Carga el panel remoto en vez de llevar una copia: el login depende de la
 * cookie httpOnly y de `/api/*` del mismo dominio, y así cada deploy de la web
 * llega aquí sin reinstalar.
 */

const { app, BrowserWindow, ipcMain, Menu, session, shell } = require('electron');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PANEL_URL = process.env.GODCODE_PANEL_URL || 'https://godcode-panel.me';
const PANEL_ORIGIN = new URL(PANEL_URL).origin;
const APP_ID = 'me.godcode-panel.caja';

const EXTERNAL_PROTOCOLS = new Set(['https:', 'http:', 'mailto:', 'tel:', 'whatsapp:']);
const MAX_TICKET_HTML = 2 * 1024 * 1024;
const PRINT_TIMEOUT_MS = 30000;

/** @type {BrowserWindow | null} */
let mainWindow = null;

function isPanelUrl(url) {
	try {
		return new URL(url).origin === PANEL_ORIGIN;
	} catch {
		return false;
	}
}

function openExternal(url) {
	try {
		if (EXTERNAL_PROTOCOLS.has(new URL(url).protocol)) void shell.openExternal(url);
	} catch {
		/* URL inválida: no se abre nada */
	}
}

// ---------------------------------------------------------------------------
// Config de impresoras de este equipo (no de la sucursal: cada PC tiene las suyas)
// ---------------------------------------------------------------------------

/**
 * `cashierPrinter`: '' es la predeterminada de Windows.
 * `kitchenPrinter`: null es la misma que la de caja.
 * `autoPrint`: si este equipo imprime solo los pedidos nuevos.
 */
const DEFAULT_CONFIG = Object.freeze({ cashierPrinter: '', kitchenPrinter: null, autoPrint: true });

function configPath() {
	return path.join(app.getPath('userData'), 'printers.json');
}

function printerNameOrNull(value) {
	return typeof value === 'string' && value.trim() ? value.trim().slice(0, 256) : null;
}

function normalizeConfig(raw) {
	const src = raw && typeof raw === 'object' ? raw : {};
	return {
		cashierPrinter: printerNameOrNull(src.cashierPrinter) ?? '',
		kitchenPrinter: printerNameOrNull(src.kitchenPrinter),
		autoPrint: src.autoPrint !== false,
	};
}

function readConfig() {
	try {
		return normalizeConfig(JSON.parse(fs.readFileSync(configPath(), 'utf8')));
	} catch {
		return { ...DEFAULT_CONFIG };
	}
}

function writeConfig(patch) {
	const src = patch && typeof patch === 'object' ? patch : {};
	const next = { ...readConfig() };
	if ('cashierPrinter' in src) next.cashierPrinter = printerNameOrNull(src.cashierPrinter) ?? '';
	if ('kitchenPrinter' in src) next.kitchenPrinter = printerNameOrNull(src.kitchenPrinter);
	if ('autoPrint' in src) next.autoPrint = src.autoPrint !== false;
	fs.mkdirSync(path.dirname(configPath()), { recursive: true });
	fs.writeFileSync(configPath(), JSON.stringify(next, null, 2));
	return next;
}

// ---------------------------------------------------------------------------
// Impresoras
// ---------------------------------------------------------------------------

/** Electron ya no dice cuál es la predeterminada; Windows la guarda en el registro. */
function readWindowsDefaultPrinter() {
	if (process.platform !== 'win32') return Promise.resolve('');
	return new Promise((resolve) => {
		execFile(
			'reg',
			['query', 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Windows', '/v', 'Device'],
			{ windowsHide: true, timeout: 5000 },
			(err, stdout) => {
				if (err) {
					resolve('');
					return;
				}
				const match = /Device\s+REG_SZ\s+([^,\r\n]+)/.exec(String(stdout));
				resolve(match ? match[1].trim() : '');
			},
		);
	});
}

async function listPrinters(webContents) {
	const [printers, defaultName] = await Promise.all([
		webContents.getPrintersAsync(),
		readWindowsDefaultPrinter(),
	]);
	return printers.map((p) => ({
		name: p.name,
		displayName: p.displayName || p.name,
		isDefault: Boolean(defaultName) && p.name === defaultName,
	}));
}

/**
 * El ticket trae `@page { size: A4 }` para el navegador. Aquí manda el papel de
 * la impresora (80 mm en una térmica), así que esa regla se anula solo en esta
 * copia del HTML.
 */
function withPrinterPageSize(html) {
	const style = '<style>@page { size: auto; }</style>';
	return html.includes('</head>') ? html.replace('</head>', `${style}</head>`) : `${style}${html}`;
}

/** Imprime `html` en una ventana oculta, sin diálogo. '' es la predeterminada de Windows. */
function printHtml(html, deviceName) {
	return new Promise((resolve) => {
		const win = new BrowserWindow({
			show: false,
			width: 420,
			height: 900,
			webPreferences: {
				// El HTML del ticket no lleva scripts.
				javascript: false,
				sandbox: true,
				contextIsolation: true,
				nodeIntegration: false,
			},
		});
		win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
		win.webContents.on('will-navigate', (event) => event.preventDefault());

		let settled = false;
		const finish = (result) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			if (!win.isDestroyed()) win.destroy();
			resolve(result);
		};
		const timer = setTimeout(() => finish({ ok: false, reason: 'timeout' }), PRINT_TIMEOUT_MS);

		// Con la página cargada (logo incluido) se manda a la impresora.
		win.webContents.once('did-finish-load', () => {
			const options = {
				silent: true,
				printBackground: true,
				usePrinterDefaultPageSize: true,
				margins: { marginType: 'printableArea' },
			};
			if (deviceName) options.deviceName = deviceName;
			try {
				win.webContents.print(options, (success, failureReason) => {
					finish(success ? { ok: true } : { ok: false, reason: failureReason || 'print-failed' });
				});
			} catch (err) {
				finish({ ok: false, reason: err instanceof Error ? err.message : 'print-failed' });
			}
		});
		win.webContents.once('did-fail-load', (_event, code, description) => {
			finish({ ok: false, reason: description || `load-failed-${code}` });
		});

		win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(withPrinterPageSize(html))}`).catch(() => {
			/* did-fail-load ya responde */
		});
	});
}

async function printTicket(webContents, payload) {
	const html = typeof payload?.html === 'string' ? payload.html : '';
	if (!html || html.length > MAX_TICKET_HTML) return { ok: false, reason: 'invalid-html' };

	const config = readConfig();
	if (payload?.auto === true && !config.autoPrint) return { ok: true, skipped: true };

	const variant = payload?.variant === 'kitchen' ? 'kitchen' : 'cashier';
	const deviceName = variant === 'kitchen' && config.kitchenPrinter != null
		? config.kitchenPrinter
		: config.cashierPrinter;

	// Una impresora desconectada o renombrada no se adivina: la web cae al diálogo.
	if (deviceName) {
		const printers = await webContents.getPrintersAsync();
		if (!printers.some((p) => p.name === deviceName)) {
			return { ok: false, reason: 'printer-not-found' };
		}
	}
	return printHtml(html, deviceName);
}

// ---------------------------------------------------------------------------
// IPC: solo responde a la ventana del panel
// ---------------------------------------------------------------------------

function isPanelSender(event) {
	if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) return false;
	const frame = event.senderFrame;
	return Boolean(frame) && frame === event.sender.mainFrame && isPanelUrl(frame.url);
}

function handle(channel, fn) {
	ipcMain.handle(channel, (event, ...args) => {
		if (!isPanelSender(event)) throw new Error('Origen no permitido');
		return fn(event, ...args);
	});
}

function registerIpc() {
	handle('printers:list', (event) => listPrinters(event.sender));
	handle('config:get', () => readConfig());
	handle('config:set', (_event, patch) => writeConfig(patch));
	handle('print:ticket', (event, payload) => printTicket(event.sender, payload));
}

// ---------------------------------------------------------------------------
// Ventana del panel
// ---------------------------------------------------------------------------

function createMainWindow() {
	mainWindow = new BrowserWindow({
		width: 1280,
		height: 800,
		minWidth: 900,
		minHeight: 600,
		show: false,
		title: 'GodCode Caja',
		backgroundColor: '#fbfbfd',
		webPreferences: {
			preload: path.join(__dirname, 'preload.cjs'),
			additionalArguments: [`--godcode-caja-version=${app.getVersion()}`],
			contextIsolation: true,
			sandbox: true,
			nodeIntegration: false,
			spellcheck: false,
		},
	});

	mainWindow.once('ready-to-show', () => {
		mainWindow?.maximize();
		mainWindow?.show();
	});

	// Dentro solo el panel (y los blob: que abre, como la planilla exportada); lo demás al navegador.
	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		if (isPanelUrl(url) || url.startsWith(`blob:${PANEL_ORIGIN}/`)) {
			return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true } };
		}
		openExternal(url);
		return { action: 'deny' };
	});
	mainWindow.webContents.on('will-navigate', (event, url) => {
		if (isPanelUrl(url)) return;
		event.preventDefault();
		openExternal(url);
	});

	// Sin menú no hay atajos por defecto: F5 / Ctrl+R recargan; DevTools solo en desarrollo.
	mainWindow.webContents.on('before-input-event', (event, input) => {
		if (input.type !== 'keyDown') return;
		const key = input.key.toLowerCase();
		if (key === 'f5' || (input.control && key === 'r')) {
			event.preventDefault();
			mainWindow?.webContents.reload();
		} else if (!app.isPackaged && (key === 'f12' || (input.control && input.shift && key === 'i'))) {
			event.preventDefault();
			mainWindow?.webContents.toggleDevTools();
		}
	});

	mainWindow.on('closed', () => {
		mainWindow = null;
	});

	void mainWindow.loadURL(PANEL_URL);
}

if (!app.requestSingleInstanceLock()) {
	app.quit();
} else {
	app.on('second-instance', () => {
		if (!mainWindow) return;
		if (mainWindow.isMinimized()) mainWindow.restore();
		mainWindow.focus();
	});

	app.whenReady().then(() => {
		app.setAppUserModelId(APP_ID);
		Menu.setApplicationMenu(null);
		// Permisos (notificaciones, portapapeles…) solo para el panel.
		session.defaultSession.setPermissionRequestHandler((webContents, _permission, callback) => {
			callback(isPanelUrl(webContents.getURL()));
		});
		registerIpc();
		createMainWindow();
	});

	app.on('window-all-closed', () => app.quit());
}
