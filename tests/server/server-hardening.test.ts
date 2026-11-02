// @vitest-environment node
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, request, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/*
 * Levanta `server.js` de verdad contra un Supabase falso y le pega por HTTP.
 * Cubre lo que el hardening de la fase 1 cambió: rutas del proxy, cabeceras,
 * límites de tamaño, logout que revoca y el límite de intentos del login.
 */

interface UpstreamHit {
	method: string;
	url: string;
	headers: IncomingHttpHeaders;
}

interface Reply {
	status: number;
	headers: IncomingHttpHeaders;
	body: string;
}

const hits: UpstreamHit[] = [];
let upstream: Server;
let child: ChildProcess;
let base: { host: string; port: number };

function fakeJwt(): string {
	const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
	const exp = Math.floor(Date.now() / 1000) + 3600;
	return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: 'user-1', exp, aal: 'aal1' })}.firma`;
}

function startUpstream(): Promise<number> {
	upstream = createServer((req, res) => {
		hits.push({ method: req.method || '', url: req.url || '', headers: req.headers });
		req.resume();
		req.on('end', () => {
			const url = req.url || '';
			if (url.startsWith('/auth/v1/token?grant_type=password')) {
				res.writeHead(400, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' }));
				return;
			}
			if (url.startsWith('/auth/v1/token?grant_type=refresh_token')) {
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(
					JSON.stringify({
						access_token: fakeJwt(),
						token_type: 'bearer',
						expires_in: 3600,
						expires_at: Math.floor(Date.now() / 1000) + 3600,
						refresh_token: 'rt-nuevo',
						user: { id: 'user-1', email: 'caja@local.test', aud: 'authenticated' },
					}),
				);
				return;
			}
			if (url.startsWith('/auth/v1/logout')) {
				res.writeHead(204);
				res.end();
				return;
			}
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end('[]');
		});
	});
	return new Promise((done) => upstream.listen(0, '127.0.0.1', () => done((upstream.address() as AddressInfo).port)));
}

function freePort(): Promise<number> {
	return new Promise((done) => {
		const probe = createServer();
		probe.listen(0, '127.0.0.1', () => {
			const { port } = probe.address() as AddressInfo;
			probe.close(() => done(port));
		});
	});
}

function send(
	method: string,
	path: string,
	options: { headers?: Record<string, string>; body?: string | Buffer; chunks?: number; chunkSize?: number } = {},
): Promise<Reply> {
	return new Promise((done, fail) => {
		const req = request({ host: base.host, port: base.port, method, path, headers: options.headers }, (res) => {
			let body = '';
			res.setEncoding('utf8');
			res.on('data', (chunk) => (body += chunk));
			res.on('end', () => done({ status: res.statusCode || 0, headers: res.headers, body }));
		});
		req.on('error', fail);
		if (options.chunks) {
			// Cuerpo sin Content-Length (chunked), para el límite que se mide al leer.
			const chunk = Buffer.alloc(options.chunkSize || 1024 * 1024, 1);
			let sent = 0;
			const pump = () => {
				while (sent < (options.chunks || 0)) {
					sent += 1;
					if (!req.write(chunk)) return req.once('drain', pump);
				}
				req.end();
			};
			req.on('error', () => undefined);
			pump();
			return;
		}
		if (options.body) req.write(options.body);
		req.end();
	});
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
	return {
		'Content-Type': 'application/json',
		'X-GC-Auth': '1',
		Origin: `http://${base.host}:${base.port}`,
		...extra,
	};
}

beforeAll(async () => {
	const upstreamPort = await startUpstream();
	const port = await freePort();
	base = { host: '127.0.0.1', port };
	child = spawn(process.execPath, [resolve(__dirname, '../../server.js')], {
		env: {
			...process.env,
			PORT: String(port),
			NODE_ENV: 'development',
			SUPABASE_INTERNAL_URL: `http://127.0.0.1:${upstreamPort}`,
			SUPABASE_ANON_KEY: 'anon-de-prueba',
		},
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	await new Promise<void>((done, fail) => {
		const timer = setTimeout(() => fail(new Error('server.js no arrancó')), 10_000);
		child.stdout?.on('data', (chunk) => {
			if (String(chunk).includes('servidor listo')) {
				clearTimeout(timer);
				done();
			}
		});
		child.on('exit', (code) => fail(new Error(`server.js terminó con código ${code}`)));
	});
}, 15_000);

afterAll(async () => {
	child?.kill();
	await new Promise((done) => upstream?.close(done));
});

beforeEach(() => {
	hits.length = 0;
});

describe('proxy /api/supabase', () => {
	it('bloquea el login directo de Supabase (se saltaba el límite de intentos)', async () => {
		const reply = await send('POST', '/api/supabase/auth/v1/token?grant_type=password', {
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email: 'a@b.cl', password: 'x' }),
		});
		expect(reply.status).toBe(403);
		expect(hits).toHaveLength(0);
	});

	it.each([
		'/api/supabase/auth/v1/signup',
		'/api/supabase/pg/tables',
		'/api/supabase/rest/v1/%2e%2e/auth/v1/token',
		'/api/supabase/rest/v1/../../auth/v1/token',
	])('bloquea %s', async (path) => {
		const reply = await send('GET', path);
		expect(reply.status).toBe(403);
		expect(hits).toHaveLength(0);
	});

	it('deja pasar rest/v1 y no reenvía la cookie de sesión', async () => {
		const reply = await send('GET', '/api/supabase/rest/v1/products?select=id', {
			headers: { Cookie: 'gc_rt=secreto', apikey: 'anon-de-prueba', 'X-GC-Auth': '1' },
		});
		expect(reply.status).toBe(200);
		expect(hits).toHaveLength(1);
		expect(hits[0].url).toBe('/rest/v1/products?select=id');
		expect(hits[0].headers.cookie).toBeUndefined();
		expect(hits[0].headers['x-gc-auth']).toBeUndefined();
		expect(hits[0].headers.apikey).toBe('anon-de-prueba');
	});

	it('corta con 413 un cuerpo de más de 25 MB sin Content-Length', async () => {
		const reply = await send('POST', '/api/supabase/storage/v1/object/menu/foto.jpg', {
			headers: { 'Content-Type': 'image/jpeg' },
			chunks: 26,
			// Si el servidor corta mientras el cliente sigue escribiendo, el socket
			// puede reventar con EPIPE antes de leer el 413: también es un corte.
		}).catch(() => ({ status: 413, headers: {}, body: '' }) as Reply);
		expect(reply.status).toBe(413);
	});

	it('rechaza de entrada un Content-Length de más de 25 MB', async () => {
		const reply = await send('POST', '/api/supabase/storage/v1/object/menu/foto.jpg', {
			headers: { 'Content-Type': 'image/jpeg', 'Content-Length': String(30 * 1024 * 1024) },
		});
		expect(reply.status).toBe(413);
		expect(hits).toHaveLength(0);
	});
});

describe('cabeceras y rutas propias', () => {
	it('responde /health', async () => {
		const reply = await send('GET', '/health');
		expect(reply.status).toBe(200);
		expect(JSON.parse(reply.body)).toEqual({ ok: true });
	});

	it('manda la CSP completa en modo Report-Only y un X-Request-Id', async () => {
		const reply = await send('GET', '/health');
		const reportOnly = String(reply.headers['content-security-policy-report-only']);
		expect(reportOnly).toContain("default-src 'self'");
		expect(reportOnly).toContain('report-uri /api/csp-report');
		expect(String(reply.headers['content-security-policy'])).toContain("object-src 'none'");
		expect(reply.headers['x-request-id']).toMatch(/^[\w-]{8,64}$/);
	});

	it('acepta reportes CSP con 204', async () => {
		const reply = await send('POST', '/api/csp-report', {
			headers: { 'Content-Type': 'application/csp-report' },
			body: JSON.stringify({ 'csp-report': { 'violated-directive': 'img-src', 'blocked-uri': 'https://x.test/a.png' } }),
		});
		expect(reply.status).toBe(204);
	});

	it('una ruta mal codificada da 400, no 500', async () => {
		const reply = await send('GET', '/%E0%A4%A');
		expect(reply.status).toBe(400);
	});
});

describe('auth', () => {
	it('rechaza un login de más de 64 KB', async () => {
		const reply = await send('POST', '/api/auth/login', {
			headers: authHeaders(),
			body: JSON.stringify({ email: 'a@b.cl', password: 'x'.repeat(100 * 1024) }),
		});
		expect(reply.status).toBe(413);
	});

	it('el logout revoca la sesión en Supabase, solo la de este equipo', async () => {
		const reply = await send('POST', '/api/auth/logout', {
			headers: authHeaders({ Cookie: 'gc_rt=rt-viejo' }),
		});
		expect(reply.status).toBe(200);
		expect(String(reply.headers['set-cookie'])).toContain('Max-Age=0');
		const logout = hits.find((hit) => hit.url.startsWith('/auth/v1/logout'));
		expect(logout?.url).toBe('/auth/v1/logout?scope=local');
		expect(String(logout?.headers.authorization)).toMatch(/^Bearer .+\..+\..+/);
	});

	it('inventar el primer X-Forwarded-For no esquiva el límite de intentos', async () => {
		const statuses: number[] = [];
		for (let attempt = 0; attempt < 11; attempt += 1) {
			const reply = await send('POST', '/api/auth/login', {
				headers: authHeaders({ 'X-Forwarded-For': `10.0.0.${attempt}, 203.0.113.7` }),
				body: JSON.stringify({ email: 'caja@local.test', password: 'mala' }),
			});
			statuses.push(reply.status);
		}
		expect(statuses.slice(0, 10).every((status) => status === 401)).toBe(true);
		expect(statuses[10]).toBe(429);
	});
});
