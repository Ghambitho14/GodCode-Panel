-- Table reservations (panel MVP) — apply on the Supabase instance used by the app.

CREATE TABLE IF NOT EXISTS public.table_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  table_id uuid REFERENCES public.branch_tables(id) ON DELETE SET NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  party_size integer NOT NULL DEFAULT 2 CHECK (party_size >= 1 AND party_size <= 50),
  guest_name text NOT NULL DEFAULT '',
  guest_phone text,
  status text NOT NULL DEFAULT 'booked'
    CHECK (status IN ('booked', 'seated', 'cancelled', 'no_show')),
  -- text: orders.id puede ser bigint o uuid según instancia
  order_id text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT table_reservations_ends_after_starts CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS table_reservations_branch_starts_idx
  ON public.table_reservations (branch_id, starts_at);

CREATE INDEX IF NOT EXISTS table_reservations_table_booked_idx
  ON public.table_reservations (table_id, starts_at)
  WHERE status = 'booked' AND table_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS table_reservations_company_id_idx
  ON public.table_reservations (company_id);

CREATE INDEX IF NOT EXISTS table_reservations_order_id_idx
  ON public.table_reservations (order_id)
  WHERE order_id IS NOT NULL;

ALTER TABLE public.table_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_full_access ON public.table_reservations;
CREATE POLICY admin_full_access ON public.table_reservations
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS tenant_company_access ON public.table_reservations;
CREATE POLICY tenant_company_access ON public.table_reservations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.company_id = table_reservations.company_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.company_id = table_reservations.company_id
    )
  );

DROP POLICY IF EXISTS table_reservations_authenticated_company ON public.table_reservations;
CREATE POLICY table_reservations_authenticated_company ON public.table_reservations
  FOR ALL
  USING (company_id = current_user_company_id())
  WITH CHECK (company_id = current_user_company_id());

CREATE OR REPLACE FUNCTION public.set_table_reservations_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_table_reservations_updated_at ON public.table_reservations;
CREATE TRIGGER trg_table_reservations_updated_at
  BEFORE UPDATE ON public.table_reservations
  FOR EACH ROW EXECUTE FUNCTION public.set_table_reservations_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.table_reservations TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
