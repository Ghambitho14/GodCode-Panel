-- Physical dining tables per branch + link from open sessions
-- Apply on the Supabase instance used by the app (e.g. supabase.ghamnas.online).

CREATE TABLE IF NOT EXISTS public.branch_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  code text NOT NULL,
  label text,
  shape text NOT NULL DEFAULT 'round' CHECK (shape IN ('round', 'square', 'rect')),
  seats integer NOT NULL DEFAULT 4 CHECK (seats >= 1 AND seats <= 50),
  pos_x numeric(8,3) NOT NULL DEFAULT 10,
  pos_y numeric(8,3) NOT NULL DEFAULT 10,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT branch_tables_branch_code_unique UNIQUE (branch_id, code),
  CONSTRAINT branch_tables_code_nonempty CHECK (length(btrim(code)) > 0)
);

CREATE INDEX IF NOT EXISTS branch_tables_branch_id_idx ON public.branch_tables (branch_id);
CREATE INDEX IF NOT EXISTS branch_tables_company_id_idx ON public.branch_tables (company_id);
CREATE INDEX IF NOT EXISTS branch_tables_branch_active_idx ON public.branch_tables (branch_id) WHERE is_active = true;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS table_id uuid REFERENCES public.branch_tables(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_table_id_idx ON public.orders (table_id) WHERE table_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_branch_table_open_idx ON public.orders (branch_id, table_id)
  WHERE table_id IS NOT NULL AND status IN ('pending', 'active', 'completed');

ALTER TABLE public.branch_tables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_full_access ON public.branch_tables;
CREATE POLICY admin_full_access ON public.branch_tables
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS tenant_company_access ON public.branch_tables;
CREATE POLICY tenant_company_access ON public.branch_tables
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.company_id = branch_tables.company_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.company_id = branch_tables.company_id
    )
  );

DROP POLICY IF EXISTS branch_tables_authenticated_company ON public.branch_tables;
CREATE POLICY branch_tables_authenticated_company ON public.branch_tables
  FOR ALL
  USING (company_id = current_user_company_id())
  WITH CHECK (company_id = current_user_company_id());

CREATE OR REPLACE FUNCTION public.set_branch_tables_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_branch_tables_updated_at ON public.branch_tables;
CREATE TRIGGER trg_branch_tables_updated_at
  BEFORE UPDATE ON public.branch_tables
  FOR EACH ROW EXECUTE FUNCTION public.set_branch_tables_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.branch_tables TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
