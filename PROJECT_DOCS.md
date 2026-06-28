# GodCode — Documentación del ecosistema

> Guía educativa para entender cómo funciona el proyecto completo. Escrita como si un arquitecto senior te explicara el código por primera vez.

---

## Tabla de contenidos

1. [Resumen del proyecto](#1-resumen-del-proyecto)
2. [Stack tecnológico](#2-stack-tecnológico)
3. [Arquitectura](#3-arquitectura)
4. [Comunicación frontend ↔ backend](#4-comunicación-frontend--backend)
5. [Base de datos](#5-base-de-datos)
6. [Flujos completos de acciones](#6-flujos-completos-de-acciones)
7. [Conceptos que debés estudiar](#7-conceptos-que-debés-estudiar)
8. [Deuda técnica y cosas confusas](#8-deuda-técnica-y-cosas-confusas)

---

## 1. Resumen del proyecto

### El problema que resuelve

Un restaurante que usa GodCode necesita dos cosas distintas:

1. **Presencia digital y gestión SaaS** — landing pública, menú online con carrito, registro de nuevos clientes (onboarding), pagos de suscripción, portal para que el dueño configure su local, y un panel interno para el equipo de GodCode (super-admin).
2. **Operación diaria del local** — tomar pedidos en mostrador, ver la cocina en un kanban, manejar la caja, inventario, clientes, cupones y reportes.

Ninguna sola app cubre todo. Este repositorio contiene **dos aplicaciones** que comparten la misma base de datos Supabase:

| App | Carpeta | Qué hace | Para quién |
|-----|---------|----------|------------|
| **GodCode SaaS** | `GodCode/` | Landing, menú web, onboarding, super-admin, portal del dueño | Clientes finales, dueños de restaurantes, staff de GodCode |
| **GodCode Caja** | `src/`, `api/` | Panel POS: pedidos, caja, inventario, reportes | Cajeros, cocina, administradores del local |

### Cómo se relacionan

```
Cliente del restaurante          Empleado del local
        |                                |
        v                                v
  {slug}.godcode.me/menu          GodCode Caja (/admin)
        |                                |
        +------------+-------------------+
                     |
                     v
              Supabase (Postgres)
              - Misma tabla `orders`
              - Misma RPC `create_order_transaction`
              - Mismo catálogo de productos
```

**No hay API HTTP entre las dos apps en runtime.** Ambas hablan directo con Supabase. El punto de unión más importante es la función PostgreSQL `create_order_transaction`: el carrito web y el panel de caja la usan para crear pedidos de forma atómica.

### GodCode Caja — módulos del panel

El panel admin tiene pestañas definidas en `src/shared/constants/admin-panel-tabs.ts`:

| ID de pestaña | Label en UI | Qué hace |
|---------------|-------------|----------|
| `orders` | Cocina / Pedidos | Kanban de pedidos, cambio de estados |
| `caja` | Caja | Turnos de caja, movimientos, arqueo |
| `analytics` | Reportes | Gráficos de ventas (d3, lightweight-charts) |
| `local_expenses` | Gastos del local | Gastos operativos |
| `categories` | Categorías | Organización del menú |
| `products` | Menú y carta | Productos vendibles |
| `inventory` | Inventario | Stock y recetas |
| `menu_beverages` | Bebidas | Bebidas del carrito web |
| `menu_extras` | Extras | Extras del carrito web |
| `menu_options` | Opciones de sucursal | Config por sucursal |
| `clients` | Clientes | Base de clientes |
| `coupons` | Cupones | Descuentos |

**Permisos por rol** (por defecto):

- `owner`, `admin`, `ceo` → todas las pestañas
- `cashier` → solo `orders`, `caja`, `local_expenses`

Además hay un módulo dinámico **Soporte** (`module:tickets`) hardcodeado en `src/app.tsx` hasta que se conecte la tabla `saas_admin_modules`.

### GodCode SaaS — áreas principales

| Área | Rutas | Descripción |
|------|-------|-------------|
| Marketing | `/`, `/sobre-godcode` | Landing pública con planes y captura de leads |
| Onboarding | `/onboarding/*` | Registro, verificación de email, pago, activación |
| Tenant storefront | `{slug}.godcode.me/`, `/menu` | Home y menú digital del restaurante |
| Customer portal | `/cuenta` | Dueño gestiona cuenta, billing, tema de tienda |
| Super-admin | `/dashboard`, `/companies`, `/plans`, … | Staff de GodCode administra la plataforma |
| Auth | `/login`, `/post-login` | Login con redirección según rol |

### Entry points

**GodCode Caja** arranca en `src/main.tsx` → `src/app.tsx`:

```56:75:src/app.tsx
export function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<LoginShell displayName="GodCode Caja" />} />
          <Route
            path="/admin"
            element={
              <AdminApp
                companyName="GodCode Caja"
                dynamicModules={DEFAULT_DYNAMIC_MODULES}
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
```

Solo dos rutas: `/` (login) y `/admin` (panel completo). Todo lo demás redirige al login.

**GodCode SaaS** arranca en `GodCode/app/layout.tsx` con el App Router de Next.js 16. El routing multi-tenant lo maneja `GodCode/proxy.ts` (reemplazo de `middleware.ts` en Next 16).

---

## 2. Stack tecnológico

### GodCode Caja (`package.json` en la raíz)

| Librería | Qué es | Por qué está acá | Sin ella… |
|----------|--------|------------------|-----------|
| **React 19** | Librería UI | Base de toda la interfaz del panel | No hay app |
| **Vite 8** | Bundler y dev server | Build rápido, HMR, plugin PWA y BFF en dev | Tendrías que usar webpack o similar, más lento |
| **react-router-dom 7** | Routing cliente | Rutas `/` y `/admin` | Toda la navegación en una sola página sin URLs |
| **@supabase/supabase-js** | Cliente Supabase | Acceso a Postgres, Realtime, Storage, Edge Functions | Sin backend; tendrías que construir API propia |
| **@vercel/node** | Runtime serverless | Handlers del BFF de auth en `api/auth/` | No hay login seguro con cookies httpOnly en prod |
| **vite-plugin-pwa** | Service Worker | La caja se instala como app standalone en tablet | Solo funciona en el browser, sin offline parcial |
| **d3** | Gráficos custom | Reportes (`RPTRosenBarChart`, `RPTRosenDonutChart`) | Reportes sin gráficos o con librería más pesada |
| **lightweight-charts** | Gráficos de series temporales | Reporte de ventas (`RPTSalesLightweightChart`) | Sin gráfico de evolución de ventas |
| **Tailwind CSS 4** | Utility CSS | Componentes nuevos como `ManualOrderModal` | Más CSS manual para componentes nuevos |
| **lucide-react** | Iconos | Login, sidebar, acciones del panel | Iconos SVG inline o otra librería |
| **framer-motion** | Animaciones | Transiciones en componentes selectos | UI más estática |
| **clsx + tailwind-merge + cva** | Composición de clases | Helper `cn()` en `src/lib/utils.ts` | Clases condicionales más verbosas |
| **TypeScript 6** | Tipado estático | Archivos `.ts`/`.tsx` nuevos; `allowJs` para legacy | Menos seguridad en código nuevo |
| **Vitest + Testing Library** | Tests unitarios | `pnpm test` | Sin tests automatizados en Caja |
| **Playwright** | Tests E2E | `pnpm test:e2e` | Sin pruebas de flujo completo |

**Package manager:** `pnpm` (ver `AGENTS.md`).

**Variables de entorno clave:**

- `VITE_SUPABASE_URL` — URL del proyecto Supabase
- `VITE_SUPABASE_ANON_KEY` — clave pública (anon) de Supabase

### GodCode SaaS (`GodCode/package.json`)

| Librería | Qué es | Por qué está acá | Sin ella… |
|----------|--------|------------------|-----------|
| **Next.js 16** | Framework full-stack | App Router, SSR, ISR, API routes, `proxy.ts` | Sin server-side rendering ni API integrada |
| **React 19** | Librería UI | Componentes de landing, menú, admin | No hay interfaz |
| **@supabase/supabase-js + @supabase/ssr** | Cliente + cookies SSR | Auth con cookies en servidor y browser | Auth manual con JWT en localStorage (menos seguro) |
| **zustand** | State management | Carrito persistente (`cart-store.ts`) | Estado del carrito se pierde al refrescar |
| **@tanstack/react-query** | Cache de datos async | Super-admin y portal del dueño | Más `useEffect` + `fetch` manuales |
| **stripe** | Pagos con tarjeta | Onboarding y suscripciones | Sin cobro automático por tarjeta |
| **@paypal/paypal-server-sdk** | Pagos PayPal | Onboarding alternativo | Sin opción PayPal |
| **next-intl** | Internacionalización | Landing en 6 idiomas (es, en, pt, fr, de, it) | Solo español |
| **zod + react-hook-form** | Validación de formularios | Onboarding, configuración admin | Validación manual propensa a errores |
| **Tailwind CSS 4** | Utility CSS | Admin, landing, componentes UI | CSS más verboso |
| **leaflet** | Mapas | Selector de dirección en delivery | Sin mapa interactivo |
| **chart.js + react-chartjs-2** | Gráficos | Dashboard super-admin | Sin visualizaciones en admin |
| **dompurify** | Sanitización HTML | Contenido de usuario seguro | Riesgo XSS en contenido renderizado |
| **currency.js** | Aritmética monetaria | Cálculos de precios sin errores de float | Errores de redondeo en montos |
| **rut.js** | Validación RUT chileno | Formularios de cliente | Validación manual de documentos |
| **Vitest + Playwright** | Tests | `GodCode/__tests__/` | Sin cobertura automatizada |

**Package manager en README:** `npm` (nota: el panel Caja usa `pnpm`; hay inconsistencia documentada en §8).

**Variables de entorno clave:**

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — bypass RLS en servidor
- `NEXT_PUBLIC_TENANT_BASE_DOMAIN` — ej. `godcode.me`
- `NEXT_PUBLIC_APP_URL` — URL canónica (ej. `https://www.godcode.me`)

---

## 3. Arquitectura

### Estructura del monorepo

```
GodCode-Panel/                    ← Raíz del monorepo
├── src/                          ← ★ GodCode Caja (SPA Vite)
│   ├── main.tsx                  # Punto de entrada React
│   ├── app.tsx                   # Rutas: / y /admin
│   ├── integrations/supabase/    # Cliente, auth-session, TABLES
│   ├── modules/
│   │   ├── auth/                 # Login (login-shell, login-form)
│   │   └── cash/                 # ★ Dominio principal (~150 archivos)
│   │       ├── admin/            # AdminProvider, páginas, servicios
│   │       ├── components/       # UI: caja, pedidos, inventario, modales
│   │       ├── hooks/            # useCashSystem, useManualOrder, etc.
│   │       ├── services/         # tickets, broadcasts, geocode
│   │       ├── context/          # LocationContext, BusinessContext
│   │       └── styles/           # CSS plano global (legacy)
│   ├── shared/                   # utils, constants, types
│   └── lib/                      # delivery-settings, geo, cupones
├── api/                          # BFF Vercel (solo auth)
│   ├── auth/                     # login, logout, refresh, session
│   └── _lib/                     # http, supabase, rate-limit
├── vite/bff-dev-plugin.ts        # Monta BFF en dev (pnpm dev)
├── supabase/functions/           # Edge Functions compartidas
│   ├── tenant-tickets/
│   ├── tenant-broadcasts/
│   └── geocode/
├── public/                       # Assets estáticos, sonidos, logos
├── vercel.json                   # SPA fallback + security headers
├── AGENTS.md                     # Reglas para agentes de IA
└── GodCode/                      # ★ GodCode SaaS (Next.js 16)
    ├── app/
    │   ├── (auth)/               # login, post-login
    │   ├── (super-admin)/        # dashboard, companies, plans, tickets…
    │   ├── (customer-portal)/    # /cuenta
    │   ├── [subdomain]/          # storefront del tenant
    │   ├── onboarding/           # funnel de registro
    │   ├── api/                  # ~76 route handlers
    │   └── layout.tsx
    ├── components/
    │   ├── tenant/               # menú, carrito, delivery, shell
    │   ├── super-admin/          # admin shell, companies, plans
    │   ├── customer-portal/      # portal del dueño
    │   ├── landing/              # marketing
    │   └── onboarding/           # formularios de registro
    ├── lib/                      # lógica server-side de dominio
    ├── utils/supabase/           # clientes browser/server
    ├── proxy.ts                  # routing multi-tenant
    ├── types/supabase-database.ts # tipos generados del schema
    └── services/onboarding-billing/  # microservicio opcional
```

### Capas dentro de GodCode Caja (`src/modules/cash/`)

| Capa | Carpeta | Responsabilidad |
|------|---------|-----------------|
| **Shell / páginas** | `admin/pages/`, `admin-app.tsx`, `app-shell.tsx` | Layout, estado global, routing de pestañas |
| **Componentes** | `components/`, `components/caja/`, `components/manual-order/` | UI pura |
| **Hooks** | `hooks/` | Orquestación de lógica de negocio |
| **Servicios** | `services/`, `admin/orders/services/` | Lectura/escritura en Supabase |
| **Context** | `context/` | Scope de sucursal y empresa |
| **Estilos** | `styles/*.css` | CSS plano global (sin CSS Modules) |

### Capas dentro de GodCode SaaS

| Capa | Carpeta | Responsabilidad |
|------|---------|-----------------|
| **Pages (RSC)** | `app/` | Server Components que cargan datos |
| **Componentes cliente** | `components/tenant/`, `components/super-admin/` | UI interactiva |
| **Lógica server** | `lib/` | Dominio, infra, delivery, onboarding |
| **API routes** | `app/api/` | Endpoints HTTP del SaaS |
| **Utils** | `utils/` | Helpers compartidos, cache de tenant |

### Diagrama ASCII — flujo general del ecosistema

```
                    INTERNET
                       |
         +-------------+-------------+
         |                           |
         v                           v
  {slug}.godcode.me            caja deploy
  www.godcode.me                    |
         |                           |
         v                           v
  +-------------+            +-------------+
  |  GodCode    |            | GodCode     |
  |  (Next.js)  |            | Caja (Vite) |
  +------+------+            +------+------+
         |                           |
    proxy.ts                   auth-session.ts
    (subdominios)              (BFF cookies)
         |                           |
    /api/* (76 rutas)          /api/auth/* (4 rutas)
         |                           |
         +-------------+-------------+
                       |
                       v
              +----------------+
              |    Supabase    |
              |                |
              |  GoTrue (Auth) |
              |  PostgREST     |
              |  Realtime      |
              |  Edge Functions|
              |  Storage       |
              +-------+--------+
                      |
                      v
              +----------------+
              |   PostgreSQL   |
              |   + RLS        |
              |   + RPCs       |
              +----------------+
```

### Multi-tenant en GodCode SaaS

Cuando un usuario visita `pizzeria.godcode.me/menu`:

1. `GodCode/proxy.ts` extrae el subdominio `pizzeria`
2. Reescribe internamente a `/pizzeria/menu` (ruta `[subdomain]/menu/page.tsx`)
3. Inyecta header `x-tenant-slug: pizzeria`
4. La página busca `companies` donde `public_slug = 'pizzeria'`
5. Carga menú vía RPC `get_public_menu` (cacheado 60s con ISR)

También soporta dominios custom (`companies.custom_domain`) y path prefix en dominio principal (`www.godcode.me/pizzeria/menu`).

---

## 4. Comunicación frontend ↔ backend

Este ecosistema **no usa un solo canal** de comunicación. Hay cuatro canales distintos según la app y el tipo de dato.

### Canal A — BFF de autenticación (solo GodCode Caja)

El panel Caja **nunca** llama a `supabase.auth.*` en el frontend. La autenticación pasa por un BFF (Backend for Frontend) que guarda el refresh token en una cookie httpOnly.

#### Endpoints

| Endpoint | Método | Archivo | Qué hace |
|----------|--------|---------|----------|
| `/api/auth/login` | POST | `api/auth/login.ts` | Valida credenciales, setea cookie `gc_rt` |
| `/api/auth/session` | GET | `api/auth/session.ts` | Restaura sesión al cargar / F5 |
| `/api/auth/refresh` | POST | `api/auth/refresh.ts` | Renueva access token desde cookie |
| `/api/auth/logout` | POST | `api/auth/logout.ts` | Revoca sesión y borra cookie |

#### Headers y seguridad

- **CSRF:** todos los POST exigen header `X-GC-Auth: 1` y que `Origin` coincida con `Host` (ver `api/_lib/http.ts`)
- **Cookie:** `gc_rt` — HttpOnly, SameSite=Lax, Secure en prod, Max-Age=30 días
- **Access token:** solo en memoria del browser (nunca en localStorage)

```48:66:api/_lib/http.ts
/**
 * Defensa CSRF barata para endpoints que dependen de la cookie (refresh/logout):
 * - Exige cabecera propia `X-GC-Auth` (un fetch cross-site no puede setearla sin CORS).
 * - Valida que el Origin sea el mismo host del request.
 * Devuelve true si la peticion es legitima.
 */
export function passesCsrfCheck(req: VercelRequest): boolean {
  if (req.headers["x-gc-auth"] !== "1") return false;
  const origin = req.headers.origin;
  // M2: POST cross-site siempre envía Origin; sin Origin rechazamos (excepto GET implícito).
  if (!origin) return false;
  try {
    const originHost = new URL(String(origin)).host;
    const host = String(req.headers.host ?? "");
    return Boolean(host) && originHost === host;
  } catch {
    return false;
  }
}
```

#### Ejemplo real: login

**Request** (desde `src/integrations/supabase/auth-session.ts`):

```typescript
// POST /api/auth/login
fetch("/api/auth/login", {
  method: "POST",
  credentials: "include",
  headers: {
    "Content-Type": "application/json",
    "X-GC-Auth": "1",
  },
  body: JSON.stringify({
    email: "cajero@restaurante.cl",
    password: "********",
  }),
});
```

**Response 200** (desde `api/auth/login.ts` → `jsonSession`):

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "expires_at": 1719590400,
  "user": {
    "id": "uuid-del-usuario",
    "email": "cajero@restaurante.cl"
  }
}
```

**Response headers:**

```
Set-Cookie: gc_rt=refresh-token-aqui; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000; Secure
```

**Response 401:**

```json
{ "error": "Credenciales incorrectas." }
```

**Response 429** (rate limit):

```json
{ "error": "Demasiados intentos. Intenta más tarde." }
```

#### Dev vs producción

- **Dev:** `vite/bff-dev-plugin.ts` monta los mismos handlers como middleware de Vite → un solo `pnpm dev`
- **Prod:** Vercel ejecuta `api/auth/*.ts` como serverless functions

#### Cómo el access token llega a Supabase

```62:64:src/integrations/supabase/client.ts
export const supabase: SupabaseClient = createClient(url, anonKey, {
  accessToken: () => getAccessToken(),
});
```

Al pasar `accessToken`, el namespace `supabase.auth` queda **deshabilitado**. Cada llamada a PostgREST, Realtime o Storage adjunta el JWT automáticamente.

---

### Canal B — PostgREST + RPC directo (ambas apps)

La mayoría de los datos de negocio van **directo del browser al API de Supabase**, sin pasar por un backend propio.

#### GodCode Caja

- Cliente: `src/integrations/supabase/client.ts`
- Credencial: `VITE_SUPABASE_ANON_KEY` + JWT del BFF
- Patrones:
  - **CRUD directo:** `supabase.from(TABLES.orders).select(...)`
  - **RPC atómico:** `supabase.rpc('create_order_transaction', {...})`
  - **Realtime:** canales en `AdminProvider.jsx`, `useCashSystem.js`
  - **Storage:** subida de imágenes a Cloudinary (no Supabase Storage)

#### GodCode SaaS

- Cliente browser: `GodCode/utils/supabase/client.ts`
- Dos scopes de cookies:
  - `sb-super-admin-auth-token` — login en dominio principal (`/login`, `/dashboard`, `/cuenta`)
  - `sb-tenant-auth-token` — browsing en subdominio tenant
- El scope se resuelve automáticamente según host y pathname
- **Usa `supabase.auth.*` directamente** (diferente a Caja)

```50:51:GodCode/utils/supabase/client.ts
const getCookieName = (scope: SupabaseAuthScope) =>
  scope === "super-admin" ? "sb-super-admin-auth-token" : "sb-tenant-auth-token";
```

#### Realtime en Caja

Cuando llega un pedido nuevo, `AdminProvider.jsx` escucha cambios en la tabla `orders`:

```javascript
// AdminProvider.jsx ~línea 1222
.channel(`orders-realtime-${selectedBranchId}`)
.on('postgres_changes', {
  event: '*',
  schema: 'public',
  table: 'orders',
  filter: selectedBranchId !== 'all' ? `branch_id=eq.${selectedBranchId}` : undefined,
})
```

Esto actualiza el kanban sin que el usuario tenga que refrescar la página.

---

### Canal C — Next.js API routes (solo GodCode SaaS)

GodCode expone ~76 route handlers en `GodCode/app/api/`. Todos usan el wrapper `withApiHandler()` de `GodCode/lib/api/api-handler.ts` para errores JSON consistentes.

#### Tabla de prefijos

| Prefijo | Ejemplos | Para qué |
|---------|----------|----------|
| `/api/onboarding/*` | `apply`, `verify`, `checkout`, `finalize`, `stripe-webhook` | Registro y pago de nuevos clientes |
| `/api/super-admin/*` | `companies-search`, `plans`, `payments/validate`, `audit-log` | Gestión interna de GodCode |
| `/api/customer-account/*` | `billing`, `branches`, `store-theme/publish`, `plan-change` | Portal del dueño |
| `/api/geo/*` | `delivery-quote`, `address-search`, `reverse-geocode`, `discount-coupon-preview` | Delivery y geocoding |
| `/api/tenant/*` | `tickets`, `broadcasts`, `public-order-delivery`, `staff` | Operaciones tenant |
| `/api/landing/*` | `contact`, `leads` | Formularios de marketing |
| `/api/auth/*` | `signout`, `super-admin-user` | Auth auxiliar del SaaS |
| `/api/system/*` | `health`, `cron/subscription-status` | Salud y crons |
| `/api/analytics/events` | — | Eventos de página |
| `/api/revalidate-menu` | — | Invalidar cache ISR del menú |

#### Ejemplo real: cotización de delivery

**Request** (desde el carrito web):

```typescript
// POST /api/geo/delivery-quote
fetch("/api/geo/delivery-quote", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    branchId: "uuid-sucursal",
    lat: -33.4489,
    lng: -70.6693,
    subtotal: 15000,
  }),
});
```

**Response 200** (simplificado):

```json
{
  "fee": 2500,
  "currency": "CLP",
  "mode": "distance",
  "label": "Envío a 3.2 km"
}
```

Este endpoint es **público** (sin auth) y usa `supabaseAdmin` (service role) para leer configuración de la sucursal.

#### Onboarding con proxy opcional

Muchas rutas `/api/onboarding/*` pueden reenviarse a un microservicio separado (`services/onboarding-billing/`) según el feature flag `FF_ONBOARDING_BILLING_EXTERNAL` (`off` / `on` / `proxy_only`).

---

### Canal D — Edge Functions (desde GodCode Caja)

Para operaciones que necesitan tablas SaaS con RLS restrictivo, Caja invoca Edge Functions de Supabase:

| Function | Archivo | Invocada desde | Qué hace |
|----------|---------|----------------|----------|
| `tenant-tickets` | `supabase/functions/tenant-tickets/` | `src/modules/cash/services/ticketsService.js` | Tickets de soporte |
| `tenant-broadcasts` | `supabase/functions/tenant-broadcasts/` | `src/modules/cash/services/broadcastsService.js` | Anuncios de GodCode |
| `geocode` | `supabase/functions/geocode/` | `src/modules/cash/services/geocodeService.js` | Geocoding para delivery |

```javascript
// broadcastsService.js
const response = await supabase.functions.invoke('tenant-broadcasts', { method: 'GET' });
```

`supabase.functions.invoke` adjunta automáticamente `Authorization: Bearer <jwt>` del usuario logueado. La Edge Function usa `SUPABASE_SERVICE_ROLE_KEY` internamente para leer tablas que el JWT del usuario no puede.

**Por qué existen:** evitan que Caja dependa de llamar al SaaS Next.js cross-domain (CORS, cookies distintas). Son el reemplazo de rutas legacy `/api/tenant/broadcasts` del panel viejo.

---

### Resumen: diferencia de auth entre apps

| Aspecto | GodCode Caja | GodCode SaaS |
|---------|--------------|--------------|
| Refresh token | Cookie httpOnly `gc_rt` | Cookie `sb-*-auth-token` (SSR) |
| Access token | Solo en memoria | Gestionado por `@supabase/ssr` |
| `supabase.auth` en frontend | **Prohibido** | **Usado directamente** |
| BFF propio | Sí (`/api/auth/*`) | No (usa Supabase SSR) |
| Scopes | Uno (usuario del local) | Dos (`super-admin`, `tenant`) |

---

## 5. Base de datos

### Cómo se conecta cada app

| Cliente | Archivo | Credencial | Bypass RLS |
|---------|---------|------------|------------|
| Caja browser | `src/integrations/supabase/client.ts` | `VITE_SUPABASE_ANON_KEY` + JWT BFF | No |
| GodCode browser | `GodCode/utils/supabase/client.ts` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` + cookie | No |
| GodCode server (público) | `GodCode/utils/supabase/server.ts` → `createSupabasePublicServerClient()` | Anon key, sin sesión | No |
| GodCode server (admin) | `GodCode/lib/infra/supabase-admin.ts` | `SUPABASE_SERVICE_ROLE_KEY` | **Sí** |
| Edge Functions | Dentro de cada `index.ts` | `SUPABASE_SERVICE_ROLE_KEY` | **Sí** |
| BFF Caja | `api/_lib/supabase.ts` | Anon key server-side | No (usa credenciales del usuario) |

El cliente admin es un Proxy lazy:

```27:31:GodCode/lib/infra/supabase-admin.ts
export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
	get(_target, prop, receiver) {
		return Reflect.get(getClient(), prop, receiver);
	},
});
```

### Constante TABLES (Caja)

Caja usa nombres de tabla centralizados en `src/integrations/supabase/tables.ts` — **nunca strings sueltos**:

```5:27:src/integrations/supabase/tables.ts
export const TABLES = Object.freeze({
  companies: "companies",
  branches: "branches",
  categories: "categories",
  category_branch: "category_branch",
  products: "products",
  product_prices: "product_prices",
  product_branch: "product_branch",
  orders: "orders",
  clients: "clients",
  client_addresses: "client_addresses",
  users: "users",
  cash_shifts: "cash_shifts",
  cash_movements: "cash_movements",
  admin_users: "admin_users",
  inventory_items: "inventory_items",
  inventory_branch: "inventory_branch",
  inventory_movements: "inventory_movements",
  product_inventory_recipe: "product_inventory_recipe",
  hero_banners: "hero_banners",
  discount_coupons: "discount_coupons",
  discount_coupon_redemptions: "discount_coupon_redemptions",
});
```

### Tablas por dominio

Fuente completa de tipos: `GodCode/types/supabase-database.ts` (~40+ tablas).

| Grupo | Tablas | Qué guardan | Quién las usa |
|-------|--------|-------------|---------------|
| **Tenant core** | `companies`, `branches`, `users` | Empresa, sucursales, empleados | Ambas |
| **Catálogo** | `categories`, `category_branch`, `products`, `product_prices`, `product_branch` | Menú y precios por sucursal | Ambas |
| **Pedidos** | `orders`, `order_items`, `order_payments`, `order_status_history` | Pedidos y su historial | Ambas |
| **Clientes** | `clients`, `client_addresses` | Datos de clientes finales | Ambas |
| **Caja** | `cash_shifts`, `cash_movements`, `cash_reconciliations` | Turnos y movimientos de caja | Principalmente Caja |
| **Inventario** | `inventory_items`, `inventory_branch`, `inventory_movements`, `product_inventory_recipe` | Stock y recetas | Caja |
| **Marketing** | `hero_banners`, `business_info` | Banners y datos del local | GodCode (storefront) |
| **Cupones** | `discount_coupons`, `discount_coupon_redemptions` | Descuentos y usos | Ambas |
| **SaaS / billing** | `plans`, `addons`, `company_addons`, `onboarding_applications`, `payments_history`, `plan_payment_methods` | Suscripciones y pagos | GodCode |
| **Admin GodCode** | `admin_users`, `admin_audit_logs`, `role_definitions`, `saas_admin_modules` | Staff interno de GodCode | GodCode super-admin |
| **Soporte** | `saas_tickets`, `saas_ticket_messages`, `saas_broadcasts`, `saas_broadcast_reads` | Tickets y anuncios | Edge Functions + ambas UIs |

### RPCs clave (funciones PostgreSQL)

| RPC | Qué hace | Usada por |
|-----|----------|-----------|
| `create_order_transaction` | Crea pedido + items + cliente + descuenta inventario + cupón en una transacción | Caja y menú web |
| `update_order_transaction` | Edita pedido con revalidación de precios en servidor | Caja |
| `get_public_menu` | Menú público filtrado por sucursal y disponibilidad | GodCode storefront |
| `get_public_branches` | Sucursales visibles públicamente | GodCode storefront |
| `cash_open_shift` | Abre turno de caja | Caja |
| `cash_add_movement` | Registra movimiento de caja | Caja |
| `resolve_public_slug_by_custom_domain` | Resuelve tenant por dominio custom | GodCode proxy |
| `current_user_company_id` | Devuelve company_id del JWT | RLS helpers |

La definición SQL de `create_order_transaction` está en `GodCode/_tmp/q.sql` (no en migraciones formales).

### Row Level Security (RLS)

Toda la seguridad multi-tenant depende de **RLS en Postgres**:

- Cada tabla filtra por `company_id` derivado del JWT del usuario
- `users.auth_user_id` vincula el usuario de Supabase Auth con el perfil del local
- `AdminApp` resuelve `company_id` consultando `users` por `auth_user_id` o email
- `AdminProvider.verifyAdminAccessCore` valida que el rol ∈ `{owner, admin, ceo, cashier}`

Si RLS está mal configurado, un usuario podría ver datos de otro restaurante. **No hay segunda capa de autorización en un backend propio** para la mayoría de operaciones.

### Migraciones

**No hay carpeta `supabase/migrations/` en este repo.** El esquema se gestiona externamente (dashboard Supabase o MCP). Solo existen:

- Tipos generados: `GodCode/types/supabase-database.ts`
- SQL ad-hoc: `GodCode/_tmp/q.sql`, `GodCode/_tmp/migration_query_only.sql`
- Edge Functions: `supabase/functions/`

Esto es un riesgo de **drift** entre entornos si no se documentan los cambios de schema fuera del repo.

---

## 6. Flujos completos de acciones

### Flujo A: Crear pedido manual en Caja

Este es el flujo principal del panel operativo. Un cajero toma un pedido en mostrador.

```
[Click "Nuevo pedido"]
        |
        v
components/ManualOrderModal.jsx  ← UI del modal
        |
        v
useManualOrder.js             ← Orquestador (cart, form, cupón, recibo)
        |
        v
Validación cliente            ← RUT, teléfono, dirección si es delivery
        |
        v
orders.js → createOrder()     ← Re-fetch precios autoritativos (anti-tampering)
        |
        v
supabase.rpc('create_order_transaction', {...})
        |
        v
PostgreSQL (transacción atómica)
  ├── INSERT orders
  ├── INSERT order_items
  ├── UPSERT clients
  ├── UPDATE inventory (recetas)
  └── INSERT discount_coupon_redemptions (si cupón)
        |
        v
Realtime INSERT en orders
        |
        v
AdminProvider.jsx             ← Canal orders-realtime-{branchId}
        |
        v
Kanban actualizado + sonido de notificación
```

**Paso a paso con archivos:**

1. **Click "Nuevo pedido"** → abre `src/modules/cash/components/ManualOrderModal.jsx`

2. **Estado del formulario** → `src/modules/cash/hooks/useManualOrder.js` orquesta:
   - `useManualOrderCart.js` — items del pedido
   - `useManualOrderForm.js` — datos del cliente
   - `useCouponValidation.js` — cupón de descuento
   - `useReceiptUpload.js` — comprobante de transferencia

3. **Submit** → `useManualOrder.submitOrder()` valida RUT, teléfono, dirección de delivery

4. **Anti-tampering de precios** → `orders.js` re-consulta precios desde `product_prices`, `product_branch`, `products` en servidor. El frontend no puede mandar precios inventados.

5. **RPC atómica** → llamada real al código:

```520:539:src/modules/cash/admin/orders/services/orders.js
            const { data: newOrder, error: orderError } = await supabase.rpc('create_order_transaction', {
                p_client_name: orderData.client_name,
                p_client_phone: clientPhone,
                p_client_rut: clientRut,
                p_items: normalizedItems,
                p_total: totalForRpc,
                p_payment_type: orderData.payment_type,
                p_payment_ref: paymentRef,
                p_payment_method_specific: orderData.payment_method_specific ?? null,
                p_note: finalNote,
                p_branch_id: orderData.branch_id,
                p_company_id: orderData.company_id || null,
                p_status: orderData.status || 'pending',
                p_order_type: resolveRpcOrderType(orderData),
                p_delivery_address: pDeliveryPayload,
                p_delivery_fee: deliveryMode ? deliveryFee : 0,
                p_coupon_code: pCouponCode,
                p_payment_breakdown: resolvePaymentBreakdownForRpc(orderData.payment_breakdown, totalForRpc),
                p_client_id: selectedClientId,
            });
```

6. **Realtime** → `AdminProvider.jsx` recibe el INSERT en el canal `orders-realtime-${branchId}` y actualiza el kanban

7. **Feedback** → `src/modules/cash/admin/utils/playOrderNotificationSound.js` reproduce sonido; el pedido aparece en la columna correspondiente

---

### Flujo B: Pedido desde menú web (GodCode)

Un cliente final pide desde el celular en `{slug}.godcode.me/menu`.

```
[Usuario abre menú]
        |
        v
proxy.ts                      ← Rewrite a /[subdomain]/menu
        |
        v
menu/page.tsx (Server Component)
  ├── getCachedCompany(slug)
  ├── getCachedMenuStaticData()
  ├── getCachedMenuRpcData()  ← RPC get_public_menu (cache 60s)
  └── Renderiza menu-client.tsx
        |
        v
cart-store.ts (Zustand)       ← Agrega productos al carrito (localStorage)
        |
        v
[Checkout]
        |
        v
POST /api/geo/delivery-quote  ← Si es delivery: cotiza envío
        |
        v
orders-service.ts → createOrder()
        |
        v
supabase.rpc('create_order_transaction', { p_order_origin: 'web', ... })
        |
        v
POST /api/tenant/public-order-delivery  ← Patch metadata delivery (server-side)
        |
        v
WhatsApp message + cart-success-view.tsx
```

**Paso a paso con archivos:**

1. **DNS** → `pizzeria.godcode.me/menu` → `GodCode/proxy.ts` reescribe a `/pizzeria/menu`

2. **Server load** → `GodCode/app/[subdomain]/menu/page.tsx`:
   - `getCachedCompany(slug)` → datos de la empresa
   - `getCachedMenuRpcData()` → menú vía RPC (ISR 60s)
   - Consulta `cash_shifts` para saber si el local está abierto

3. **Carrito** → `GodCode/components/tenant/cart/cart-store.ts` (Zustand + persist en localStorage)

4. **Delivery** (opcional) → `POST /api/geo/delivery-quote` con `branchId`, `lat`, `lng`, `subtotal`

5. **Checkout** → `GodCode/components/tenant/data/orders-service.ts`:

```438:441:GodCode/components/tenant/data/orders-service.ts
    const { data: newOrder, error: orderError } = await supabase.rpc(
      "create_order_transaction",
      rpcArgs
    );
```

Con `p_order_origin: "web"` para distinguir pedidos online de los del panel.

6. **Patch delivery** → si es delivery, `POST /api/tenant/public-order-delivery` valida fee/impuestos con `supabaseAdmin`

7. **Éxito** → mensaje WhatsApp (`whatsapp-message.ts`) + vista `cart-success-view.tsx`

**Nota:** el pedido web y el pedido de caja usan la **misma RPC** pero con `p_order_origin` distinto. El kanban de Caja recibe ambos vía Realtime.

---

### Flujo C: Login en GodCode Caja

```
[Usuario abre /]
        |
        v
LoginShell → LoginForm
        |
        v
bootstrapSession()            ← GET /api/auth/session (¿hay cookie gc_rt?)
        |
   +----+----+
   |         |
  Sí        No
   |         |
   v         v
/admin    Muestra formulario
   |         |
   |    [Submit email+password]
   |         |
   |         v
   |    login() → POST /api/auth/login
   |         |
   |         v
   |    Cookie gc_rt + access_token en memoria
   |         |
   +----+----+
        |
        v
Navigate /admin
        |
        v
AdminApp (admin-app.tsx)
  ├── bootstrapSession() otra vez
  ├── Query users WHERE auth_user_id = session.user.id
  ├── Obtiene company_id, theme_config, rol
  └── Renderiza AdminProvider + AdminPage
```

**Archivos clave:**

- `src/modules/auth/login-form.tsx` — formulario y llamada a `login()`
- `src/integrations/supabase/auth-session.ts` — `login()`, `bootstrapSession()`, `getAccessToken()`
- `api/auth/login.ts` — handler serverless
- `src/modules/cash/admin/admin-app.tsx` — gate de auth y carga de empresa

---

## 7. Conceptos que debés estudiar

| Concepto | Por qué importa acá |
|----------|---------------------|
| **BFF (Backend for Frontend)** | La auth de Caja usa un backend mínimo solo para cookies httpOnly; el refresh token nunca toca JavaScript |
| **Row Level Security (RLS)** | Todo el aislamiento multi-tenant depende de políticas Postgres; sin RLS correcto, un restaurante ve datos de otro |
| **PostgreSQL RPC** | `create_order_transaction` ejecuta pedido + items + inventario + cupón en una sola transacción atómica |
| **Supabase Realtime** | El kanban de pedidos y la caja se actualizan en vivo sin polling |
| **PostgREST** | El browser hace CRUD directo a tablas con JWT; no hay capa API intermedia para la mayoría de datos |
| **Edge Functions (Deno)** | Tickets, broadcasts y geocode corren en Supabase sin depender del SaaS Next.js |
| **ISR + `unstable_cache`** | El menú público se cachea 60 segundos; `revalidate-menu` lo invalida al publicar cambios |
| **Multi-tenant por subdominio** | `proxy.ts` + `companies.public_slug` resuelven qué restaurante mostrar |
| **Optimistic UI** | `AdminProvider.moveOrder` cambia el estado del pedido en pantalla antes de que Realtime confirme |
| **PWA / Service Worker** | Caja se instala como app en tablet con cache parcial offline |
| **Zustand persist** | El carrito web sobrevive un refresh del browser gracias a localStorage |
| **CSRF protection** | Header `X-GC-Auth: 1` + validación Origin en endpoints que usan cookies |
| **Single-flight refresh** | `auth-session.ts` deduplica renovaciones concurrentes del access token |
| **Anti-tampering de precios** | `orders.js` re-consulta precios en servidor antes de crear el pedido; el frontend no puede mentir |
| **App Router (Next.js)** | GodCode usa Server Components para cargar menú sin exponer lógica al cliente |
| **Feature flags** | `FF_ONBOARDING_BILLING_EXTERNAL` controla si onboarding va al microservicio separado |
| **Transacciones atómicas** | Si falla un paso de `create_order_transaction`, nada se guarda (rollback automático) |

---

## 8. Deuda técnica y cosas confusas

Esta sección es intencionalmente honesta. Conocer estos puntos te ahorra horas de debugging.

### 1. Monorepo con dos apps y `.git` anidado

`GodCode/` tiene su propio `.git/` dentro del monorepo. Desde la raíz, Git ve GodCode como archivos sin trackear. Es fácil editar el proyecto equivocado o commitear en el repo incorrecto.

### 2. AGENTS.md desactualizado sobre CSS

`AGENTS.md` dice "Plain CSS global — **no** Tailwind", pero `src/app.tsx` ya importa `./styles/tailwind.css` y `ManualOrderModal` usa clases Tailwind. Hay **dos sistemas de estilos** conviviendo: CSS plano legacy + Tailwind en componentes nuevos.

### 3. Dos sistemas de auth distintos

| | Caja | SaaS |
|-|------|------|
| Patrón | BFF + cookie `gc_rt` | Supabase SSR cookies |
| `supabase.auth` en FE | Prohibido | Usado directamente |
| Regla | `AGENTS.md` | Sin restricción equivalente |

Si venís de un proyecto y asumís que "Supabase auth funciona igual en todo el repo", te vas a romper algo en Caja.

### 4. Sin migraciones en el repo

No existe `supabase/migrations/`. El schema vive en Supabase dashboard o herramientas externas. Los tipos en `GodCode/types/supabase-database.ts` se regeneran manualmente. Riesgo: el código asume tablas/columnas que quizás no existen en tu entorno local.

### 5. JavaScript y TypeScript mezclados en Caja

La mayoría del módulo `cash/` es `.jsx`/`.js`. Los archivos nuevos de auth son `.tsx`. `AGENTS.md` prohíbe convertir masivamente a TS. El tipado es parcial.

### 6. `cash_shifts` como señal de "local abierto"

En el menú web (`GodCode/app/[subdomain]/page.tsx`), si hay un turno de caja abierto, el nombre de la sucursal muestra " ABIERTO" / " CERRADO". Esto acopla la disponibilidad del menú online al estado de la caja física — comportamiento no obvio.

### 7. Rutas API duplicadas en onboarding

Las mismas rutas existen en `GodCode/app/api/onboarding/*` y en `GodCode/services/onboarding-billing/`. El main app a veces solo hace proxy. El feature flag `FF_ONBOARDING_BILLING_EXTERNAL` controla cuál se usa.

### 8. README dice "panel en otro repo"

`GodCode/README.md` menciona que el panel operativo vive en otro repositorio, pero **GodCode Caja está en este mismo monorepo** (`src/`). La integración es por env var `NEXT_PUBLIC_TENANT_PANEL_URL` o URL hardcodeada en el portal del dueño.

### 9. RPCs sin grant `authenticated`

Algunos RPCs de admin solo tienen permiso `service_role`. La UI los llama con JWT de usuario y recibe error `42501`. `src/modules/cash/admin/utils/rpcGuard.ts` muestra un warning "coordiná con el equipo SaaS" en vez de crashear.

### 10. Tickets/broadcasts: dos caminos

GodCode todavía tiene rutas Next.js (`/api/tenant/tickets`, `/api/tenant/broadcasts`). Caja migró a Edge Functions. Los comentarios en `supabase/functions/tenant-broadcasts/index.ts` documentan la transición.

### 11. Placeholder Supabase en dev sin `.env`

Si no configurás `.env`, `client.ts` usa URL/key placeholder para que la app cargue, pero todas las llamadas API fallan silenciosamente (solo un `console.warn`).

### 12. Package manager inconsistente

- Caja: `pnpm` (`AGENTS.md`)
- GodCode README: `npm install`
- GodCode Dockerfile: `npm ci`

### 13. Tests escasos en Caja

`vitest.config.ts` está configurado con `passWithNoTests: true`. Los tests viven principalmente en `GodCode/__tests__/`, no en la raíz del panel.

---

## Apéndice: archivos de referencia rápida

| Tema | Archivo |
|------|---------|
| Rutas SPA Caja | `src/app.tsx` |
| Auth session (Caja) | `src/integrations/supabase/auth-session.ts` |
| Cliente Supabase (Caja) | `src/integrations/supabase/client.ts` |
| Login BFF | `api/auth/login.ts` |
| CSRF / cookies | `api/_lib/http.ts` |
| Tablas usadas | `src/integrations/supabase/tables.ts` |
| Crear pedido (Caja) | `src/modules/cash/admin/orders/services/orders.js` |
| Estado global admin | `src/modules/cash/admin/pages/AdminProvider.jsx` |
| Modal pedido manual | `src/modules/cash/components/ManualOrderModal.jsx` |
| Pedido manual (hook) | `src/modules/cash/hooks/useManualOrder.js` |
| RPC guard | `src/modules/cash/admin/utils/rpcGuard.ts` |
| Proxy multi-tenant | `GodCode/proxy.ts` |
| Cliente Supabase (SaaS) | `GodCode/utils/supabase/client.ts` |
| Admin Supabase (SaaS) | `GodCode/lib/infra/supabase-admin.ts` |
| Crear pedido (web) | `GodCode/components/tenant/data/orders-service.ts` |
| Carrito | `GodCode/components/tenant/cart/cart-store.ts` |
| API handler wrapper | `GodCode/lib/api/api-handler.ts` |
| Tipos DB completos | `GodCode/types/supabase-database.ts` |
| Edge Function broadcasts | `supabase/functions/tenant-broadcasts/index.ts` |
| Reglas para agentes IA | `AGENTS.md` |
| Pestañas del panel | `src/shared/constants/admin-panel-tabs.ts` |

---

*Última actualización: junio 2026. Si cambiás schema, auth o rutas, actualizá este documento.*
