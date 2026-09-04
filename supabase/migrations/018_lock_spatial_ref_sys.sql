-- 018_lock_spatial_ref_sys.sql
--
-- Resolves the Supabase Security Advisor finding "rls_disabled_in_public"
-- on public.spatial_ref_sys (PostGIS system table created by migration 007's
-- `create extension postgis`). Verified 2026-09-04: the anon key could read it
-- through PostgREST (GET /rest/v1/spatial_ref_sys → 200 with rows).
--
-- The table holds only static coordinate-system definitions — no customer
-- data — but it is reachable from the public API, which is what the advisor
-- objects to. Migration 015 tried a plain ENABLE RLS; on Supabase the table is
-- owned by supabase_admin, so the SQL-editor role (postgres) can get
-- "must be owner of table". This version tries RLS first and, whether or not
-- that works, revokes the API roles' privileges, which postgres CAN do.
--
-- Run in the Supabase SQL Editor (Dashboard → SQL → New query → paste → Run),
-- or `supabase db push` from the repo. Re-run the Security Advisor after.

do $$
begin
  begin
    alter table public.spatial_ref_sys enable row level security;
    raise notice 'spatial_ref_sys: RLS enabled';
  exception
    when insufficient_privilege then
      raise notice 'spatial_ref_sys: not owner — skipping ENABLE RLS, revoking grants instead';
  end;
end $$;

-- Remove the table from the public API surface regardless of RLS outcome.
-- PostGIS functions run with elevated rights and keep working.
revoke all on table public.spatial_ref_sys from anon, authenticated;

-- Belt and braces: nothing else in the app should ever query it via the API.
notify pgrst, 'reload schema';

select
  relrowsecurity as rls_enabled,
  has_table_privilege('anon', 'public.spatial_ref_sys', 'SELECT') as anon_can_select,
  has_table_privilege('authenticated', 'public.spatial_ref_sys', 'SELECT') as authenticated_can_select
from pg_class
where oid = 'public.spatial_ref_sys'::regclass;
