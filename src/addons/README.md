# Extras a medida (`src/addons/`)

Aquí viven los extras que piden los clientes. Cada uno es una carpeta propia, así un pedido de un
cliente no obliga a tocar el resto del panel.

## Crear un extra

1. Copia `_plantilla/` con el nombre del módulo: minúsculas, números y guiones (`cuadre-caja`).
2. En `manifest.json` cambia `id` por ese mismo nombre, el `label` (nombre en el menú), la
   `description` y, si hace falta, `navGroup` (`root`, `sales` o `menu`) y `allowedRoles`.
3. Arma la pantalla en `Screen.tsx`. Usa `useAdmin()` para la empresa, la sucursal y el rol, y el
   cliente de `@/integrations/supabase` para los datos.
4. Despliega el panel.
5. En el super admin (GodCode), **Servicios extra** lo muestra en «En el panel, sin publicar»:
   con **Publicar** le pones nombre y precio (con «Activo» apagado queda guardado sin venderse).
   También se puede activar directo a una empresa en **Gestionar empresa › Extras**.

La carpeta se registra sola (`registry.ts` lee `./*/index.tsx`) y el build publica la lista en
`/addons-manifest.json` (`vite/addons-manifest-plugin.ts`), que es lo que lee GodCode. Las que
empiezan con `_` se ignoran. Si el extra está activo pero su carpeta no existe en el panel
desplegado, no se muestra.

## Guardar datos del extra

No hace falta una tabla por extra: `useAddonData` (`src/addons/useAddonData.ts`) guarda el estado
del extra como un JSON en la tabla `addon_data` (una fila por empresa, extra y clave; RLS por
empresa; SQL en `GodCode/Addons/sql/2026-10-13_addon_data.sql`).

```tsx
const { data, setData, status, savedAt, loadError, reload } = useAddonData({
	addon: "mi-extra",           // la carpeta
	dataKey: sucursalId,         // o "" para uno por empresa
	companyId,
	revive: reviveMiEstado,      // valida lo leído y da el valor inicial
	localKey: `godcode:addon:mi-extra:${companyId}:${sucursalId}`,
});
```

Carga al abrir, sube el JSON entero poco después de cada cambio (gana el último que guarda) y deja
una copia en el navegador: si se corta la conexión, reintenta y lo sube al volver. Si un extra
necesita consultas o muchos datos (miles de filas), ahí sí conviene su propia tabla.

## Cómo llega al panel

`admin-app.tsx` lee los extras vigentes de la empresa (`company_addons`, activos y sin vencer) y, por
cada uno con `panel_module`, agrega una pestaña `module:addon-<modulo>`. No sale en la barra lateral:
se abre con «Abrir» en la pantalla Addons, que queda marcada en el menú mientras tanto. `Admin.jsx` pinta su
`Component` dentro de `AddonFrame.tsx` (la barra con «← Addons» y el nombre del extra), con la barra
lateral del panel a la vista. Los datos del extra (tablas propias, si las necesita) van con su migración aparte y RLS
por `company_id`.
