# GodCode Panel

Panel de gestión para los negocios (tenants) de la plataforma SaaS GodCode: pedidos, caja, menú, clientes, reportes y soporte desde una sola aplicación web instalable (PWA), pensada para el mostrador, la cocina y la administración del local.

---

## Contenido

- [Funcionalidades](#funcionalidades)
- [Stack tecnológico](#stack-tecnológico)
- [Arquitectura](#arquitectura)
- [Requisitos](#requisitos)
- [Instalación y desarrollo local](#instalación-y-desarrollo-local)
- [Variables de entorno](#variables-de-entorno)
- [Scripts disponibles](#scripts-disponibles)
- [Pruebas](#pruebas)
- [Integración continua](#integración-continua)
- [Despliegue](#despliegue)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Autor](#autor)

---

## Funcionalidades

El panel se organiza en pestañas. Cada negocio puede renombrarlas y decidir qué ve cada rol (`owner`, `admin`, `ceo`, `cashier`); por defecto el rol de cajero solo accede a Pedidos, Caja y Gastos del local.

**Operación diaria**

- **Cocina / Pedidos**: tablero de pedidos en tiempo real (Supabase Realtime) con vista por pedido y vista de mesas, historial, aviso sonoro para pedidos nuevos y control para pausar la recepción de pedidos.
- **Pedido manual**: carga de pedidos desde el mostrador con catálogo, carrito, modificadores, cupones, datos del cliente, retiro o delivery y cobro.
- **Cobro**: registro de pagos con varios métodos, montos en distintas monedas y comprobantes de pago.
- **Mesas y reservas**: plano de mesas por sucursal, apertura y cierre de mesa con recibo de la sesión, y reservas que se asocian al pedido al sentar a los comensales.
- **Caja**: apertura y cierre de turno, movimientos de caja, conciliación al cierre y detalle de cada turno.
- **Gastos del local**: registro de gastos por categoría con resumen y filtros.
- **Impresión de comandas**: tickets para impresoras térmicas con varios diseños, también desde el móvil y desde la PWA.

**Catálogo y menú**

- **Categorías** y **Menú y carta** (productos con imagen, precio y receta).
- **Inventario**: artículos, unidades y stock por sucursal, vinculables a las recetas de los productos.
- **Bebidas**, **Extras** y **Agregar cambios** (modificaciones por producto: quitar, agregar o cambiar ingredientes con su precio).
- **Carrusel** de imágenes del menú y **Opciones de sucursal** (canales de pedido, ventas sugeridas en el carrito, configuración del ticket y zonas de delivery).

**Clientes y ventas**

- **Clientes**: fichas de clientes con direcciones de entrega guardadas, separando las cuentas del menú de los compradores rápidos. Los datos personales cifrados de las cuentas del menú se descifran solo en el servidor (Edge Function `client-pii`).
- **Cupones**: creación y validación de cupones de descuento, incluidos los asociados a una cuenta de cliente.
- **Reportes**: ventas por período, reparto por método de pago y exportación a planilla.

**Plataforma**

- **Soporte**: creación y seguimiento de tickets de soporte hacia el equipo de GodCode.
- **Avisos de la plataforma**: banner con los comunicados activos publicados para el negocio.
- **Multi-sucursal**: selector de sucursal y datos acotados por empresa y sucursal.
- **Localización**: perfiles de país para Chile y Venezuela (formularios, formato de moneda y, en Venezuela, tipo de cambio oficial BCV para montos en bolívares).
- **PWA**: instalable, con aviso de nuevas versiones sin recargar a mano.
- **Productividad**: paleta de comandos y atajos de teclado.

---

## Stack tecnológico

| Área | Tecnologías |
| --- | --- |
| Frontend | React 19, TypeScript, Vite 8, React Router 7 |
| Estilos y UI | Tailwind CSS 4, componentes Radix UI (estilo shadcn/ui), lucide-react, sileo (notificaciones) |
| Gráficos | Recharts 3 (con un parche aplicado mediante `patch-package`) |
| Backend de datos | Supabase (Postgres, Auth, Realtime, Storage y Edge Functions en Deno) |
| BFF / servidor | Node.js (`server.js`) y funciones serverless de Vercel (`api/`) |
| PWA | vite-plugin-pwa (Workbox) |
| Pruebas | Vitest, Testing Library, jsdom, Playwright |
| Calidad | ESLint 9, typescript-eslint, Knip, CodeQL |

---

## Arquitectura

```
Navegador (React SPA / PWA)
   |
   |  /api/auth/*       login, sesión, refresh, logout
   |  /api/supabase/*   proxy HTTP y WebSocket (Realtime)
   v
BFF  (server.js en producción Node, funciones de api/ en Vercel,
      vite/bff-dev-plugin.ts en desarrollo)
   |
   v
Supabase  (Postgres + RLS, Auth, Realtime, Storage, Edge Functions)
   ^
   |  base de datos compartida
Plataforma GodCode (panel de súper administración y Portal)
```

- **Frontend**: SPA en React con dos rutas principales, `/` (inicio de sesión) y `/admin` (panel). El código del negocio vive en `src/modules/cash`: pestañas del panel, servicios que consultan Supabase, hooks, impresión y estilos.
- **BFF de autenticación**: el inicio de sesión se hace en el servidor. El refresh token se guarda en una cookie `httpOnly` (`gc_rt`) y el access token vive solo en memoria del navegador. Las rutas de auth tienen verificación anti-CSRF (origen y cabecera propia) y límite de intentos de login por IP y por IP + email (en Vercel puede usar Vercel KV; si no está configurado, cae a memoria).
- **Proxy de Supabase**: en producción con Node, el navegador no habla directo con Supabase; usa `VITE_SUPABASE_URL=/api/supabase` y `server.js` reenvía las peticiones (incluido el WebSocket de Realtime) a `SUPABASE_INTERNAL_URL`. En desarrollo lo hace el plugin `vite/bff-dev-plugin.ts`.
- **Servidor Node**: `server.js` sirve el build de `dist/`, aplica cabeceras de seguridad (CSP básica, `X-Frame-Options`, `nosniff`, HSTS bajo HTTPS) y define una política de caché pensada para el service worker.
- **Supabase**:
  - `supabase/functions`: Edge Functions `client-pii` (descifrado de datos personales de cuentas del menú), `geocode` (resolución de direcciones a zonas de delivery usando Photon / OpenStreetMap), `tenant-broadcasts` (comunicados de la plataforma) y `tenant-tickets` (tickets de soporte).
  - `supabase/migrations`: migraciones SQL incrementales (mesas y reservas, cuentas de clientes del menú, grupos de modificadores, recetas, numeración de pedidos por empresa y correcciones de funciones de pedidos y pagos).
  - Las imágenes se guardan en buckets privados de Storage, organizadas por `companyId`, y se muestran con URLs firmadas.
- **Relación con GodCode**: este repositorio es el panel que usa cada negocio. La administración global de la plataforma se gestiona en el repositorio [`gabjesus15/GodCode`](https://github.com/gabjesus15/GodCode). Ambos comparten la misma base de datos de Supabase (por ejemplo, las tablas de tickets y comunicados de la plataforma).

---

## Requisitos

- Node.js 20 o superior (CI usa Node 20; la imagen Docker usa Node 22).
- npm (el proyecto declara `npm@11.8.0` en `packageManager`).
- Un proyecto de Supabase con el esquema de GodCode (URL y anon key).
- Opcional: Supabase CLI para desplegar las Edge Functions y aplicar migraciones.
- Opcional: Google Chrome para las pruebas end-to-end (Playwright usa `channel: "chrome"`).

---

## Instalación y desarrollo local

```bash
git clone https://github.com/Ghambitho14/GodCode-Panel.git
cd GodCode-Panel
npm install            # también aplica los parches de patch-package
cp .env.example .env   # luego completa los valores
npm run dev
```

La aplicación queda disponible en `http://localhost:5173`.

En desarrollo, el plugin `vite/bff-dev-plugin.ts` monta las rutas `/api/auth/*` y el proxy `/api/supabase/*` dentro del propio servidor de Vite, así que no hace falta Vercel CLI. El proxy apunta a `SUPABASE_INTERNAL_URL`, después a `SUPABASE_URL` y, si ninguna está definida, a `http://127.0.0.1:54321` (Supabase local).

Si faltan `VITE_SUPABASE_URL` o `VITE_SUPABASE_ANON_KEY`, la app arranca en desarrollo con valores de relleno y muestra un aviso en consola, pero las llamadas a la API fallarán hasta configurar el proyecto real.

---

## Variables de entorno

Copia `.env.example` a `.env`. Nunca subas el archivo `.env` al repositorio.

**Frontend (se incluyen en el build de Vite)**

| Variable | Obligatoria | Descripción |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Sí | URL de Supabase para el navegador. En producción con el BFF se usa `/api/supabase`; en desarrollo local puede ser la URL directa. |
| `VITE_SUPABASE_ANON_KEY` | Sí | Anon key pública del proyecto de Supabase. |
| `VITE_PUBLIC_COMPANY_SLUG` | No | Slug de la empresa para construir las URLs del menú público (storefront). |
| `VITE_GC_MONITOR` | No | Activa los logs de monitoreo en producción (`1` = activado). |
| `VITE_STORAGE_IMAGE_TRANSFORMS` | No | Activa las transformaciones de imagen de Storage (`/render/image`). Requiere imgproxy; desactivado por defecto. |

Vite también acepta el prefijo `NEXT_PUBLIC_` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) como alias, por compatibilidad con archivos `.env` heredados.

**Servidor / BFF**

| Variable | Obligatoria | Descripción |
| --- | --- | --- |
| `SUPABASE_INTERNAL_URL` | En producción Node | URL real e interna de Supabase a la que `server.js` reenvía `/api/supabase/*`. Nunca debe ser relativa ni apuntar al dominio público del frontend. |
| `SUPABASE_URL` | Sí (servidor) | URL de Supabase que usan las rutas de autenticación del servidor. Si falta, se usa `VITE_SUPABASE_URL`. |
| `SUPABASE_ANON_KEY` | Sí (servidor) | Anon key para las rutas de autenticación del servidor. Si falta, se usa `VITE_SUPABASE_ANON_KEY`. |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Service role key, solo para Edge Functions u operaciones exclusivas del servidor. Nunca debe exponerse al navegador. |
| `PORT` | No | Puerto de `server.js` (por defecto `3000`). |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | No | Credenciales de Vercel KV para que el límite de intentos de login sea compartido entre instancias en Vercel. |

**Secretos de las Edge Functions (en Supabase)**

| Variable | Descripción |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Usada por las funciones para resolver el usuario y su empresa y leer o escribir tablas no accesibles por RLS. |
| `MENU_ACCOUNT_PII_KEY` | Llave para descifrar los datos personales de las cuentas del menú en `client-pii`. Debe ser la misma que usa el Portal; si se pierde, los datos cifrados no se pueden recuperar. |

---

## Scripts disponibles

| Script | Descripción |
| --- | --- |
| `npm run dev` | Servidor de desarrollo de Vite (puerto 5173) con el BFF de desarrollo. |
| `npm run dev:e2e` | Servidor de Vite en modo `e2e` (habilita los arneses de prueba en `/__e2e/*`). |
| `npm run build` | Chequeo de tipos con `tsc` y build de producción en `dist/`. |
| `npm start` | Inicia `server.js` (sirve `dist/`, auth y proxy de Supabase). |
| `npm run preview` | Previsualiza el build con Vite (puerto 4173). |
| `npm run lint` | ESLint sobre todo el proyecto. |
| `npm run lint:ceiling` | ESLint con un máximo de 164 advertencias. |
| `npm run lint:strict` | ESLint sin advertencias permitidas. |
| `npm test` | Ejecuta la suite de Vitest una vez. |
| `npm run test:watch` | Vitest en modo observación. |
| `npm run test:coverage` | Vitest con reporte de cobertura (v8). |
| `npm run test:e2e` | Pruebas end-to-end con Playwright (vía `scripts/run-e2e.mjs`). |
| `npm run test:e2e:ui` | Playwright en modo interfaz. |
| `npm run knip` | Detecta código, exports y dependencias sin usar. |
| `postinstall` | Aplica los parches de `patches/` con `patch-package` (se ejecuta solo tras `npm install`). |

---

## Pruebas

**Unitarias y de componentes (Vitest)**

```bash
npm test
npm run test:coverage
```

- Entorno `jsdom`, con polyfills en `tests/setup/jsdom-polyfills.js`.
- Cubren dinero y monedas, cupones, perfiles de país, flujo de pedido manual, cobro, caja y gastos, impresión de tickets, utilidades compartidas, sesión de autenticación, servicios y contratos de migraciones SQL.
- La cobertura se mide sobre `src/` y `api/`.

**End-to-end (Playwright)**

```bash
npx playwright install chrome
npm run test:e2e
```

- Las pruebas están en `tests/e2e` y se ejecutan en dos proyectos: Chrome de escritorio y Pixel 5 (móvil).
- Usan un servidor de Vite en modo `e2e` sobre `http://127.0.0.1:5174` con arneses propios, por lo que no se conectan a Supabase.
- Si ya tienes un servidor levantado en ese puerto, define `PLAYWRIGHT_EXTERNAL_SERVER=1` para que Playwright no inicie otro.

---

## Integración continua

GitHub Actions corre en cada push y pull request hacia `main`, `develop` y `release/**`:

- **CI** (`.github/workflows/ci.yml`): ESLint con techo de advertencias, chequeo de tipos, Vitest, build de producción, Playwright y Knip (este último es informativo y no bloquea).
- **Security** (`.github/workflows/security.yml`): revisión de dependencias en pull requests y análisis CodeQL para JavaScript/TypeScript, además de una ejecución semanal programada.

---

## Despliegue

El proyecto contempla tres formas de despliegue:

**Vercel**

Vite genera el frontend estático y las rutas de `api/auth/*` funcionan como funciones serverless (`@vercel/node`). Configura en el proyecto de Vercel las variables de Supabase y, de forma opcional, `KV_REST_API_URL` y `KV_REST_API_TOKEN` para el límite de intentos de login.

**Docker**

El `Dockerfile` hace un build en dos etapas sobre `node:22.14-alpine` y ejecuta `node server.js` en el puerto 3000.

```bash
docker build -t godcode-panel .
docker run -p 3000:3000 --env-file .env godcode-panel
```

Las variables `VITE_*` se incluyen en el build, así que deben estar disponibles durante `npm run build`, no solo al ejecutar el contenedor.

**Nixpacks (por ejemplo, Coolify)**

`nixpacks.toml` define `npm ci`, `npm run build` y `npm run start`. Si Supabase corre como otro servicio Docker en la misma red, `SUPABASE_INTERNAL_URL` debe apuntar a ese servicio (por ejemplo `http://supabase:54321/`), no al dominio público del frontend.

**Supabase**

Las Edge Functions de `supabase/functions` y las migraciones de `supabase/migrations` se despliegan aparte con la Supabase CLI, configurando antes los secretos descritos en [Variables de entorno](#variables-de-entorno).

---

## Estructura del proyecto

```
GodCode-Panel/
├── api/                    Funciones serverless del BFF (Vercel)
│   ├── _lib/               Cliente Supabase de servidor, cookies, rate limit
│   └── auth/               login, logout, refresh, session
├── public/                 Íconos, manifest, imágenes y sonido de notificación
├── src/
│   ├── components/ui/      Componentes base (Radix / shadcn)
│   ├── integrations/       Cliente de Supabase y sesión en memoria
│   ├── lib/                Dinero, cupones, delivery, geo, inventario, recetas
│   ├── modules/
│   │   ├── auth/           Pantalla de inicio de sesión
│   │   └── cash/           Panel del negocio: pestañas, componentes, servicios,
│   │                       hooks, impresión, estilos y arneses e2e
│   ├── shared/             Constantes, hooks, PWA, utilidades y tipos compartidos
│   ├── app.tsx             Rutas de la aplicación
│   └── main.tsx            Punto de entrada
├── supabase/
│   ├── functions/          Edge Functions (client-pii, geocode, tenant-*)
│   └── migrations/         Migraciones SQL
├── tests/                  Pruebas Vitest y Playwright (tests/e2e)
├── vite/                   Plugin del BFF para desarrollo
├── server.js               Servidor Node de producción (estáticos, auth, proxy)
├── Dockerfile
├── nixpacks.toml
├── vite.config.ts
├── vitest.config.ts
└── playwright.config.ts
```

---

## Autor

**Jhon Belandria** ([@Ghambitho14](https://github.com/Ghambitho14)), Chile.
