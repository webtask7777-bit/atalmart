-- 022_order_zone.sql
-- Zone enforcement at checkout (handoff v1.1, P0-A item 2).
--
-- Until now an order recorded the STORE's coordinates (21.161, 81.787) in
-- orders.lat/lng — every order looked like it was being delivered to the dark
-- store — and nothing recorded which sector the delivery actually fell in.
-- /api/orders/place now resolves the zone before writing and fills these in.
--
-- APPLY: Supabase Dashboard → SQL Editor → Run. Idempotent, additive, safe to
-- run before the matching deploy (the server treats these columns as optional).

alter table public.orders
  add column if not exists zone_id uuid references public.sectors (id),
  add column if not exists zone_name text,
  add column if not exists delivery_pincode text,
  -- How the zone was resolved: 'point' (customer coordinates inside a sector
  -- polygon), 'pincode' (matched the sector's pincode, centroid used), or
  -- 'unresolved' (serviceable pincode with no sector row — allowed, flagged).
  add column if not exists zone_source text;

create index if not exists orders_zone_id_idx on public.orders (zone_id);
create index if not exists orders_delivery_pincode_idx on public.orders (delivery_pincode);

-- Operational view: how orders spread across sectors. Admin-only by way of the
-- underlying orders RLS (the view runs with the caller's privileges).
create or replace view public.orders_by_zone
with (security_invoker = true) as
  select
    coalesce(zone_name, 'Unresolved')  as zone_name,
    delivery_pincode,
    count(*)                            as orders,
    sum(total)                          as gross_total,
    max(placed_at)                      as last_order_at
  from public.orders
  group by 1, 2
  order by orders desc;
