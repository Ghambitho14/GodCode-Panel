import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
	resolve('supabase/migrations/20260723223000_manual_order_atomic_transactions.sql'),
	'utf8',
);

describe('manual order atomic migration contract', () => {
	it('serializa reintentos y conserva una clave única por empresa', () => {
		expect(sql).toContain('create unique index if not exists orders_company_client_request_id_idx');
		expect(sql).toContain('pg_advisory_xact_lock');
		expect(sql).toContain("'idempotentReplay', true");
		expect(sql).toContain("raise exception 'idempotency_conflict'");
	});

	it('crea el pedido y los movimientos dentro de la misma función PostgreSQL', () => {
		const body = sql.slice(
			sql.indexOf('create or replace function public.create_manual_order_atomic_v1'),
			sql.indexOf('comment on function public.create_manual_order_atomic_v1'),
		);
		expect(body).toContain('public.create_order_transaction');
		expect(body).toContain('public.cash_add_movement');
		expect(body).toContain("raise exception 'cash_shift_required'");
		expect(body).toContain("raise exception 'payment_total_mismatch'");
	});

	it('mantiene los agregados legacy derivados del ledger de caja', () => {
		expect(sql).toContain('recalculate_cash_shift_totals_v1');
		expect(sql).toContain('cash_movements_sync_shift_totals_v1');
		expect(sql).toContain("when cm.type = 'sale' and cm.payment_method = 'card'");
	});

	it('envuelve cobro y transición V2 en la misma transacción externa', () => {
		const body = sql.slice(
			sql.indexOf('create or replace function public.settle_and_transition_manual_order_v2'),
			sql.indexOf('-- Keep legacy shift aggregates'),
		);
		expect(body).toContain('public.settle_order_v2');
		expect(body).toContain('public.transition_order_v2');
	});
});
