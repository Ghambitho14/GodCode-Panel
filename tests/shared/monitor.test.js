import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { monitor } from '@/shared/monitor';

describe('monitor', () => {
	beforeEach(() => {
		monitor.resetForTests();
		vi.spyOn(console, 'info').mockImplementation(() => {});
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		monitor.resetForTests();
	});

	it('guarda eventos en ring buffer respetando el límite', () => {
		for (let i = 0; i < 205; i += 1) {
			monitor.info('cache', `event_${i}`, { n: i });
		}
		const recent = monitor.getRecent(300);
		expect(recent.length).toBeLessThanOrEqual(200);
		expect(recent[recent.length - 1]?.event).toBe('event_204');
		expect(recent[0]?.event).toBe('event_5');
	});

	it('getRecent limita la cantidad devuelta', () => {
		monitor.info('data', 'a');
		monitor.info('data', 'b');
		monitor.info('data', 'c');
		expect(monitor.getRecent(2)).toHaveLength(2);
		expect(monitor.getRecent(2)[0]?.event).toBe('b');
	});

	it('elimina claves sensibles del context', () => {
		monitor.warn('auth', 'test_sanitize', {
			token: 'secret-token',
			password: '123',
			email: 'user@test.com',
			status: 401,
		});
		const entry = monitor.getRecent(1)[0];
		expect(entry?.context).toEqual({ status: 401 });
	});

	it('trunca strings largos en context', () => {
		const long = 'x'.repeat(600);
		monitor.error('ui', 'long_msg', { message: long });
		const ctx = monitor.getRecent(1)[0]?.context;
		expect(String(ctx?.message).length).toBeLessThanOrEqual(501);
	});

	it('resetForTests limpia el buffer', () => {
		monitor.info('data', 'x');
		monitor.resetForTests();
		expect(monitor.getRecent()).toHaveLength(0);
	});

	it('isEnabled es true en entorno de test (DEV)', () => {
		expect(monitor.isEnabled()).toBe(true);
	});

	it('countByEvent agrupa area/event del buffer', () => {
		monitor.info('cache', 'fetch_ok', { key: 'orders:1' });
		monitor.info('cache', 'fetch_ok', { key: 'clients:1' });
		monitor.info('realtime', 'subscribed', { channel: 'orders' });
		expect(monitor.countByEvent()).toEqual({
			'cache/fetch_ok': 2,
			'realtime/subscribed': 1,
		});
	});
});
