-- Aceptar desglose de pago con un solo método (tarjeta/efectivo/online) además de mixto.
-- Antes solo persistía breakdown si v_active >= 2, lo que impedía cobrar pedidos del menú en caja.

CREATE OR REPLACE FUNCTION public.normalize_payment_breakdown_for_total(
  p_breakdown jsonb,
  p_total numeric
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
  v_cash numeric;
  v_card numeric;
  v_online numeric;
  v_sum numeric;
  v_active integer;
BEGIN
  IF p_breakdown IS NULL OR jsonb_typeof(p_breakdown) <> 'object' THEN
    RETURN NULL;
  END IF;

  v_cash := greatest(0, round(coalesce((p_breakdown ->> 'cash')::numeric, 0)));
  v_card := greatest(0, round(coalesce((p_breakdown ->> 'card')::numeric, 0)));
  v_online := greatest(0, round(coalesce((p_breakdown ->> 'online')::numeric, 0)));
  v_sum := v_cash + v_card + v_online;

  v_active := 0;
  IF v_cash > 0 THEN v_active := v_active + 1; END IF;
  IF v_card > 0 THEN v_active := v_active + 1; END IF;
  IF v_online > 0 THEN v_active := v_active + 1; END IF;

  IF v_active < 1 THEN
    RETURN NULL;
  END IF;

  IF abs(v_sum - round(coalesce(p_total, 0))) > 1 THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object('cash', v_cash, 'card', v_card, 'online', v_online);
END;
$function$;
