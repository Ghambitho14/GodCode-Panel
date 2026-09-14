# Agent Notes

## Memoria del proyecto: vault de Obsidian (leer SIEMPRE al empezar)

La memoria y la base de conocimiento de este proyecto viven en un **vault de Obsidian
alojado en el VPS**, no en este repo. No se autocarga en contexto: hay que consultarlo
activamente.

- **Vault:** `/home/ghambitho/obsidian/vaults/GodCode` en el VPS
  (`ghambitho@100.102.143.14`, por Tailscale).
- **Al iniciar cualquier sesión de trabajo sobre este proyecto**, consultar el vault
  antes de asumir contexto: buscar notas relacionadas con la tarea en curso
  (decisiones de arquitectura, incidentes, trabajo previo).
- **Al terminar** un bloque de trabajo con conclusiones que valga la pena conservar
  (auditorías, decisiones, incidentes, cambios de infraestructura), dejar una nota de
  sesión en el vault.
- **Empezar siempre por `00-Indice.md`**, que lista las notas de sesión existentes.
- Acceso: **MCP de Obsidian** (`obsidian_list_files_in_vault`, `obsidian_get_file_contents`,
  `obsidian_simple_search`, `obsidian_append_content`). Si el MCP no está cargado en la
  sesión, el vault también se lee y escribe por SSH directo sobre esa ruta — son archivos
  Markdown planos.
- UI web para el usuario: `http://100.102.143.14:8014` (solo por Tailscale).
- Estructura del vault: **mínima a propósito**. No inventar carpetas; dejar que crezca según
  lo que realmente haga falta guardar. Las notas de sesión van en la raíz, con nombre
  `AAAA-MM-DD Tema.md`, y se enlazan desde `00-Indice.md`.

> Operativo y verificado el 2026-08-31.

## Supabase Storage / Buckets

All images are stored in private Supabase Storage buckets and organized by `companyId`.
See the full convention and helper usage in [`docs/storage-buckets.md`](./docs/storage-buckets.md).

Quick rules when touching image uploads:

- Use `uploadCompanyImage(file, context, options)` from `src/shared/utils/supabaseStorage.js`.
- Use an `IMAGE_STORAGE_CONTEXTS` value; components must not choose buckets or construct folders manually.
- `companyId` is mandatory and is always the root folder.
- Delete the previous image only after persistence succeeds with `deleteCompanyImage(previousPath, context, companyId)`.
- Delete a newly uploaded image when persistence fails.
- Delete the stored image when the entity is removed.
- Display private images with `useSignedImageUrl(path, bucket)`.
- Store relative paths in the database, not signed URLs.

## Supabase Proxy (BFF)

The browser never talks directly to Supabase. The frontend uses `VITE_SUPABASE_URL=/api/supabase`, and the Node BFF (`server.js`) proxies those requests to the real Supabase instance via `SUPABASE_INTERNAL_URL`.

- Client config lives in `src/integrations/supabase/client.ts` and resolves relative URLs against `window.location.origin`.
- Production proxy is handled by `server.js` (`/api/supabase/*` → `SUPABASE_INTERNAL_URL`).
- Dev proxy is handled by `vite/bff-dev-plugin.ts`.
- If Supabase runs in a separate Docker service on Coolify, set `SUPABASE_INTERNAL_URL` to that service URL (e.g. `http://supabase:54321/`), not to the public frontend domain.
