-- Armador de modificaciones ("Nuevo extra"): un registro por grupo (Relleno, Plaqueta, Proteína…).
-- options: [{id, name}]
-- actions: {quitar|agregar|cambiar: {label, enabled, items}}; items[optionId] = {enabled, price}
--          o, para cambiar, {enabled, targets: {optionId: price}}.
-- Todavía no lo consume la caja ni el menú; solo el panel.

CREATE TABLE IF NOT EXISTS public.menu_modifier_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  scope text NOT NULL DEFAULT 'all' CHECK (scope IN ('all', 'categories', 'products')),
  category_ids uuid[] NOT NULL DEFAULT '{}',
  product_ids uuid[] NOT NULL DEFAULT '{}',
  use_recipe boolean NOT NULL DEFAULT true,
  options jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(options) = 'array'),
  actions jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(actions) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS menu_modifier_groups_company_idx
  ON public.menu_modifier_groups (company_id, sort_order);

ALTER TABLE public.menu_modifier_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_full_access ON public.menu_modifier_groups;
CREATE POLICY admin_full_access ON public.menu_modifier_groups
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS menu_modifier_groups_select_tenant ON public.menu_modifier_groups;
CREATE POLICY menu_modifier_groups_select_tenant ON public.menu_modifier_groups
  FOR SELECT USING (company_id = current_user_company_id());

DROP POLICY IF EXISTS menu_modifier_groups_insert_tenant ON public.menu_modifier_groups;
CREATE POLICY menu_modifier_groups_insert_tenant ON public.menu_modifier_groups
  FOR INSERT WITH CHECK (company_id = current_user_company_id());

DROP POLICY IF EXISTS menu_modifier_groups_update_tenant ON public.menu_modifier_groups;
CREATE POLICY menu_modifier_groups_update_tenant ON public.menu_modifier_groups
  FOR UPDATE USING (company_id = current_user_company_id())
  WITH CHECK (company_id = current_user_company_id());

DROP POLICY IF EXISTS menu_modifier_groups_delete_tenant ON public.menu_modifier_groups;
CREATE POLICY menu_modifier_groups_delete_tenant ON public.menu_modifier_groups
  FOR DELETE USING (company_id = current_user_company_id() AND is_admin());

CREATE OR REPLACE FUNCTION public.set_menu_modifier_groups_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_menu_modifier_groups_updated_at ON public.menu_modifier_groups;
CREATE TRIGGER trg_menu_modifier_groups_updated_at
  BEFORE UPDATE ON public.menu_modifier_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_menu_modifier_groups_updated_at();
