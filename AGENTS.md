# Guía del panel admin tenant (CEO / staff)

## Arquitectura

- Entrada SSR: [app/admin/page.tsx](app/admin/page.tsx) → [components/tenant/admin/admin-app.tsx](components/tenant/admin/admin-app.tsx) → `AdminProvider` + [components/tenant/admin/kit/admin/pages/Admin.jsx](components/tenant/admin/kit/admin/pages/Admin.jsx).
- Pestañas y permisos por rol: [lib/tenant-admin-tabs.ts](lib/tenant-admin-tabs.ts) (`TENANT_ADMIN_TAB_IDS`, `DEFAULT_ROLE_NAV_PERMISSIONS`).
- Extensión SaaS de tema admin: [lib/admin-theme-config.ts](lib/admin-theme-config.ts).

## Inventario `theme_config` → UI

| Clave | Origen / edición | Consumo |
| --- | --- | --- |
| `displayName`, `logoUrl`, colores, fondos | SaaS / empresa | [lib/panel-theme-css.ts](lib/panel-theme-css.ts), layout tenant |
| `roleNavPermissions` | SaaS (`companies.theme_config`) | `AdminProvider`, sidebar, `canAccessTab` |
| `tabLabels` | SaaS (mapa `tabId` → texto) | Títulos H1, `AdminSidebar`, formulario equipo |
| `enabledAdminModuleTabIds` | SaaS (array no vacío = whitelist) | Filtra filas de `saas_admin_modules` en [app/admin/page.tsx](app/admin/page.tsx) |
| `enableSupportTab` | SaaS (`false` = no inyectar módulo tickets si no hay fila BD) | [app/admin/page.tsx](app/admin/page.tsx) |
| `adminShortcutsEnabled` | SaaS (`false` desactiva atajos) | `AdminProvider` → panel de ayuda y listeners |
| `menuCarousel` (+ bloques relacionados) | API [app/api/tenant-menu-carousel/route.ts](app/api/tenant-menu-carousel/route.ts) | Menú público / carrusel |

## Módulos dinámicos (`saas_admin_modules`)

- Catálogo global en Supabase: `tab_id`, `label`, `nav_group`, `nav_order`, `allowed_roles`, `is_active`.
- Tras cargar, se aplica whitelist opcional `theme_config.enabledAdminModuleTabIds`.
- Fallback histórico: si no existe `module:tickets` en BD y `enableSupportTab !== false`, se inyecta el módulo Soporte.

## Breakpoints y layout

- `isMobile` en cliente: `window.innerWidth <= 1024` ([AdminProvider.jsx](components/tenant/admin/kit/admin/pages/AdminProvider.jsx)).
- CSS admin: [app/[subdomain]/styles/AdminLayout.css](app/%5Bsubdomain%5D/styles/AdminLayout.css) (cabecera adaptable ≤900px).

## Atajos de teclado (panel)

| Atajo | Acción |
| --- | --- |
| Mod+K (Cmd en Mac, Ctrl en Win) | Paleta “ir a sección” |
| Mod+Shift+R | Refrescar datos (`loadData`) |
| ? | Ayuda de atajos |
| Esc | Cerrar paleta / ayuda |

No se interceptan teclas con foco en `input`, `textarea`, `select` o `contenteditable` (ver [keyboardAdmin.js](components/tenant/admin/kit/admin/utils/keyboardAdmin.js)).

## Persistencia local

- `localStorage`: `tenant-admin:{companyId}:activeTab`, `tenant-admin:{companyId}:branchId` (respeta sucursal bloqueada por usuario).

## Checklist de consistencia (auditoría)

- Cabecera: `content-header` + `header-actions` alineados; mismo patrón de botones.
- Estados: loading con `AdminTabFallback`; errores de pestaña con `AdminErrorBoundary` + reintentar.
- Permisos: mensaje único “Necesitas un rol diferente…”.
- Equipo: `allowed_tabs` por defecto vía `getCashierDefaultAllowedTabIds()` (mismos ids que `DEFAULT_ROLE_NAV_PERMISSIONS.cashier`).

## Añadir una pestaña nueva

1. [lib/tenant-admin-tabs.ts](lib/tenant-admin-tabs.ts): `TENANT_ADMIN_TAB_OPTIONS` + `DEFAULT_ROLE_NAV_PERMISSIONS` si aplica.
2. [AdminSidebar.jsx](components/tenant/admin/kit/admin/components/AdminSidebar.jsx) + rama en [Admin.jsx](components/tenant/admin/kit/admin/pages/Admin.jsx).
3. Gestor SaaS: guardar el mismo `id` en `roleNavPermissions` y documentación al cliente.
