-- Código de entrega / verificación y coordenadas de origen para cotización por distancia real
alter table public.orders add column if not exists handoff_code text;

alter table public.branches add column if not exists origin_lat double precision;
alter table public.branches add column if not exists origin_lng double precision;

create index if not exists idx_orders_handoff_code on public.orders (handoff_code)
	where handoff_code is not null;

comment on column public.orders.handoff_code is 'PIN corto para retiro/delivery (cliente/conductor)';
comment on column public.branches.origin_lat is 'Latitud del local (WGS84) para cotización delivery';
comment on column public.branches.origin_lng is 'Longitud del local (WGS84) para cotización delivery';
