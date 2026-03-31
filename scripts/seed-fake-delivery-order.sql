-- Pedido demo con delivery para probar tarjetas Kanban.
-- Ejecutar en Supabase → SQL Editor (rol postgres / service).
--
-- Esquema real: `order_type` solo admite 'sale' | 'refund'; el canal de venta va en `channel` ('delivery', 'pos', 'online', 'pickup').

WITH pick AS (
	SELECT b.id AS branch_id, b.company_id
	FROM public.branches b
	WHERE b.company_id IS NOT NULL
	ORDER BY b.id
	LIMIT 1
)
INSERT INTO public.orders (
	branch_id,
	company_id,
	client_name,
	client_phone,
	client_rut,
	items,
	total,
	status,
	channel,
	order_type,
	delivery_fee,
	delivery_address,
	handoff_code,
	payment_type,
	payment_ref,
	note,
	created_at
)
SELECT
	pick.branch_id,
	pick.company_id,
	'María Demo Delivery',
	'+56911112222',
	'12.345.678-9',
	$$[
		{"id":"00000000-0000-0000-0000-000000000001","name":"Hamburguesa clásica","quantity":2,"price":6500,"has_discount":false,"discount_price":null},
		{"id":"00000000-0000-0000-0000-000000000002","name":"Bebida 500ml","quantity":1,"price":2000,"has_discount":false,"discount_price":null,"description":"Cola"}
	]$$::jsonb,
	17500,
	'pending',
	'delivery',
	'sale',
	2500,
	jsonb_build_object(
		'formatted_address', 'Av. Demo 4567, Providencia, Santiago',
		'address', 'Av. Demo 4567',
		'comuna', 'Providencia',
		'maps_url', 'https://www.google.com/maps?q=-33.4372,-70.6176',
		'lat', -33.4372,
		'lng', -70.6176
	),
	'847291',
	'tienda',
	'Efectivo — pedido demo',
	'🧪 Pedido de prueba con delivery.',
	now()
FROM pick
RETURNING id, branch_id, company_id, total, channel, delivery_fee;

-- Para fijar una sucursal concreta, sustituye el CTE pick por:
-- WITH pick AS (SELECT 'TU-UUID-SUCURSAL'::uuid AS branch_id, 'TU-UUID-EMPRESA'::uuid AS company_id)
