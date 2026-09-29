-- Número de pedido por empresa (REF del ticket).
-- `orders.id` es una secuencia compartida por todas las empresas: el REF saltaba entre
-- pedidos del mismo local y dejaba entrever el volumen del resto. Ahora cada empresa
-- lleva su propio correlativo en `orders.order_number` (1, 2, 3…), asignado al insertar.

CREATE TABLE IF NOT EXISTS public.company_order_counters (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  last_number integer NOT NULL DEFAULT 0
);

-- Sin políticas: solo lo toca el trigger (SECURITY DEFINER).
ALTER TABLE public.company_order_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.company_order_counters FROM anon, authenticated;

-- Pedidos existentes: se numeran por empresa en orden de creación.
-- Solo se toca order_number; se apaga set_updated_at para no mover updated_at.
ALTER TABLE public.orders DISABLE TRIGGER set_updated_at;

WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY company_id ORDER BY id) AS n
  FROM public.orders
  WHERE company_id IS NOT NULL
)
UPDATE public.orders o
SET order_number = numbered.n
FROM numbered
WHERE o.id = numbered.id
  AND o.order_number IS DISTINCT FROM numbered.n;

ALTER TABLE public.orders ENABLE TRIGGER set_updated_at;

INSERT INTO public.company_order_counters (company_id, last_number)
SELECT company_id, max(order_number)
FROM public.orders
WHERE company_id IS NOT NULL
GROUP BY company_id
ON CONFLICT (company_id) DO UPDATE SET last_number = GREATEST(company_order_counters.last_number, EXCLUDED.last_number);

CREATE UNIQUE INDEX IF NOT EXISTS orders_company_order_number_key
  ON public.orders (company_id, order_number);

-- Al insertar se toma el siguiente número de la empresa (lo que mande el cliente se ignora).
-- Al actualizar no se puede cambiar.
CREATE OR REPLACE FUNCTION public.assign_company_order_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'UPDATE' then
    new.order_number := old.order_number;
    return new;
  end if;

  if new.company_id is null then
    new.order_number := null;
    return new;
  end if;

  insert into public.company_order_counters as c (company_id, last_number)
  values (new.company_id, 1)
  on conflict (company_id) do update set last_number = c.last_number + 1
  returning c.last_number into new.order_number;

  return new;
end;
$function$;

REVOKE ALL ON FUNCTION public.assign_company_order_number() FROM PUBLIC, anon, authenticated;

-- El nombre va después de `trigger_auto_assign_company_to_order` (orden alfabético),
-- que es el que completa company_id cuando viene vacío.
DROP TRIGGER IF EXISTS trigger_zz_assign_company_order_number ON public.orders;
CREATE TRIGGER trigger_zz_assign_company_order_number
  BEFORE INSERT OR UPDATE OF order_number ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.assign_company_order_number();
