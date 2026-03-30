# Guía del panel admin tenant (CEO / staff)

## Arquitectura

- Entrada SSR: [app/admin/page.tsx](app/admin/page.tsx) → [components/tenant/admin/admin-app.tsx](components/tenant/admin/admin-app.tsx) → `AdminProvider` + [components/tenant/admin/kit/admin/pages/Admin.jsx](components/tenant/admin/kit/admin/pages/Admin.jsx).
- Pestañas y permisos por rol: [lib/tenant-admin-tabs.ts](lib/tenant-admin-tabs.ts) (`TENANT_ADMIN_TAB_IDS`, `DEFAULT_ROLE_NAV_PERMISSIONS`).
- Extensión SaaS de tema admin: [lib/admin-theme-config.ts](lib/admin-theme-config.ts).

## Alcance de este repositorio

- **Incluye:** panel admin del tenant (`/{subdomain}/admin`), APIs Next compartidas, validación de pedidos delivery en servidor, configuración de envíos en el menú del admin.
- **No incluye:** carrito flotante ni modal de checkout del comensal, ni hojas de estilo del menú público antiguo (`Home.css`, `Menu.css`, `Navbar.css`, modal de sucursal para vitrina). Esa UI pertenece al **frontend del menú público** (p. ej. `saas-godcode-admin`). Las rutas públicas como `delivery-quote`, `delivery-geocode` y `public-order-delivery` se mantienen aquí para que ese cliente las consuma.

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
- CSS admin: [app/[subdomain]/styles/AdminLayout.css](app/%5Bsubdomain%5D/styles/AdminLayout.css) (cabecera adaptable ≤900px). Estilos de clientes del panel: solo [app/[subdomain]/styles/AdminClients.css](app/%5Bsubdomain%5D/styles/AdminClients.css) (importado vía `tenant.css`); no mantener copias en `kit/admin/styles/`.

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

## Sucursales vacías

- Si `refreshBranches` no devuelve filas para `company_id`, [AdminProvider.jsx](components/tenant/admin/kit/admin/pages/AdminProvider.jsx) hace `setLoading(false)` para no dejar el panel en spinner; [Admin.jsx](components/tenant/admin/kit/admin/pages/Admin.jsx) muestra el bloque `.admin-empty-branches` con “Reintentar carga” (`refreshBranches`). Las sucursales se gestionan desde el SaaS.

## Delivery (flujo resumido)

- Config y tarifas: [AdminMenuDeliverySection.jsx](components/tenant/admin/kit/admin/components/AdminMenuDeliverySection.jsx) → `branches.delivery_settings` (JSONB) + columnas `branches.origin_lat` / `origin_lng` vía [app/api/tenant-branch-delivery-enabled/route.ts](app/api/tenant-branch-delivery-enabled/route.ts). Zonas por anillo: `delivery_settings.zones[]` (`radiusKm`, `feeFlat`); lógica en [lib/delivery-settings.ts](lib/delivery-settings.ts).

| Clave en `delivery_settings` | Rol |
| --- | --- |
| `deliveryPricingStrategy` | `"distance"` \| `"named_areas"`: define si el precio sale de km/anillos o de `namedAreas` (no se infiere solo por tener filas en comunas). |
| `namedAreaResolution` | Solo si estrategia es `named_areas`: `"manual_select"` (lista en checkout) \| `"address_matched"` (dirección → matching en servidor). |
| `namedAreas[]` | `{ id, name, feeFlat, aliases?: string[] }`: tarifa fija por zona; `aliases` ayudan al matching automático. |
| `pricePerKm`, `baseFee`, `zones`, umbrales | Usados en modo `distance`; en `named_areas` el envío es la tarifa de la fila elegida o resuelta. |

- Cotización: [app/api/delivery-quote/route.ts](app/api/delivery-quote/route.ts) — GPS/haversine en `distance`; `namedAreaId` o `address` según submodo. Resolución pública por texto: [app/api/delivery-geocode/route.ts](app/api/delivery-geocode/route.ts) (caché + rate limit en [lib/delivery-public-limiter.ts](lib/delivery-public-limiter.ts), matching en [lib/delivery-area-resolve.ts](lib/delivery-area-resolve.ts)). El checkout del comensal vive en el proyecto de storefront, no en este repo.
- Tras crear pedido: [app/api/public-order-delivery/route.ts](app/api/public-order-delivery/route.ts) valida tarifa/total, enriquece `delivery_address` (`lat`, `lng`, `maps_url` si hay coords), asigna `orders.handoff_code`.
- Caja / detalle: [CashOrderDetailPanel.jsx](components/tenant/admin/kit/admin/components/caja/CashOrderDetailPanel.jsx) muestra código, dirección, mapa y “Copiar para conductor”.
- Migración columnas: [supabase/migrations/20260329140000_orders_handoff_branch_origin.sql](supabase/migrations/20260329140000_orders_handoff_branch_origin.sql).
- Menú público: el RPC `get_public_branches` debe incluir `origin_lat` y `origin_lng` (y `delivery_settings`) para que el checkout pueda cotizar por GPS.

## Checklist de consistencia (auditoría)

- Cabecera: `content-header` + `header-actions` alineados; mismo patrón de botones.
- Estados: loading con `AdminTabFallback`; errores de pestaña con `AdminErrorBoundary` + reintentar.
- Permisos: mensaje único “Necesitas un rol diferente…”.
- Equipo: `allowed_tabs` por defecto vía `getCashierDefaultAllowedTabIds()` (mismos ids que `DEFAULT_ROLE_NAV_PERMISSIONS.cashier`).

## Añadir una pestaña nueva

1. [lib/tenant-admin-tabs.ts](lib/tenant-admin-tabs.ts): `TENANT_ADMIN_TAB_OPTIONS` + `DEFAULT_ROLE_NAV_PERMISSIONS` si aplica.
2. [AdminSidebar.jsx](components/tenant/admin/kit/admin/components/AdminSidebar.jsx) + rama en [Admin.jsx](components/tenant/admin/kit/admin/pages/Admin.jsx).
3. Gestor SaaS: guardar el mismo `id` en `roleNavPermissions` y documentación al cliente.
