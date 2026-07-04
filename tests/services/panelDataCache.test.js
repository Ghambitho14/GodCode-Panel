import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	getBranchOrders,
	getCompanyClients,
	invalidateBranchOrders,
	invalidateCompanyClients,
	getBranchInventory,
	invalidateBranchInventory,
	invalidateAllPanelData,
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

	it('sirve inventario desde caché e inFlight dedup y permite invalidate', async () => {
		const fetcher = vi.fn().mockResolvedValue([{ id: 'item1', current_stock: 10 }]);

		const a = await getBranchInventory('b1', fetcher);
		const b = await getBranchInventory('b1', fetcher);

		expect(a).toEqual([{ id: 'item1', current_stock: 10 }]);
		expect(b).toEqual([{ id: 'item1', current_stock: 10 }]);
		expect(fetcher).toHaveBeenCalledTimes(1);

		invalidateBranchInventory('b1');
		const nextFetcher = vi.fn().mockResolvedValue([{ id: 'item1', current_stock: 15 }]);
		const c = await getBranchInventory('b1', nextFetcher);

		expect(c).toEqual([{ id: 'item1', current_stock: 15 }]);
		expect(nextFetcher).toHaveBeenCalledTimes(1);
	});

	it('invalidateAllPanelData limpia todos los datasets cacheados', async () => {
		const ordersFetcher = vi.fn().mockResolvedValue([{ id: 'o1' }]);
		const clientsFetcher = vi.fn().mockResolvedValue([{ id: 'c1' }]);
		const invFetcher = vi.fn().mockResolvedValue([{ id: 'i1' }]);

		await getBranchOrders('co1', 'b1', ordersFetcher);
		await getCompanyClients('co1', clientsFetcher);
		await getBranchInventory('b1', invFetcher);

		invalidateAllPanelData();

		const ordersFetcher2 = vi.fn().mockResolvedValue([{ id: 'o2' }]);
		const clientsFetcher2 = vi.fn().mockResolvedValue([{ id: 'c2' }]);
		const invFetcher2 = vi.fn().mockResolvedValue([{ id: 'i2' }]);

		await getBranchOrders('co1', 'b1', ordersFetcher2);
		await getCompanyClients('co1', clientsFetcher2);
		await getBranchInventory('b1', invFetcher2);

		expect(ordersFetcher2).toHaveBeenCalledTimes(1);
		expect(clientsFetcher2).toHaveBeenCalledTimes(1);
		expect(invFetcher2).toHaveBeenCalledTimes(1);
	});
});
