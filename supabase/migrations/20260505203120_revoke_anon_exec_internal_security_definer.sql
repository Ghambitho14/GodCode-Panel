-- Security advisors (SECURITY DEFINER callable via PostgREST as anon):
-- Revoke anon EXECUTE on internal/admin/cash/trigger helpers only.
-- Intentionally keep anon EXECUTE on public menu RPCs (create_order_transaction,
-- get_public_menu, get_public_branches, resolve_public_slug_by_custom_domain, etc.).
--
-- RLS "enabled no policy" on several tables remains intentional server-side-only access;
-- see migration comment_rls_tables_intentional_no_policy / advisor docs.

REVOKE EXECUTE ON FUNCTION public.assign_dorante_to_company() FROM anon;

REVOKE EXECUTE ON FUNCTION public.create_role_definition(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_role_definition(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_role_definition(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rebuild_users_role_check_from_definitions() FROM anon;

REVOKE EXECUTE ON FUNCTION public.set_category_order_default() FROM anon;

REVOKE EXECUTE ON FUNCTION public.cash_open_shift(uuid, numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cash_add_movement(uuid, text, numeric, text, text, bigint) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_expected_balance(uuid, numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_shift_balance(uuid, numeric) FROM anon;

REVOKE EXECUTE ON FUNCTION public.trg_apply_inventory_after_order_insert() FROM anon;
