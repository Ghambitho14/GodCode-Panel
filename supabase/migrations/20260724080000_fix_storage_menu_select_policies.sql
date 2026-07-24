-- Product images live in the public `menu` bucket, but there was no SELECT policy.
-- createSignedUrl requires SELECT, so catalog/order product photos failed to resolve.

drop policy if exists "Allow authenticated read menu" on storage.objects;
create policy "Allow authenticated read menu"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'menu');

drop policy if exists "Allow public read menu" on storage.objects;
create policy "Allow public read menu"
  on storage.objects
  for select
  to public
  using (bucket_id = 'menu');

-- Keep receipts readable by authenticated users (company-scoped policy already exists);
-- ensure anon/public read remains for signed/public access where configured.
drop policy if exists "Allow authenticated read products" on storage.objects;
create policy "Allow authenticated read products"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'products');
