-- 024_rider_payout.sql
-- Rider earnings = fixed per-delivery payout, configured by the admin.
--
-- Before this, the rider app showed the CUSTOMER's delivery fee as the
-- rider's earning (₹0 on free-delivery orders ≥ ₹299) while the admin riders
-- page assumed a hardcoded ₹20. One column, read by both.
--
-- APPLY: scripts/apply-migration.sh supabase/migrations/024_rider_payout.sql
-- Idempotent, additive. Code falls back to ₹20 if the column is missing.

alter table public.settings
  add column if not exists rider_payout_per_delivery numeric(10,2) not null default 20;
