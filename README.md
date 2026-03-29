# tenant-panel

Aplicacion Next.js separada: login y panel de administracion del negocio (dueños / staff), mas las APIs `/api/tenant-*`.

## Desarrollo local

```bash
cd services/tenant-panel
cp .env.example .env.local   # o crear manualmente
npm install
npm run dev
```

Puerto por defecto: **3002**. Rutas: `http://localhost:3002/{public_slug}/login`.

## Variables de entorno

Copiar las mismas claves Supabase que el monolito (`NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`), dominio tenant, `NEXT_PUBLIC_APP_URL` (URL canonica de **este** servicio para redirecciones Stripe), y `STRIPE_SECRET_KEY` si usas Connect.

## Repo y deploy aparte

Esta carpeta esta pensada para copiarse a un **repositorio Git propio** y conectar un proyecto Vercel (u otro) independiente del monolito publico. En el monolito configura `NEXT_PUBLIC_TENANT_PANEL_URL` apuntando a la URL publica de este servicio.

## Monorepo

Si la dejas dentro de este repo, el monolito ignora `services/**` en watch de webpack; el panel se desarrolla con `cd services/tenant-panel && npm run dev`.