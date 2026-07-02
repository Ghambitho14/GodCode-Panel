import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	getBranchOrders,
	getCompanyClients,
	invalidateBranchOrders,
	invalidateCompanyClients,
	resetPanelDataCacheForTests,
} from '@/modules/cash/services/panelDataCache';

afterEach(() => {
	resetPanelDataCacheForTests();
	vi.restoreAllMocks();
});

describe('panelDataCache', () => {
	it('sirve clientes desde caché dentro del TTL (un solo fetch)', async () => {
		const fetcher = vi.fn().mockResolvedValue([{ id: 'c1' }]);

		const a = await getCompanyClients('co1', fetcher);
		const b = await getCompanyClients('co1', fetcher);

		expect(a).toEqual([{ id: 'c1' }]);
		expect(b).toEqual([{ id: 'c1' }]);
		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	it('force vuelve a consultar aunque la caché esté fresca', async () => {
		const fetcher = vi.fn()
			.mockResolvedValueOnce([{ id: 'c1' }])
			.mockResolvedValueOnce([{ id: 'c2' }]);

		await getCompanyClients('co1', fetcher);
		const forced = await getCompanyClients('co1', fetcher, { force: true });

		expect(forced).toEqual([{ id: 'c2' }]);
		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it('invalidateCompanyClients fuerza un refetch', async () => {
		const fetcher = vi.fn()
			.mockResolvedValueOnce([{ id: 'c1' }])
			.mockResolvedValueOnce([{ id: 'c2' }]);

		await getCompanyClients('co1', fetcher);
		invalidateCompanyClients('co1');
		const next = await getCompanyClients('co1', fetcher);

		expect(next).toEqual([{ id: 'c2' }]);
		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it('dedup de peticiones en vuelo para pedidos', async () => {
		let resolveFetch;
		const fetcher = vi.fn(() => new Promise((res) => { resolveFetch = res; }));

		const p1 = getBranchOrders('co1', 'b1', fetcher);
		const p2 = getBranchOrders('co1', 'b1', fetcher);
		resolveFetch([{ id: 'o1' }]);

		const [r1, r2] = await Promise.all([p1, p2]);
		expect(r1).toEqual([{ id: 'o1' }]);
		expect(r2).toEqual([{ id: 'o1' }]);
		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	it('invalidateBranchOrders aísla por sucursal', async () => {
		const fetcher = vi.fn()
			.mockResolvedValueOnce([{ id: 'o1' }])
			.mockResolvedValueOnce([{ id: 'o2' }]);

		await getBranchOrders('co1', 'b1', fetcher);
		invalidateBranchOrders('co1', 'b1');
		const next = await getBranchOrders('co1', 'b1', fetcher);

		expect(next).toEqual([{ id: 'o2' }]);
		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it('sin companyId no cachea (pasa directo al fetcher)', async () => {
		const fetcher = vi.fn().mockResolvedValue([]);
		await getCompanyClients(null, fetcher);
		await getCompanyClients(null, fetcher);
		expect(fetcher).toHaveBeenCalledTimes(2);
	});
});
