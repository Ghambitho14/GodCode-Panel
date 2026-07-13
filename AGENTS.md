# Agent Notes

## Supabase Storage / Buckets

All images are stored in private Supabase Storage buckets and organized by `companyId`.
See the full convention and helper usage in [`docs/storage-buckets.md`](./docs/storage-buckets.md).

Quick rules when touching image uploads:

- Use `uploadImageToSupabase(file, bucket, folder)` from `src/shared/utils/supabaseStorage.js`.
- Build the folder with `companyStorageFolder(companyId, subFolder)` so every business has its own directory.
- Always include `companyId` as the root folder (e.g. `companyStorageFolder(companyId, 'carousel/' + branchId)`).
- Delete the previous image on replacement with `deleteStorageObject(previousUrl, bucket)`.
- Delete the stored image when the entity is removed.
- Display private images with `useSignedImageUrl(path, bucket)`.
- Store relative paths in the database, not signed URLs.
