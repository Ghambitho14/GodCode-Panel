-- Cierra rls_disabled_in_public en shift_order_sequences.
-- Sin políticas: deny-by-default para anon/authenticated vía API.
-- Las RPC SECURITY DEFINER del owner siguen operando con normalidad.

ALTER TABLE public.shift_order_sequences ENABLE ROW LEVEL SECURITY;
