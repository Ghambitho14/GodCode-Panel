import { describe, expect, it } from 'vitest';
import { mergeOrdersFromServer } from '@/modules/cash/admin/orders/mergeOrdersFromServer';

describe('mergeOrdersFromServer', () => {
	it('filtra onlyPrev por branch_id al cambiar sucursal', () => {
		const prev = [
			{ id: 'o1', status: 'active', branch_id: 'b1', created_at: '2026-01-02T00:00:00Z' },
			{ id: 'o2', status: 'pending', branch_id: 'b2', created_at: '2026-01-03T00:00:00Z' },
		];
		const server = [
			{ id: 'o3', status: 'pending', branch_id: 'b1', created_at: '2026-01-04T00:00:00Z' },
		];
		const merged = mergeOrdersFromServer(prev, server, 'b1');
		expect(merged.map((o) => o.id)).toEqual(['o3', 'o1']);
	});

	it('conserva estado local más avanzado en el pipeline', () => {
		const prev = [
			{ id: 'o1', status: 'completed', branch_id: 'b1', created_at: '2026-01-02T00:00:00Z' },
		];
		const server = [
			{ id: 'o1', status: 'active', branch_id: 'b1', created_at: '2026-01-02T00:00:00Z' },
		];
		const merged = mergeOrdersFromServer(prev, server, 'b1');
		expect(merged[0].status).toBe('completed');
	});
});
