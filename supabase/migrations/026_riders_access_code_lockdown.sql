-- 026_riders_access_code_lockdown.sql
-- Any logged-in customer could `select access_code from riders` (policy
-- "Riders viewable by authenticated" from 001) and log in to the rider app as
-- that rider. Verified live on 9 Oct 2026 with a throwaway customer account.
--
-- Fix: customers lose direct access to `riders`. They read their assigned
-- rider through `riders_public` — safe columns only, and only for riders on
-- the caller's own orders (admins see all). The rider app (service role) and
-- the admin console ("Admins can manage riders") are unaffected.
--
-- APPLY: scripts/apply-migration.sh supabase/migrations/026_riders_access_code_lockdown.sql

drop policy if exists "Riders viewable by authenticated" on public.riders;

-- Owner-rights view (bypasses riders RLS on purpose) with its own row filter.
-- security_barrier stops the planner from leaking rows through predicates.
create or replace view public.riders_public
with (security_barrier = true) as
  select r.id, r.name, r.phone, r.vehicle_number, r.status, r.lat, r.lng
  from public.riders r
  where r.active
    and (
      public.is_admin()
      or exists (
        select 1 from public.orders o
        where o.rider_id = r.id and o.user_id = auth.uid()
      )
    );

revoke all on public.riders_public from anon, public;
grant select on public.riders_public to authenticated;

-- Re-assert 011's metrics hardening (idempotent) in case it was skipped live.
alter view public.metrics_daily_orders       set (security_invoker = on);
alter view public.metrics_top_products        set (security_invoker = on);
alter view public.metrics_customer_cohorts    set (security_invoker = on);
alter view public.metrics_order_status_today  set (security_invoker = on);
alter view public.metrics_coupons             set (security_invoker = on);
alter view public.metrics_slow_queries        set (security_invoker = on);
alter view public.metrics_stock_alerts        set (security_invoker = on);
