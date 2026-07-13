import { createReadStream, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const PORT = Number(process.env.PORT || 3000);
const DIST_DIR = resolve(process.cwd(), "dist");
const REFRESH_COOKIE = "gc_rt";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const WINDOW_SECONDS = 15 * 60;
const LIMIT_PER_IP_EMAIL = 10;
const LIMIT_PER_IP = 50;
const rateLimitStore = new Map();

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function isProd() {
  return String(process.env.NODE_ENV || "") !== "development";
}

function resolveServerConfig() {
  const url = String(
    process.env.SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      "",
  ).trim();
  const anonKey = String(
    process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "",
  ).trim();

  if (!url || !anonKey) {
    throw new Error(
      "[GodCode BFF] Faltan SUPABASE_URL / SUPABASE_ANON_KEY en el entorno del servidor.",
    );
  }

  return { url, anonKey };
}

function createServerSupabaseClient() {
  const { url, anonKey } = resolveServerConfig();
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function json(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...headers,
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolveBody) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolveBody({});
      try {
        resolveBody(JSON.parse(raw));
      } catch {
        resolveBody({});
      }
    });
    req.on("error", () => resolveBody({}));
  });
}

function serializeCookie(value, maxAgeSeconds) {
  const parts = [
    `${REFRESH_COOKIE}=${encodeURIComponent(value)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (isProd()) parts.push("Secure");
  return parts.join("; ");
}

function readRefreshCookie(req) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === REFRESH_COOKIE) {
      const value = rest.join("=").trim();
      return value ? decodeURIComponent(value) : null;
    }
  }
  return null;
}

function passesCsrfCheck(req) {
  if (req.headers["x-gc-auth"] !== "1") return false;
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    const originHost = new URL(String(origin)).host;
    const host = String(req.headers.host || "");
    return Boolean(host) && originHost === host;
  } catch {
    return false;
  }
}

function sessionPayload(session, user) {
  return {
    access_token: session.access_token,
    expires_at: session.expires_at || null,
    user: {
      id: user?.id || "",
      email: user?.email || null,
    },
  };
}

function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) return xff.split(",")[0].trim();
  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.trim()) return realIp.trim();
  return req.socket.remoteAddress || "unknown";
}

function incrementCounter(key) {
  const now = Date.now();
  const existing = rateLimitStore.get(key);
  if (!existing || existing.expiresAt <= now) {
    rateLimitStore.set(key, { count: 1, expiresAt: now + WINDOW_SECONDS * 1000 });
    return 1;
  }
  existing.count += 1;
  return existing.count;
}

function checkLoginRateLimit(req, email) {
  const ip = clientIp(req);
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const ipCount = incrementCounter(`login:ip:${ip}`);
  const pairCount = incrementCounter(`login:pair:${ip}:${normalizedEmail || "unknown"}`);
  return ipCount <= LIMIT_PER_IP && pairCount <= LIMIT_PER_IP_EMAIL;
}

async function handleLogin(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  if (!passesCsrfCheck(req)) return json(res, 403, { error: "Petición no autorizada." });

  const body = await readBody(req);
  const email = String(body?.email || "").trim();
  const password = String(body?.password || "");

  if (!email || !password) {
    return json(res, 400, { error: "Email y contraseña son obligatorios." });
  }
  if (!checkLoginRateLimit(req, email)) {
    return json(
      res,
      429,
      { error: "Demasiados intentos. Intenta más tarde." },
      { "Retry-After": String(WINDOW_SECONDS) },
    );
  }

  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      return json(res, 401, { error: "Credenciales incorrectas." });
    }
    return json(res, 200, sessionPayload(data.session, data.user), {
      "Set-Cookie": serializeCookie(data.session.refresh_token, COOKIE_MAX_AGE_SECONDS),
    });
  } catch (error) {
    console.error("[auth/login] error inesperado:", error);
    return json(res, 500, { error: "Error de servidor." });
  }
}

async function refreshFromCookie(req, res) {
  const refreshToken = readRefreshCookie(req);
  if (!refreshToken) return json(res, 401, { error: "Sin sesión." });

  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });
    if (error || !data.session) {
      return json(res, 401, { error: "Sesión expirada." }, {
        "Set-Cookie": serializeCookie("", 0),
      });
    }
    return json(res, 200, sessionPayload(data.session, data.user), {
      "Set-Cookie": serializeCookie(data.session.refresh_token, COOKIE_MAX_AGE_SECONDS),
    });
  } catch (error) {
    console.error("[auth/refresh] error inesperado:", error);
    return json(res, 500, { error: "Error de servidor." });
  }
}

async function handleSession(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
  return refreshFromCookie(req, res);
}

async function handleRefresh(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  if (!passesCsrfCheck(req)) return json(res, 403, { error: "Petición no autorizada." });
  return refreshFromCookie(req, res);
}

async function handleLogout(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  if (!passesCsrfCheck(req)) return json(res, 403, { error: "Petición no autorizada." });

  const refreshToken = readRefreshCookie(req);
  if (refreshToken) {
    try {
      const supabase = createServerSupabaseClient();
      await supabase.auth.setSession({ access_token: "", refresh_token: refreshToken });
      await supabase.auth.signOut();
    } catch {
      // best-effort: igual limpiamos la cookie abajo
    }
  }

  return json(res, 200, { ok: true }, { "Set-Cookie": serializeCookie("", 0) });
}

function serveFile(res, filePath) {
  const ext = extname(filePath);
  res.writeHead(200, {
    "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
  });
  createReadStream(filePath).pipe(res);
}

async function serveStatic(req, res) {
  const url = new URL(req.url || "/", "http://localhost");
  const decodedPath = decodeURIComponent(url.pathname);
  const normalizedPath = normalize(decodedPath).replace(/^(\.\.[/\\])+/, "");
  const candidate = join(DIST_DIR, normalizedPath);

  if (candidate.startsWith(DIST_DIR) && existsSync(candidate) && !candidate.endsWith("/")) {
    return serveFile(res, candidate);
  }

  const indexPath = join(DIST_DIR, "index.html");
  if (!existsSync(indexPath)) {
    return json(res, 500, { error: "Build no encontrado. Ejecuta npm run build primero." });
  }

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(await readFile(indexPath, "utf8"));
}

async function handleRequest(req, res) {
  const url = new URL(req.url || "/", "http://localhost");
  if (url.pathname === "/api/auth/login") return handleLogin(req, res);
  if (url.pathname === "/api/auth/session") return handleSession(req, res);
  if (url.pathname === "/api/auth/refresh") return handleRefresh(req, res);
  if (url.pathname === "/api/auth/logout") return handleLogout(req, res);
  return serveStatic(req, res);
}

createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    console.error("[server] error inesperado:", error);
    json(res, 500, { error: "Error de servidor." });
  });
}).listen(PORT, "0.0.0.0", () => {
  console.log(`[GodCode] servidor listo en puerto ${PORT}`);
});
