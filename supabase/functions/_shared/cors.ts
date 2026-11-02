/**
 * CORS de las Edge Functions del panel.
 *
 * El panel las llama por su propio dominio (`/api/supabase/functions/v1/...`),
 * así que en producción ni siquiera hay CORS. Antes respondían
 * `Access-Control-Allow-Origin: *`; ahora solo se devuelve el origen si está en
 * la lista. Sin `Origin` (curl, servidor a servidor) no cambia nada.
 *
 * `PANEL_ALLOWED_ORIGINS` (separado por comas) reemplaza la lista por defecto.
 */

const DEFAULT_ALLOWED_ORIGINS = [
	"https://godcode-panel.me",
	// Desarrollo con VITE_SUPABASE_URL apuntando directo a Supabase.
	"http://localhost:5173",
	"http://127.0.0.1:5173",
	"http://localhost:4173",
];

function allowedOrigins(): string[] {
	const raw = Deno.env.get("PANEL_ALLOWED_ORIGINS") ?? "";
	const fromEnv = raw.split(",").map((origin) => origin.trim()).filter(Boolean);
	return fromEnv.length ? fromEnv : DEFAULT_ALLOWED_ORIGINS;
}

export function corsHeadersFor(req: Request, methods: string): Record<string, string> {
	const headers: Record<string, string> = {
		"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
		"Access-Control-Allow-Methods": methods,
		Vary: "Origin",
	};
	const origin = req.headers.get("Origin");
	if (origin && allowedOrigins().includes(origin)) {
		headers["Access-Control-Allow-Origin"] = origin;
	}
	return headers;
}

/** Envuelve el handler: responde el preflight y agrega CORS a toda respuesta. */
export function withCors(
	methods: string,
	handler: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
	return async (req: Request) => {
		const cors = corsHeadersFor(req, methods);
		if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
		const res = await handler(req);
		const headers = new Headers(res.headers);
		for (const [name, value] of Object.entries(cors)) headers.set(name, value);
		return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
	};
}
