import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
	resolve('supabase/migrations/20260724010000_order_lifecycle_v3.sql'),
	'utf8',
);

function functionBody(name, nextMarker) {
	const start = sql.indexOf(`create or replace function public.${name}`);
	const end = nextMarker ? sql.indexOf(nextMarker, start) : sql.length;
	expect(start).toBeGreaterThanOrEqual(0);
	expect(end).toBeGreaterThan(start);
	return sql.slice(start, end);
}

describe('order lifecycle V3 migration contract', () => {
	it('recreates the evidence counter safely when its return type changes', () => {
		const dropIndex = sql.indexOf(
			'drop function if exists public.count_pending_payment_evidence_v2(uuid);',
		);
		const createIndex = sql.indexOf(
			'create or replace function public.count_pending_payment_evidence_v2(',
		);
		expect(dropIndex).toBeGreaterThan(-1);
		expect(createIndex).toBeGreaterThan(dropIndex);
	});

	it('separates settlement policies from evidence and operational status', () => {
		expect(sql).toContain('settlement_trigger text');
		expect(sql).toContain("'cash_confirmation'");
		expect(sql).toContain("'evidence_uploaded'");
		expect(sql).toContain("'gateway_webhook'");
		expect(sql).toContain("'pending_verification'");
	});

	it('settles exactly once and writes payment ledger, order and cash atomically', () => {
		const body = functionBody(
			'settle_order_payment_v3',
			'create or replace function public.settle_and_transition_manual_order_v2',
		);
		expect(body).toContain('for update');
		expect(body).toContain('pg_advisory_xact_lock');
		expect(body).toContain("operation = 'settle_v3'");
		expect(body).toContain('insert into public.order_payment_lines');
		expect(body).toContain('public.cash_add_movement');
		expect(body).toContain("payment_status = 'paid'");
		expect(body).toContain("raise exception 'payment_total_mismatch'");
		expect(body).toContain("raise exception 'payment_evidence_required'");
		expect(body).toContain("raise exception 'cash_confirmation_required'");
		expect(body).toContain("raise exception 'payment_confirmation_required'");
	});

	it('never marks an uploaded proof as settled until its policy can settle it', () => {
		const body = functionBody(
			'attach_public_order_evidence_v1',
			'create or replace function public.transition_order_line_v3',
		);
		expect(body).toContain("v_trigger = 'evidence_uploaded'");
		expect(body).toContain('public.settle_order_payment_v3');
		expect(body).toContain("status = 'pending_verification'");
		expect(body).toContain("else 'pending_verification'");
	});

	it('tracks partial preparation and rejects destructive edits', () => {
		expect(sql).toContain('create table if not exists public.order_lines');
		expect(sql).toContain('quantity_preparing integer');
		expect(sql).toContain('quantity_prepared integer');
		expect(sql).toContain('quantity_served integer');
		expect(sql).toContain("raise exception 'order_line_quantity_locked'");
		expect(sql).toContain("raise exception 'order_line_content_locked'");
		expect(sql).toContain("raise exception 'order_line_changed'");
	});

	it('uses optimistic/idempotent edits and requires refund workflow for overpayment', () => {
		const body = functionBody('update_order_v3', 'alter table public.order_lines enable row level security');
		expect(body).toContain('p_expected_updated_at');
		expect(body).toContain("operation = 'update_v3'");
		expect(body).toContain('public.update_order_transaction');
		expect(body).toContain("raise exception 'quote_changed'");
		expect(body).toContain("raise exception 'refund_required'");
		expect(body).toContain("'fulfillment_changed'");
	});

	it('records authorized refunds and the inverse cash movement atomically', () => {
		const body = functionBody(
			'refund_order_payment_v2',
			'create or replace function public.mark_order_payment_evidence_uploading_v2',
		);
		expect(body).toContain("v_role not in ('owner', 'admin', 'ceo')");
		expect(body).toContain('insert into public.order_payment_refunds');
		expect(body).toContain("operation = 'refund_v2'");
		expect(body).toContain("'expense'");
		expect(body).toContain('payment_balance_minor = v_balance_minor');
		expect(body).toContain("raise exception 'refund_amount_exceeds_payment'");
	});
});
