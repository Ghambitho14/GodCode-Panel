-- Canales de pedido local por sucursal (mesa / retiro / delivery) en delivery_settings JSONB.

UPDATE public.branches
SET delivery_settings = coalesce(delivery_settings, '{}'::jsonb)
  || jsonb_build_object(
    'localOrderChannels', jsonb_build_object(
      'mesa', true,
      'retiro', true,
      'delivery', true
    )
  )
WHERE delivery_settings IS NULL
   OR NOT (delivery_settings ? 'localOrderChannels');

COMMENT ON COLUMN public.branches.delivery_settings IS
  'Config sucursal (JSONB): delivery, upsell, ordersViewMode, localOrderChannels {mesa,retiro,delivery}, etc.';
