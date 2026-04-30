-- Cupones: tablas + políticas + RPC (referencia; aplicar en Supabase si no existe).

CREATE TABLE IF NOT EXISTS public.discount_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code text NOT NULL,
  discount_type text NOT NULL CHECK (discount_type IN ('percent', 'fixed_amount')),
  discount_value numeric NOT NULL CHECK (discount_value >= 0),
  scope text NOT NULL DEFAULT 'global' CHECK (scope IN ('global', 'client_only')),
  restricted_client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  min_order_subtotal numeric NOT NULL DEFAULT 0 CHECK (min_order_subtotal >= 0),
  max_redemptions int CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  redemptions_count int NOT NULL DEFAULT 0 CHECK (redemptions_count >= 0),
  max_redemptions_per_client int NOT NULL DEFAULT 1 CHECK (max_redemptions_per_client > 0),
  valid_from timestamptz,
  valid_until timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS discount_coupons_company_code_uidx
  ON public.discount_coupons (company_id, (upper(trim(code))));

CREATE TABLE IF NOT EXISTS public.discount_coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.discount_coupons(id) ON DELETE CASCADE,
  order_id bigint NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  amount_saved numeric NOT NULL CHECK (amount_saved >= 0),
  client_phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coupon_id, order_id)
);

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_coupon_id uuid REFERENCES public.discount_coupons(id) ON DELETE SET NULL;
