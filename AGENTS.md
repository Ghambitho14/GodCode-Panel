# Agent Notes

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
