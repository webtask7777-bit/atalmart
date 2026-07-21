-- 012_order_placement_lockdown.sql
-- Closes the order-placement integrity hole: place_order_atomic was callable
-- directly by any authenticated user with arbitrary user_id / total / prices
-- (buy-for-₹1, place-as-someone-else, free orders). The new server route
-- /api/orders/place re-prices from canonical data + verifies the Razorpay
-- payment, then writes via the service role.
--
-- APPLY in two steps (Supabase Dashboard → SQL Editor):
--   STEP 1  — run now. Adds the payment-id binding column. Non-breaking.
--   STEP 2  — run ONLY AFTER the new /api/orders/place route is deployed and a
--             real test order (COD + online) has succeeded. It revokes direct
--             RPC access; running it before the route is live will BREAK
--             checkout (the old client still calls the RPC directly).

-- ── STEP 1 — payment binding column (idempotency + audit) ──
alter table public.orders
  add column if not exists razorpay_payment_id text;

create unique index if not exists orders_razorpay_payment_id_key
  on public.orders (razorpay_payment_id)
  where razorpay_payment_id is not null;


-- ── STEP 2 — lock place_order_atomic to service_role only ──
-- (run after the route is verified in production)
--
-- A DO-block is used because the LIVE function signature has drifted from the
-- migration files (it carries extra params: p_phone, p_payment_method,
-- p_coupon_code). This revokes EXECUTE on every overload regardless of its
-- exact argument list, and from PUBLIC too (otherwise anon/authenticated keep
-- access by inheritance). The service_role — used by /api/orders/place — is
-- re-granted so the server can still place orders.
--
-- do $$
-- declare r record;
-- begin
--   for r in
--     select oid::regprocedure as sig
--     from pg_proc
--     where proname = 'place_order_atomic'
--       and pronamespace = 'public'::regnamespace
--   loop
--     execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
--     execute format('grant execute on function %s to service_role', r.sig);
--   end loop;
-- end $$;
