/**
 * Monitoreo interno del panel (sin DB ni servicios externos).
 *
 * DEV: todos los niveles activos + window.__gcMonitor en consola.
 * Prod: warn/error solo si VITE_GC_MONITOR=1 en .env
 *
 *   VITE_GC_MONITOR=1
 */

const BUFFER_MAX = 200;
const MAX_STRING_LEN = 500;

/** @type {Array<{ ts: number, level: string, area: string, event: string, message?: string, context?: Record<string, unknown> }>} */
const buffer = [];

const SENSITIVE_KEYS = /^(password|token|access_?token|refresh_?token|authorization|cookie|secret|email)$/i;

function isDev() {
	return Boolean(import.meta.env.DEV);
}

function isProdMonitorOn() {
	return String(import.meta.env.VITE_GC_MONITOR ?? '').trim() === '1';
}

function isEnabled() {
	return isDev() || isProdMonitorOn();
}

function shouldLogLevel(level) {
	if (!isEnabled()) return false;
	if (isDev()) return true;
	// Prod con flag: warn + error; info también permitido con el flag
	return level === 'warn' || level === 'error' || level === 'info';
}

/**
 * @param {unknown} value
 * @returns {string | number | boolean | undefined}
 */
function sanitizeValue(value) {
	if (value == null) return undefined;
	if (typeof value === 'boolean' || typeof value === 'number') return value;
	if (typeof value === 'string') {
		return value.length > MAX_STRING_LEN ? value.slice(0, MAX_STRING_LEN) + '…' : value;
	}
	return undefined;
}

/**
 * @param {Record<string, unknown> | undefined} raw
 * @returns {Record<string, unknown> | undefined}
 */
function sanitizeContext(raw) {
	if (!raw || typeof raw !== 'object') return undefined;
	/** @type {Record<string, unknown>} */
	const out = {};
	for (const [key, value] of Object.entries(raw)) {
		if (SENSITIVE_KEYS.test(key)) continue;
		const safe = sanitizeValue(value);
		if (safe !== undefined) out[key] = safe;
	}
	return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * @param {'info' | 'warn' | 'error'} level
 * @param {string} area
 * @param {string} event
 * @param {Record<string, unknown> | undefined} [context]
 */
function log(level, area, event, context) {
	if (!shouldLogLevel(level)) return;

	const entry = {
		ts: Date.now(),
		level,
		area,
		event,
		context: sanitizeContext(context),
	};

	buffer.push(entry);
	if (buffer.length > BUFFER_MAX) {
		buffer.splice(0, buffer.length - BUFFER_MAX);
	}

	const prefix = `[GC] ${area}/${event}`;
	const payload = entry.context;
	if (level === 'error') {
		if (payload) console.error(prefix, payload);
		else console.error(prefix);
	} else if (level === 'warn') {
		if (payload) console.warn(prefix, payload);
		else console.warn(prefix);
	} else if (payload) {
		console.info(prefix, payload);
	} else {
		console.info(prefix);
	}
}

function getRecent(limit = 50) {
	const n = Math.max(1, Math.min(limit, BUFFER_MAX));
	return buffer.slice(-n);
}

/**
 * Agrupa eventos del buffer por `area/event` (útil para medir ruido vs fetches reales).
 * @param {number} [limit]
 * @returns {Record<string, number>}
 */
function countByEvent(limit = BUFFER_MAX) {
	const n = Math.max(1, Math.min(limit, BUFFER_MAX));
	const counts = /** @type {Record<string, number>} */ ({});
	for (const entry of buffer.slice(-n)) {
		const key = `${entry.area}/${entry.event}`;
		counts[key] = (counts[key] ?? 0) + 1;
	}
	return counts;
}

function clear() {
	buffer.length = 0;
}

function resetForTests() {
	clear();
}

/** @param {string} area @param {string} event @param {Record<string, unknown>} [context] */
function info(area, event, context) {
	log('info', area, event, context);
}

/** @param {string} area @param {string} event @param {Record<string, unknown>} [context] */
function warn(area, event, context) {
	log('warn', area, event, context);
}

/** @param {string} area @param {string} event @param {Record<string, unknown>} [context] */
function error(area, event, context) {
	log('error', area, event, context);
}

export const monitor = {
	info,
	warn,
	error,
	isEnabled,
	getRecent,
	countByEvent,
	clear,
	resetForTests,
};

if (typeof window !== 'undefined' && isDev()) {
	window.__gcMonitor = {
		getRecent,
		countByEvent,
		clear,
		isEnabled,
	};
}
