import type { VercelRequest } from "@vercel/node";

const WINDOW_SECONDS = 15 * 60;
const LIMIT_PER_IP_EMAIL = 10;
const LIMIT_PER_IP = 50;

type MemoryEntry = { count: number; expiresAt: number };

const memoryStore = new Map<string, MemoryEntry>();

/**
 * El primer valor de X-Forwarded-For lo escribe el cliente y se puede inventar
 * en cada intento; el último lo agrega el proxy que tenemos delante.
 */
function getClientIp(req: VercelRequest): string {
	const xff = req.headers["x-forwarded-for"];
	const raw = Array.isArray(xff) ? xff.join(",") : xff;
	if (typeof raw === "string" && raw.trim()) {
		const hops = raw.split(",").map((part) => part.trim()).filter(Boolean);
		if (hops.length) return hops[hops.length - 1];
	}
	const realIp = req.headers["x-real-ip"];
	if (typeof realIp === "string" && realIp.trim()) {
		return realIp.trim();
	}
	return "unknown";
}

let lastSweep = 0;

/** Borra contadores vencidos; sin esto el Map crecía con cada IP para siempre. */
function sweepMemoryStore(now: number): void {
	if (now - lastSweep < 60_000) return;
	lastSweep = now;
	for (const [key, entry] of memoryStore) {
		if (entry.expiresAt <= now) memoryStore.delete(key);
	}
}

function memoryIncrement(key: string, windowSeconds: number): number {
	const now = Date.now();
	sweepMemoryStore(now);
	const existing = memoryStore.get(key);
	if (!existing || existing.expiresAt <= now) {
		memoryStore.set(key, { count: 1, expiresAt: now + windowSeconds * 1000 });
		return 1;
	}
	existing.count += 1;
	return existing.count;
}

let warnedMissingKv = false;

function warnMissingKvOnce(): void {
	if (warnedMissingKv) return;
	warnedMissingKv = true;
	if (process.env.NODE_ENV === "production") {
		console.warn(
			"[rate-limit] KV_REST_API_URL/KV_REST_API_TOKEN ausentes en producción: " +
				"el rate limit cae a memoria por instancia y es evadible en brute-force distribuido. " +
				"Configurá Vercel KV para protección efectiva.",
		);
	}
}

async function kvIncrement(key: string, windowSeconds: number): Promise<number | null> {
	const baseUrl = String(process.env.KV_REST_API_URL ?? "").replace(/\/$/, "");
	const token = String(process.env.KV_REST_API_TOKEN ?? "").trim();
	if (!baseUrl || !token) {
		warnMissingKvOnce();
		return null;
	}

	const incrRes = await fetch(`${baseUrl}/incr/${encodeURIComponent(key)}`, {
		method: "POST",
		headers: { Authorization: `Bearer ${token}` },
	});
	if (!incrRes.ok) return null;

	const count = Number(await incrRes.text());
	if (!Number.isFinite(count)) return null;

	if (count === 1) {
		await fetch(`${baseUrl}/expire/${encodeURIComponent(key)}/${windowSeconds}`, {
			method: "POST",
			headers: { Authorization: `Bearer ${token}` },
		});
	}

	return count;
}

async function incrementCounter(key: string, windowSeconds: number): Promise<number> {
	// `kvIncrement` hace fetch contra Vercel KV. Si la red falla, el fetch
	// rechaza: sin este catch la excepción subiría hasta el handler de login y
	// devolvería 500, dejando el login caído mientras el KV esté caído.
	// Degradar al contador en memoria mantiene el límite (por instancia) y el
	// login operativo.
	let kvCount: number | null = null;
	try {
		kvCount = await kvIncrement(key, windowSeconds);
	} catch (error) {
		console.warn(
			"[rate-limit] KV inaccesible, se degrada a memoria por instancia:",
			error instanceof Error ? error.message : String(error),
		);
	}
	if (kvCount != null) return kvCount;
	return memoryIncrement(key, windowSeconds);
}

export interface LoginRateLimitResult {
	allowed: boolean;
	retryAfterSeconds: number;
}

/**
 * Rate limit de login: 10 intentos / 15 min por IP+email y 50 / 15 min por IP.
 * Usa Vercel KV (REST) en prod si hay credenciales; Map en memoria en dev.
 */
export async function checkLoginRateLimit(
	req: VercelRequest,
	email: string,
): Promise<LoginRateLimitResult> {
	const ip = getClientIp(req);
	const normalizedEmail = String(email ?? "").trim().toLowerCase();
	const ipKey = `login:ip:${ip}`;
	const pairKey = `login:pair:${ip}:${normalizedEmail || "unknown"}`;

	const [ipCount, pairCount] = await Promise.all([
		incrementCounter(ipKey, WINDOW_SECONDS),
		incrementCounter(pairKey, WINDOW_SECONDS),
	]);

	if (ipCount > LIMIT_PER_IP || pairCount > LIMIT_PER_IP_EMAIL) {
		return { allowed: false, retryAfterSeconds: WINDOW_SECONDS };
	}
	return { allowed: true, retryAfterSeconds: 0 };
}

/** Expone helpers para tests. */
export const __rateLimitTestUtils = {
	WINDOW_SECONDS,
	LIMIT_PER_IP,
	LIMIT_PER_IP_EMAIL,
	clearMemoryStore: () => memoryStore.clear(),
	memoryIncrement,
};
