-- 027_cod_admin_manage.sql
-- The admin COD settlement screen records remittances (rider hands cash to
-- the store) and collection corrections directly from the console, so admins
-- need write access to the ledger. Riders/customers still have none; the
-- rider app writes through the service role.
--
-- APPLY: scripts/apply-migration.sh supabase/migrations/027_cod_admin_manage.sql

drop policy if exists "Admins can manage cod_collections" on public.cod_collections;
create policy "Admins can manage cod_collections"
  on public.cod_collections for all
  using (public.is_admin())
  with check (public.is_admin());
