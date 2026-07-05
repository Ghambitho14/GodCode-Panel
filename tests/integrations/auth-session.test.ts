import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	login,
	logout,
	onAuthEvent,
	getAccessToken,
} from '@/integrations/supabase/auth-session';

function mockResponse(body: Record<string, unknown>, ok = true): Response {
	return {
		ok,
		status: ok ? 200 : 401,
		json: async () => body,
	} as Response;
}

describe('auth-session realtime auth sync', () => {
	beforeEach(() => {
		vi.stubGlobal('fetch', vi.fn());
	});

	afterEach(async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse({}));
		await logout();
		vi.unstubAllGlobals();
	});

	it('emite token_refreshed cuando se refresca el access token', async () => {
		const listener = vi.fn();
		const unsubscribe = onAuthEvent(listener);

		const nowSeconds = Math.floor(Date.now() / 1000);

		(global.fetch as ReturnType<typeof vi.fn>)
			.mockResolvedValueOnce(
				mockResponse({
					access_token: 'initial-token',
					expires_at: nowSeconds - 120,
					user: { id: 'u1', email: 'a@b.com' },
				}),
			)
			.mockResolvedValueOnce(
				mockResponse({
					access_token: 'refreshed-token',
					expires_at: nowSeconds + 3600,
					user: { id: 'u1', email: 'a@b.com' },
				}),
			);

		await login('a@b.com', 'password');
		const token = await getAccessToken();

		expect(token).toBe('refreshed-token');
		expect(listener).toHaveBeenCalledWith('signed_in');
		expect(listener).toHaveBeenCalledWith('token_refreshed');

		unsubscribe();
	});
});
