import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * El cliente registra su listener de auth al importarse, así que los mocks
 * tienen que existir antes del import. Por eso `vi.hoisted` + `vi.resetModules`
 * y el import dinámico dentro de cada test.
 */
const { setAuth, removeAllChannels, listeners } = vi.hoisted(() => ({
	setAuth: vi.fn(),
	removeAllChannels: vi.fn(),
	listeners: [] as Array<(event: string) => void>,
}));

vi.mock('@supabase/supabase-js', () => ({
	createClient: () => ({
		realtime: { setAuth },
		removeAllChannels,
	}),
}));

vi.mock('@/integrations/supabase/auth-session', () => ({
	getAccessToken: vi.fn(async () => 'jwt-de-prueba'),
	onAuthEvent: (cb: (event: string) => void) => {
		listeners.push(cb);
		return () => {};
	},
}));

async function loadClient() {
	listeners.length = 0;
	setAuth.mockClear();
	removeAllChannels.mockClear();
	await import('@/integrations/supabase/client');
}

function emit(event: string) {
	for (const listener of listeners) listener(event);
}

describe('sincronización de auth de Realtime', () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it('llama setAuth SIN argumentos al iniciar sesión', async () => {
		// Este es el punto entero del test: con un token explícito, realtime-js
		// marca `_manuallySetToken` y deja de renovar el JWT en cada heartbeat.
		// Sin argumento usa el callback `accessToken` y limpia esa marca.
		await loadClient();

		emit('signed_in');

		expect(setAuth).toHaveBeenCalledTimes(1);
		expect(setAuth).toHaveBeenCalledWith();
	});

	it('llama setAuth SIN argumentos al refrescar el token', async () => {
		await loadClient();

		emit('token_refreshed');

		expect(setAuth).toHaveBeenCalledTimes(1);
		expect(setAuth.mock.calls[0]).toHaveLength(0);
	});

	it('cierra los canales al cerrar sesión', async () => {
		// `setAuth()` sin sesión resuelve a `null` y `_performAuth` no propaga un
		// token nulo, así que el socket quedaría abierto con el JWT viejo.
		await loadClient();

		emit('signed_out');

		expect(removeAllChannels).toHaveBeenCalledTimes(1);
		expect(setAuth).not.toHaveBeenCalled();
	});

	it('no cierra los canales al iniciar sesión', async () => {
		await loadClient();

		emit('signed_in');

		expect(removeAllChannels).not.toHaveBeenCalled();
	});
});
