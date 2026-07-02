-- P3 (DB-ACCESS-AUDIT): reducir el egress de Realtime de `orders`.
--
-- En lugar de una vista o una tabla espejo con trigger (más costosas y riesgosas
-- sobre la tabla crítica del POS), usamos una LISTA DE COLUMNAS en la publicación
-- `supabase_realtime` (soportada desde PostgreSQL 15; este proyecto corre PG17).
-- Así cada evento INSERT/UPDATE deja de incluir el JSONB pesado `items` sin tocar
-- la suscripción del frontend ni la lógica de merge del kanban.
--
-- Postgres no permite editar la lista de columnas de una tabla ya publicada in situ:
-- hay que quitarla y volver a agregarla con la lista deseada (atómico en una sola
-- transacción). La lista incluye `id` (replica identity por defecto = PK), requisito
-- para que UPDATE/DELETE sigan funcionando.
--
-- Reversa:
--   alter publication supabase_realtime drop table public.orders;
--   alter publication supabase_realtime add table public.orders;

alter publication supabase_realtime drop table public.orders;

alter publication supabase_realtime add table public.orders (
	id,
	created_at,
	client_id,
	client_name,
	client_phone,
	client_rut,
	total,
	status,
	payment_type,
	payment_ref,
	note,
	branch_id,
	created_by,
	updated_at,
	company_id,
	order_number,
	channel,
	order_type,
	subtotal,
	tax_total,
	discount_total,
	tip_amount,
	delivery_fee,
	currency,
	paid_status,
	scheduled_for,
	closed_at,
	table_number,
	delivery_address,
	payment_method_specific,
	handoff_code,
	discount_coupon_id,
	shift_id,
	shift_sequence,
	payment_breakdown,
	business_day
);
