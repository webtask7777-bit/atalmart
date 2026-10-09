-- 025_rider_daily_bonus.sql
-- One daily bonus for riders: when a rider completes `rider_bonus_target`
-- deliveries in an IST day they earn `rider_bonus_amount` (₹). Both set by
-- the admin under Settings → Delivery. target = 0 disables the bonus.
--
-- APPLY: scripts/apply-migration.sh supabase/migrations/025_rider_daily_bonus.sql
-- Idempotent, additive. Code treats a missing column as "no bonus".

alter table public.settings
  add column if not exists rider_bonus_target int not null default 0,
  add column if not exists rider_bonus_amount numeric(10,2) not null default 0;
