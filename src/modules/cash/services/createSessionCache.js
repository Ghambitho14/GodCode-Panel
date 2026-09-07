/**
 * Motor de cache compartido por panelCatalogCache y panelDataCache.
 *
 * Los dos archivos tenian el mismo motor duplicado (RAM + sessionStorage,
 * dedup de peticiones en vuelo, TTL corto). El propio comentario de
 * panelDataCache decia "mismo contrato que panelCatalogCache". Las unicas
 * diferencias eran el prefijo de almacenamiento, el TTL por defecto, si se
 * persiste en sessionStorage y si se registra en el monitor: justo lo que
 * ahora son parametros.
 *
 * @param {{
 *   prefix: string,
 *   defaultMaxAgeMs: number,
 *   useSession?: boolean,
 *   monitor?: { info: Function, error: Function } | null,
 * }} config
 */
export function createSessionCache(config) {
	const { prefix, defaultMaxAgeMs, useSession: defaultUseSession = false, monitor = null } = config;

	/** @type {Map<string, { data: unknown, fetchedAt: number }>} */
	const entries = new Map();
	/** @type {Map<string, Promise<unknown>>} */
	const inFlight = new Map();

	const storageKey = (key) => prefix + key;

	function readSession(key) {
		try {
			const raw = sessionStorage.getItem(storageKey(key));
			return raw ? JSON.parse(raw) : null;
		} catch {
			return null;
		}
	}

	function writeSession(key, entry) {
		try {
			sessionStorage.setItem(storageKey(key), JSON.stringify(entry));
		} catch {
			// QuotaExceededError: no persistir, RAM sigue OK
		}
	}

	function removeSession(key) {
		try {
			sessionStorage.removeItem(storageKey(key));
		} catch {
			// ignore
		}
	}

	function isFresh(entry, maxAgeMs) {
		if (!entry) return false;
		return Date.now() - entry.fetchedAt < maxAgeMs;
	}

	/**
	 * @template T
	 * @param {string} key
	 * @param {() => Promise<T>} fetcher
	 * @param {{ maxAgeMs?: number, force?: boolean, useSession?: boolean }} [options]
	 * @returns {Promise<T>}
	 */
	async function getCached(key, fetcher, options = {}) {
		const maxAgeMs = options.maxAgeMs ?? defaultMaxAgeMs;
		const force = Boolean(options.force);
		const session = options.useSession ?? defaultUseSession;

		if (!force) {
			const hit = entries.get(key);
			if (isFresh(hit, maxAgeMs)) return /** @type {T} */ (hit.data);

			if (session) {
				const sessionHit = readSession(key);
				if (isFresh(sessionHit, maxAgeMs)) {
					entries.set(key, sessionHit);
					return /** @type {T} */ (sessionHit.data);
				}
			}
		}

		const pending = inFlight.get(key);
		if (pending) return /** @type {Promise<T>} */ (pending);

		const promise = (async () => {
			const startedAt = Date.now();
			try {
				const data = await fetcher();
				const entry = { data, fetchedAt: Date.now() };
				entries.set(key, entry);
				if (session) writeSession(key, entry);
				if (monitor && import.meta.env.DEV) {
					monitor.info('cache', 'fetch_ok', { key, ms: Date.now() - startedAt });
				}
				return data;
			} catch (err) {
				if (monitor) {
					const message = err instanceof Error ? err.message : String(err);
					monitor.error('cache', 'fetch_error', { key, message });
				}
				throw err;
			} finally {
				inFlight.delete(key);
			}
		})();

		inFlight.set(key, promise);
		return promise;
	}

	/** @param {string} key @param {boolean} [session] */
	function invalidate(key, session = defaultUseSession) {
		entries.delete(key);
		inFlight.delete(key);
		if (session) removeSession(key);
	}

	/** Vacia RAM y peticiones en vuelo (semilla de tests). */
	function clearRam() {
		entries.clear();
		inFlight.clear();
	}

	/** Vacia RAM y todo lo persistido bajo el prefijo (semilla de tests). */
	function clearAll() {
		clearRam();
		try {
			const keys = [];
			for (let i = 0; i < sessionStorage.length; i += 1) {
				const k = sessionStorage.key(i);
				if (k && k.startsWith(prefix)) keys.push(k);
			}
			keys.forEach((k) => sessionStorage.removeItem(k));
		} catch {
			// ignore
		}
	}

	return { getCached, invalidate, clearRam, clearAll, storageKey, isFresh };
}
