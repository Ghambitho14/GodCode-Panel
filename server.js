import { randomUUID } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { extname, join, normalize, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const PORT = Number(process.env.PORT || 3000);
const DIST_DIR = resolve(process.cwd(), "dist");
const REFRESH_COOKIE = "gc_rt";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const WINDOW_SECONDS = 15 * 60;
const LIMIT_PER_IP_EMAIL = 10;
const LIMIT_PER_IP = 50;
const CSP_REPORT_LIMIT_PER_IP = 100;
const rateLimitStore = new Map();

/** Login y reportes CSP: JSON chico. Más que esto es abuso. */
const MAX_JSON_BODY_BYTES = 64 * 1024;
/** Proxy: la imagen más grande que acepta el panel es de 20 MB (menú). */
const PROXY_MAX_BODY_BYTES = 25 * 1024 * 1024;
/** Sin bytes de Supabase en este tiempo, se corta la petición. */
const PROXY_IDLE_TIMEOUT_MS = 120_000;

/*
 * Lo único que el navegador puede pedirle a Supabase a través de `/api/supabase/*`.
 * Auth queda fuera a propósito: el login, el refresh y el logout pasan por
 * `/api/auth/*`, que tiene límite de intentos. Si el proxy dejara pasar
 * `/auth/v1/token`, cualquiera podría probar contraseñas sin ese límite.
 */
const SUPABASE_PROXY_PREFIXES = ["/rest/v1/", "/storage/v1/", "/functions/v1/", "/realtime/v1/"];

/** Cabeceras del navegador que Supabase no necesita y no debe recibir. */
const PROXY_STRIPPED_HEADERS = ["cookie", "connection", "proxy-connection", "x-gc-auth"];

const BODY_TOO_LARGE = Symbol("body-too-large");

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
    process.env.SUPABASE_INTERNAL_URL ||
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

/**
 * Una línea JSON por evento, para poder buscar y filtrar en los logs del
 * contenedor. Nunca pasar tokens, contraseñas ni el email completo.
 */
function logEvent(level, event, fields = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

/** `juan.perez@x.cl` → `j***@x.cl`: alcanza para ver qué cuenta atacan sin guardar el email. */
function maskEmail(email) {
  const [user, domain] = String(email || "").trim().toLowerCase().split("@");
  if (!user || !domain) return null;
  return `${user[0]}***@${domain}`;
}

function requestContext(req) {
  return {
    request_id: req.requestId,
    ip: clientIp(req),
    user_agent: String(req.headers["user-agent"] || "").slice(0, 200),
  };
}

/**
 * 413 y se cierra la conexión: esperar a que el cliente termine de mandar un
 * cuerpo enorme es justo lo que el límite quiere evitar, y dejarla abierta
 * hacía que la siguiente petición por el mismo socket quedara colgada.
 */
function rejectTooLarge(req, res) {
  res.on("finish", () => req.destroy());
  return json(res, 413, { error: "Petición demasiado grande." }, { Connection: "close" });
}

function readBody(req) {
  return new Promise((resolveBody) => {
    if (Number(req.headers["content-length"] || 0) > MAX_JSON_BODY_BYTES) {
      return resolveBody(BODY_TOO_LARGE);
    }
    const chunks = [];
    let received = 0;
    req.on("data", (chunk) => {
      received += chunk.length;
      // Sin Content-Length (chunked) el tamaño solo se ve al ir leyendo.
      if (received > MAX_JSON_BODY_BYTES) {
        req.pause();
        return resolveBody(BODY_TOO_LARGE);
      }
      chunks.push(Buffer.from(chunk));
    });
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

/*
 * IP real del cliente. El primer valor de X-Forwarded-For lo escribe el propio
 * cliente y se puede inventar: con uno distinto en cada intento se esquivaba el
 * límite del login. El último lo agrega el proxy que tenemos delante (Traefik),
 * así que ese es el confiable.
 */
function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) {
    const hops = xff.split(",").map((part) => part.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }
  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.trim()) return realIp.trim();
  return req.socket.remoteAddress || "unknown";
}

let lastRateLimitSweep = 0;

/** Borra contadores vencidos; sin esto el Map crecía con cada IP para siempre. */
function sweepRateLimitStore(now) {
  if (now - lastRateLimitSweep < 60_000) return;
  lastRateLimitSweep = now;
  for (const [key, entry] of rateLimitStore) {
    if (entry.expiresAt <= now) rateLimitStore.delete(key);
  }
}

function incrementCounter(key) {
  const now = Date.now();
  sweepRateLimitStore(now);
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
  if (body === BODY_TOO_LARGE) return rejectTooLarge(req, res);
  const email = String(body?.email || "").trim();
  const password = String(body?.password || "");

  if (!email || !password) {
    return json(res, 400, { error: "Email y contraseña son obligatorios." });
  }
  if (!checkLoginRateLimit(req, email)) {
    logEvent("warn", "auth.login.rate_limited", { ...requestContext(req), email: maskEmail(email) });
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
      logEvent("warn", "auth.login.failure", {
        ...requestContext(req),
        email: maskEmail(email),
        reason: error?.message || "sin sesión",
      });
      return json(res, 401, { error: "Credenciales incorrectas." });
    }
    logEvent("info", "auth.login.success", { ...requestContext(req), user_id: data.user?.id || null });
    return json(res, 200, sessionPayload(data.session, data.user), {
      "Set-Cookie": serializeCookie(data.session.refresh_token, COOKIE_MAX_AGE_SECONDS),
    });
  } catch (error) {
    logEvent("error", "auth.login.error", { ...requestContext(req), error: errorMessage(error) });
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
      logEvent("info", "auth.refresh.rejected", {
        ...requestContext(req),
        reason: error?.message || "sin sesión",
      });
      return json(res, 401, { error: "Sesión expirada." }, {
        "Set-Cookie": serializeCookie("", 0),
      });
    }
    return json(res, 200, sessionPayload(data.session, data.user), {
      "Set-Cookie": serializeCookie(data.session.refresh_token, COOKIE_MAX_AGE_SECONDS),
    });
  } catch (error) {
    logEvent("error", "auth.refresh.error", { ...requestContext(req), error: errorMessage(error) });
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
      // Antes se llamaba `setSession({ access_token: "" })`: supabase-js lo
      // rechaza por el access token vacío, `signOut()` no tenía sesión y el
      // refresh token seguía vivo en Supabase después de "cerrar sesión".
      // Hay que canjearlo por una sesión real y cerrar esa.
      const supabase = createServerSupabaseClient();
      const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
      if (error || !data.session) {
        logEvent("info", "auth.logout.no_session", { ...requestContext(req) });
      } else {
        // `local`: solo esta sesión. Con `global` se cerraría también en las
        // otras cajas que comparten la cuenta.
        const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
        logEvent(signOutError ? "warn" : "info", "auth.logout", {
          ...requestContext(req),
          user_id: data.user?.id || null,
          revoked: !signOutError,
          ...(signOutError ? { error: signOutError.message } : {}),
        });
      }
    } catch (error) {
      // best-effort: igual limpiamos la cookie abajo
      logEvent("warn", "auth.logout.error", { ...requestContext(req), error: errorMessage(error) });
    }
  }

  return json(res, 200, { ok: true }, { "Set-Cookie": serializeCookie("", 0) });
}

/**
 * Reportes de `Content-Security-Policy-Report-Only`. Solo se registran: sirven
 * para ver qué bloquearía la CSP completa antes de activarla de verdad.
 */
async function handleCspReport(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  if (incrementCounter(`csp:ip:${clientIp(req)}`) > CSP_REPORT_LIMIT_PER_IP) {
    req.resume();
    res.writeHead(204);
    return res.end();
  }
  const body = await readBody(req);
  if (body === BODY_TOO_LARGE) return rejectTooLarge(req, res);
  const report = body?.["csp-report"] || {};
  logEvent("warn", "csp.violation", {
    request_id: req.requestId,
    directive: String(report["violated-directive"] || report["effective-directive"] || "").slice(0, 100),
    blocked_uri: String(report["blocked-uri"] || "").slice(0, 300),
    document_uri: String(report["document-uri"] || "").split("?")[0].slice(0, 300),
  });
  res.writeHead(204);
  res.end();
}

function handleHealth(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return json(res, 405, { error: "Method not allowed" });
  }
  return json(res, 200, { ok: true }, { "Cache-Control": "no-store" });
}

/**
 * Ruta pedida a Supabase si el proxy la deja pasar, o `null`. Se rechazan los
 * puntos codificados (`%2e`): con ellos `/rest/v1/%2e%2e/auth/v1/token` podría
 * terminar en Auth del otro lado aunque empiece con un prefijo permitido.
 */
function allowedSupabasePath(rawUrl) {
  const raw = String(rawUrl || "");
  if (/%2e|%5c/i.test(raw)) return null;
  const url = new URL(raw, "http://localhost");
  const path = url.pathname.replace(/^\/api\/supabase/, "");
  if (!SUPABASE_PROXY_PREFIXES.some((prefix) => path.startsWith(prefix))) return null;
  return path + url.search;
}

function proxyHeaders(req, target) {
  const headers = { ...req.headers, host: target.hostname };
  for (const name of PROXY_STRIPPED_HEADERS) delete headers[name];
  return headers;
}

/**
 * Proxy hacia Supabase CLI corriendo en la misma instancia.
 * El navegador nunca ve la IP/puerto privado de Supabase; habla con el mismo
 * dominio del frontend bajo `/api/supabase/*` y el BFF redirige internamente.
 */
async function proxyToSupabase(req, res) {
  const targetPath = allowedSupabasePath(req.url);
  if (!targetPath) {
    logEvent("warn", "proxy.blocked", {
      ...requestContext(req),
      method: req.method,
      path: String(req.url || "").split("?")[0].slice(0, 200),
    });
    req.resume();
    return json(res, 403, { error: "Ruta no permitida." });
  }
  if (Number(req.headers["content-length"] || 0) > PROXY_MAX_BODY_BYTES) {
    return rejectTooLarge(req, res);
  }

  const target = new URL(resolveServerConfig().url);
  const isHttps = target.protocol === "https:";
  const port = target.port || (isHttps ? "443" : "80");
  const options = {
    hostname: target.hostname,
    port,
    path: targetPath,
    method: req.method,
    headers: proxyHeaders(req, target),
  };

  const transport = isHttps ? httpsRequest : httpRequest;
  const proxyReq = transport(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxyReq.setTimeout(PROXY_IDLE_TIMEOUT_MS, () => {
    proxyReq.destroy(new Error(`sin respuesta en ${PROXY_IDLE_TIMEOUT_MS} ms`));
  });
  let tooLarge = false;
  proxyReq.on("error", (error) => {
    if (tooLarge) return;
    logEvent("error", "proxy.error", { request_id: req.requestId, error: errorMessage(error) });
    if (res.headersSent) return res.destroy();
    json(res, 502, { error: "Supabase no disponible." });
  });

  // Sin Content-Length (chunked) el tamaño solo se ve mientras llega el cuerpo.
  let received = 0;
  req.on("data", (chunk) => {
    received += chunk.length;
    if (tooLarge || received <= PROXY_MAX_BODY_BYTES) return;
    tooLarge = true;
    req.unpipe(proxyReq);
    proxyReq.destroy();
    if (res.headersSent) return req.destroy();
    rejectTooLarge(req, res);
  });
  req.pipe(proxyReq);
}

/** Proxy WebSocket (Realtime) bajo `/api/supabase/*`. */
function proxyToSupabaseUpgrade(req, socket, head) {
  // Por WebSocket solo viaja Realtime.
  const targetPath = allowedSupabasePath(req.url);
  if (!targetPath || !targetPath.startsWith("/realtime/v1/")) {
    logEvent("warn", "proxy.ws.blocked", {
      ip: clientIp(req),
      path: String(req.url || "").split("?")[0].slice(0, 200),
    });
    socket.destroy();
    return;
  }

  const target = new URL(resolveServerConfig().url);
  const isHttps = target.protocol === "https:";
  const port = target.port || (isHttps ? "443" : "80");
  // `connection` y `upgrade` sí van: sin ellos no hay WebSocket.
  const headers = { ...req.headers, host: target.hostname };
  delete headers.cookie;
  delete headers["proxy-connection"];
  delete headers["x-gc-auth"];

  const transport = isHttps ? httpsRequest : httpRequest;
  const proxyReq = transport({
    hostname: target.hostname,
    port,
    path: targetPath,
    method: "GET",
    headers,
  });

  proxyReq.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
    let response = `HTTP/1.1 101 Switching Protocols\r\n`;
    for (const [key, value] of Object.entries(proxyRes.headers)) {
      if (value == null) continue;
      if (Array.isArray(value)) {
        for (const item of value) response += `${key}: ${item}\r\n`;
      } else {
        response += `${key}: ${value}\r\n`;
      }
    }
    response += "\r\n";
    socket.write(response);
    if (proxyHead?.length) socket.write(proxyHead);

    proxySocket.pipe(socket);
    socket.pipe(proxySocket);

    proxySocket.on("error", () => socket.destroy());
    socket.on("error", () => proxySocket.destroy());
  });

  proxyReq.on("response", (proxyRes) => {
    logEvent("warn", "proxy.ws.rejected", {
      status: proxyRes.statusCode,
      status_message: proxyRes.statusMessage,
    });
    socket.destroy();
  });

  proxyReq.on("error", (error) => {
    logEvent("error", "proxy.ws.error", { error: errorMessage(error) });
    socket.destroy();
  });

  if (head?.length) proxyReq.write(head);
  proxyReq.end();
}

/*
 * Caché HTTP. Qué versión ve el cajero lo decide el service worker, así que
 * index.html, sw.js y el manifest se revalidan siempre: si el navegador los
 * guardara, un deploy no se detectaría. Lo de /assets/ lleva hash en el nombre
 * y nunca cambia, así que se guarda un año.
 */
function cacheControlFor(filePath) {
  const relative = filePath.slice(DIST_DIR.length).replace(/\\/g, "/");
  if (relative.startsWith("/assets/")) return "public, max-age=31536000, immutable";
  if (/\.(html|webmanifest)$/.test(relative) || relative === "/sw.js") return "no-cache";
  return null;
}

function isFile(filePath) {
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function serveFile(res, filePath) {
  const ext = extname(filePath);
  const headers = { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" };
  const cacheControl = cacheControlFor(filePath);
  if (cacheControl) headers["Cache-Control"] = cacheControl;
  res.writeHead(200, headers);
  createReadStream(filePath).pipe(res);
}

async function serveStatic(req, res) {
  const url = new URL(req.url || "/", "http://localhost");
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    // `%E0%A4%A` y similares: antes terminaban en un 500.
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    res.end("Bad request");
    return;
  }
  const normalizedPath = normalize(decodedPath).replace(/^(\.\.[/\\])+/, "");
  const candidate = join(DIST_DIR, normalizedPath);

  // Solo archivos: con una carpeta (/assets) el stream fallaba con EISDIR y la
  // petición quedaba colgada sin respuesta.
  if (candidate.startsWith(DIST_DIR) && isFile(candidate)) {
    return serveFile(res, candidate);
  }

  // Un archivo que no existe es un 404, no la app. Suele ser un chunk de un
  // deploy anterior: devolver index.html como si fuera JS rompía la carga con
  // un error confuso en vez de dejar que el panel recargue la versión nueva.
  const requestedExt = extname(normalizedPath);
  if (requestedExt && requestedExt !== ".html") {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    res.end("Not found");
    return;
  }

  const indexPath = join(DIST_DIR, "index.html");
  if (!existsSync(indexPath)) {
    return json(res, 500, { error: "Build no encontrado. Ejecuta npm run build primero." });
  }

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
  res.end(await readFile(indexPath, "utf8"));
}

async function handleRequest(req, res) {
  const url = new URL(req.url || "/", "http://localhost");
  if (url.pathname === "/api/auth/login") return handleLogin(req, res);
  if (url.pathname === "/api/auth/session") return handleSession(req, res);
  if (url.pathname === "/api/auth/refresh") return handleRefresh(req, res);
  if (url.pathname === "/api/auth/logout") return handleLogout(req, res);
  if (url.pathname === "/api/csp-report") return handleCspReport(req, res);
  if (url.pathname === "/health") return handleHealth(req, res);
  if (url.pathname.startsWith("/api/supabase/")) return proxyToSupabase(req, res);
  return serveStatic(req, res);
}

function envPresent(...keys) {
  return keys.some((key) => Boolean(String(process.env[key] || "").trim()));
}

function logBoot() {
  const distOk = existsSync(DIST_DIR);
  console.log(
    `[GodCode] boot NODE_ENV=${process.env.NODE_ENV || "(unset)"} PORT=${PORT} dist=${distOk ? "ok" : "missing"} supabase_internal_url=${envPresent("SUPABASE_INTERNAL_URL") ? "set" : "missing"} supabase_url=${envPresent("SUPABASE_URL", "VITE_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL") ? "set" : "missing"} anon_key=${envPresent("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY") ? "set" : "missing"}`,
  );
}

process.on("uncaughtException", (error) => {
  console.error("[GodCode] uncaughtException:", error);
});

process.on("unhandledRejection", (reason) => {
  console.error("[GodCode] unhandledRejection:", reason);
});

logBoot();

/**
 * Security headers applied to every response.
 *
 * Mirrors the set the Portal (`saas-godcode-admin`) emits from `proxy.ts`, so
 * both apps present the same posture. Kept deliberately conservative: no
 * `script-src` or `default-src`, because the panel is a Vite SPA with a service
 * worker, Supabase Storage images and Cloudinary assets. Locking those down
 * needs a nonce pipeline; the directives below already close clickjacking,
 * MIME sniffing and base-tag injection without that work.
 *
 * The full policy (`CSP_REPORT_ONLY`) ships as `Report-Only`: browsers report
 * what it would block to `/api/csp-report` without blocking anything. Once the
 * logs show no `csp.violation` from real use, it can replace the enforced one.
 *
 * `Strict-Transport-Security` is only sent when the request arrived over HTTPS
 * (directly or through a proxy), since sending it over plain HTTP is ignored by
 * browsers and would break local development on http://localhost.
 */
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://photon.komoot.io https://ve.dolarapi.com https://fonts.googleapis.com https://fonts.gstatic.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "report-uri /api/csp-report",
].join("; ");

function applySecurityHeaders(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.setHeader(
    "Content-Security-Policy",
    "object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self';",
  );
  res.setHeader("Content-Security-Policy-Report-Only", CSP_REPORT_ONLY);

  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const isHttps = forwardedProto === "https" || Boolean(req.socket?.encrypted);
  if (isHttps) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}

/** Id para cruzar una petición entre logs; se reusa el del proxy si viene uno sano. */
function resolveRequestId(req) {
  const incoming = String(req.headers["x-request-id"] || "");
  return /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
}

const server = createServer((req, res) => {
  req.requestId = resolveRequestId(req);
  res.setHeader("X-Request-Id", req.requestId);
  applySecurityHeaders(req, res);
  handleRequest(req, res).catch((error) => {
    logEvent("error", "server.error", { request_id: req.requestId, error: errorMessage(error) });
    if (res.headersSent) return res.destroy();
    json(res, 500, { error: "Error de servidor." });
  });
});

// Cabeceras lentas (slowloris) se cortan a los 20 s. El cuerpo tiene 5 min:
// una imagen de 20 MB por una conexión mala de local puede tardar.
server.headersTimeout = 20_000;
server.requestTimeout = 5 * 60_000;

server.on("upgrade", (req, socket, head) => {
  try {
    proxyToSupabaseUpgrade(req, socket, head);
  } catch (error) {
    logEvent("error", "proxy.ws.error", { error: errorMessage(error) });
    socket.destroy();
  }
});

server.on("error", (error) => {
  console.error("[GodCode] error al escuchar:", error);
  process.exit(1);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(
    `[GodCode] servidor listo en 0.0.0.0:${PORT} NODE_ENV=${process.env.NODE_ENV || "(unset)"}`,
  );
});
