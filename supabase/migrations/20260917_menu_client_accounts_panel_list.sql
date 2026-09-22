-- Cuentas del menú digital visibles para el panel del negocio.
--
-- `menu_client_accounts` es deny-all en RLS (RLS forzada, cero políticas, revoke
-- a anon/authenticated) y sus columnas personales están cifradas con una llave
-- que vive fuera de la base, así que el panel no puede leer la tabla ni sacaría
-- nada legible de ella. Esta función expone solo el esqueleto que el panel sí
-- necesita: con qué ficha de `clients` está vinculada la cuenta (de ahí salen
-- nombre, teléfono y métricas, ya en claro) y cuatro datos operativos.
--
-- Nunca devuelve `full_name`, `phone`, `document_raw` ni `email`: esos siguen
-- cifrados y solo los descifra el servidor del menú.
create or replace function public.menu_client_accounts_panel_list(p_company_id uuid)
returns table (
    id uuid,
    client_id uuid,
    preferred_branch_id uuid,
    document_country text,
    is_active boolean,
    last_login_at timestamptz,
    created_at timestamptz
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
    select
        a.id,
        a.client_id,
        a.preferred_branch_id,
        a.document_country,
        a.is_active,
        a.last_login_at,
        a.created_at
    from public.menu_client_accounts a
    where a.company_id = p_company_id
      -- El guardia va dentro y no se confía del parámetro: quien llama tiene que
      -- ser staff de esa misma empresa, igual que `_rls_user_belongs_to_company`.
      and exists (
          select 1
          from public.users u
          where u.auth_user_id = auth.uid()
            and u.company_id = p_company_id
      )
    order by a.created_at desc;
$$;

comment on function public.menu_client_accounts_panel_list(uuid) is
    'Cuentas del menú de una empresa, sin datos personales, para el listado de clientes del panel.';

revoke all on function public.menu_client_accounts_panel_list(uuid) from public;
revoke all on function public.menu_client_accounts_panel_list(uuid) from anon;
grant execute on function public.menu_client_accounts_panel_list(uuid) to authenticated;
