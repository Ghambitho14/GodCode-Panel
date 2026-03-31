/**
 * Uber Direct API (OAuth + delivery quotes).
 * @see https://developer.uber.com/docs/deliveries/guides/authentication
 *
 * Las credenciales de **prueba (sandbox)** y **producción** suelen usar los mismos hosts;
 * cambian `UBER_CLIENT_ID`, `UBER_CLIENT_SECRET` y `UBER_CUSTOMER_ID` según el dashboard.
 */

const DEFAULT_AUTH_URL = "https://auth.uber.com/oauth/v2/token";
const DEFAULT_API_BASE = "https://api.uber.com";
const SCOPE = "eats.deliveries";

type TokenCache = { accessToken: string; expiresAtMs: number };
let tokenCache: TokenCache | null = null;

function env(name: string): string {
	return String(process.env[name] ?? "").trim();
}

export function isUberDirectConfigured(): boolean {
	return Boolean(
		env("UBER_CLIENT_ID") && env("UBER_CLIENT_SECRET") && env("UBER_CUSTOMER_ID"),
	);
}

function authUrl(): string {
	return env("UBER_AUTH_URL") || DEFAULT_AUTH_URL;
}

function apiBase(): string {
	const b = env("UBER_API_BASE");
	return (b ? b.replace(/\/$/, "") : "") || DEFAULT_API_BASE;
}

/**
 * OAuth 2.0 client_credentials. Cachear token hasta ~5 min antes de expirar.
 */
export async function getUberDirectAccessToken(): Promise<string> {
	const now = Date.now();
	if (tokenCache && tokenCache.expiresAtMs > now + 5 * 60_000) {
		return tokenCache.accessToken;
	}

	const clientId = env("UBER_CLIENT_ID");
	const clientSecret = env("UBER_CLIENT_SECRET");
	if (!clientId || !clientSecret) {
		throw new Error("Uber Direct: faltan UBER_CLIENT_ID o UBER_CLIENT_SECRET");
	}

	const body = new URLSearchParams({
		client_id: clientId,
		client_secret: clientSecret,
		grant_type: "client_credentials",
		scope: SCOPE,
	});

	const res = await fetch(authUrl(), {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body,
	});

	const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
	if (!res.ok) {
		const err =
			typeof data.error_description === "string"
				? data.error_description
				: typeof data.error === "string"
					? data.error
					: `HTTP ${res.status}`;
		throw new Error(`Uber OAuth: ${err}`);
	}

	const accessToken = typeof data.access_token === "string" ? data.access_token : "";
	if (!accessToken) {
		throw new Error("Uber OAuth: respuesta sin access_token");
	}

	const expiresIn =
		typeof data.expires_in === "number" && Number.isFinite(data.expires_in)
			? data.expires_in
			: 3600;
	tokenCache = {
		accessToken,
		expiresAtMs: now + Math.max(60, expiresIn - 300) * 1000,
	};

	return accessToken;
}

function minorUnitsToMajor(amount: number, currencyCode: string): number {
	const c = currencyCode.trim().toUpperCase();
	/** Monedas sin centavos habituales en API (exponent 0 en ISO 4217). */
	const zeroDecimal = new Set(["CLP", "JPY", "KRW", "VND"]);
	if (zeroDecimal.has(c)) {
		return Math.round(amount * 100) / 100;
	}
	return Math.round((amount / 100) * 100) / 100;
}

function extractQuoteFee(raw: Record<string, unknown>): {
	fee: number;
	currencyCode: string;
	quoteId: string;
} {
	const quoteId =
		(typeof raw.quote_id === "string" && raw.quote_id) ||
		(typeof raw.estimate_id === "string" && raw.estimate_id) ||
		(typeof raw.id === "string" && raw.id) ||
		(typeof raw.quoteId === "string" && raw.quoteId) ||
		"";

	let amount = 0;
	let currencyCode = "USD";

	const df = raw.delivery_fee;
	if (df && typeof df === "object" && !Array.isArray(df)) {
		const o = df as Record<string, unknown>;
		const total = Number(o.total);
		if (Number.isFinite(total)) {
			amount = total;
			if (typeof o.currency_code === "string") currencyCode = o.currency_code;
		}
	}

	if (!Number.isFinite(amount) || amount < 0) {
		const fee = Number(raw.fee);
		if (Number.isFinite(fee) && fee >= 0) {
			amount = fee;
			if (typeof raw.currency === "string") currencyCode = raw.currency;
			if (typeof raw.currency_code === "string") currencyCode = raw.currency_code;
		}
	}

	const fee = minorUnitsToMajor(amount, currencyCode);
	return { fee, currencyCode, quoteId };
}

/**
 * POST /v1/customers/{customer_id}/delivery_quotes
 * Direcciones como texto libre (recomendado en FAQ) o JSON string según Uber.
 */
export async function createUberDeliveryQuote(params: {
	pickupAddress: string;
	dropoffAddress: string;
}): Promise<{ quoteId: string; fee: number; currencyCode: string; raw: unknown }> {
	const customerId = env("UBER_CUSTOMER_ID");
	if (!customerId) {
		throw new Error("Uber Direct: falta UBER_CUSTOMER_ID");
	}

	const token = await getUberDirectAccessToken();
	const url = `${apiBase()}/v1/customers/${encodeURIComponent(customerId)}/delivery_quotes`;

	const res = await fetch(url, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			pickup_address: params.pickupAddress,
			dropoff_address: params.dropoffAddress,
		}),
	});

	const raw = await res.json().catch(() => ({}));
	if (!res.ok) {
		const msg =
			raw && typeof raw === "object" && "message" in raw
				? String((raw as { message?: unknown }).message)
				: typeof raw === "object" && raw !== null && "error" in raw
					? String((raw as { error?: unknown }).error)
					: `HTTP ${res.status}`;
		throw new Error(`Uber delivery_quotes: ${msg}`);
	}

	const obj = raw as Record<string, unknown>;
	let parsed = extractQuoteFee(obj);
	if (!parsed.quoteId && Array.isArray(obj.estimates) && obj.estimates[0]) {
		const est = obj.estimates[0] as Record<string, unknown>;
		const inner = extractQuoteFee(est);
		const topId = typeof obj.estimate_id === "string" ? obj.estimate_id : "";
		parsed = {
			quoteId: inner.quoteId || topId || parsed.quoteId,
			fee: Number.isFinite(inner.fee) ? inner.fee : parsed.fee,
			currencyCode: inner.currencyCode || parsed.currencyCode,
		};
	}
	if (!parsed.quoteId) {
		throw new Error("Uber: respuesta sin quote_id / id");
	}

	return { quoteId: parsed.quoteId, fee: parsed.fee, currencyCode: parsed.currencyCode, raw };
}
