-- 015_rls_spatial_ref_sys.sql
--
-- Supabase Security Advisor flags `public.spatial_ref_sys` (a PostGIS system
-- table created by the postgis extension, migration 007) as "RLS disabled in
-- public" because it is reachable through the auto-generated PostgREST API.
--
-- It holds only static spatial-reference definitions (no user data), but the
-- advisor still wants it locked down. Enabling RLS with no policies makes it
-- invisible to the anon/authenticated API roles while PostGIS functions
-- (which run with elevated rights) keep working normally.
--
-- NOTE: this is DDL on an extension-owned table, so it cannot be applied via
-- the PostgREST REST API — run it in the Supabase SQL Editor (or `supabase db
-- push`). If ENABLE RLS errors with "must be owner of table", use the REVOKE
-- fallback at the bottom instead.

alter table public.spatial_ref_sys enable row level security;

-- Fallback (only if the ALTER above fails on ownership) — remove it from the
-- public API surface entirely:
--   revoke all on table public.spatial_ref_sys from anon, authenticated;
