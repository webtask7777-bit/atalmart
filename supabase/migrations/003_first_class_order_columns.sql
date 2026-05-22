-- ═══════════════════════════════════════════════════════════════════════════
-- Promote phone / payment_method / coupon_code from `notes` regex to proper
-- columns.
--
-- The original schema stored these as a pipe-delimited string in the `notes`
-- field, like:  "Phone: 9876543210 | Payment: cod | Coupon: ATAL50"
-- Every read site had to regex them back out, which is fragile (phone number
-- format edge cases break the regex) and unindexable (can't query "all COD
-- orders from this number" without a full table scan).
--
-- This migration:
--   1. Adds the three columns (nullable so backfill can't fail)
--   2. Backfills from existing notes via regex (one-time, in SQL)
--   3. Leaves the `notes` column for freeform customer messages going forward
--      ("Leave at gate", "Call before delivery")
--
-- Application code should write to the new columns directly. The RPC
-- place_order_atomic is updated in this migration to accept them as
-- separate parameters (the prior version stuffed them into p_notes).
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.orders
  add column if not exists phone          text,
  add column if not exists payment_method text,
  add column if not exists coupon_code    text;

-- Backfill from existing notes data
update public.orders
   set phone = trim((regexp_match(notes, 'Phone:\s*([+\d\s\-()]+?)(?:\s*\||$)'))[1])
 where phone is null and notes is not null and notes ~ 'Phone:';

update public.orders
   set payment_method = lower((regexp_match(notes, 'Payment:\s*(\w+)'))[1])
 where payment_method is null and notes is not null and notes ~ 'Payment:';

update public.orders
   set coupon_code = upper((regexp_match(notes, 'Coupon:\s*([A-Z0-9]+)'))[1])
 where coupon_code is null and notes is not null and notes ~ 'Coupon:';

-- Index payment_method + coupon_code (small cardinality, common WHERE filters)
create index if not exists orders_payment_method_idx on public.orders (payment_method);
create index if not exists orders_coupon_code_idx on public.orders (coupon_code) where coupon_code is not null;

-- Re-create place_order_atomic with structured params instead of the
-- regex-encoded notes string. Drops + recreates rather than CREATE OR REPLACE
-- because the function signature changed (different parameter list).
drop function if exists public.place_order_atomic(uuid, jsonb, numeric, numeric, numeric, text, double precision, double precision, text);

create or replace function public.place_order_atomic(
  p_user_id uuid,
  p_items jsonb,
  p_total numeric,
  p_delivery_fee numeric,
  p_discount numeric,
  p_address_line text,
  p_lat double precision,
  p_lng double precision,
  p_phone text,
  p_payment_method text,
  p_coupon_code text,
  p_notes text
) returns table (order_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_item jsonb;
  v_decremented_id uuid;
begin
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    update public.products
       set stock = stock - (v_item->>'quantity')::int
     where id = (v_item->>'product_id')::uuid
       and stock >= (v_item->>'quantity')::int
       and active = true
    returning id into v_decremented_id;

    if not found then
      raise exception 'INSUFFICIENT_STOCK:%', v_item->>'product_id'
        using errcode = 'P0001';
    end if;
  end loop;

  insert into public.orders (
    user_id, status, total, delivery_fee, discount,
    address_line, lat, lng,
    phone, payment_method, coupon_code, notes
  ) values (
    p_user_id, 'placed', p_total, p_delivery_fee, p_discount,
    p_address_line, p_lat, p_lng,
    p_phone, p_payment_method, p_coupon_code, p_notes
  )
  returning id into v_order_id;

  insert into public.order_items (order_id, product_id, product_name, quantity, price)
  select
    v_order_id,
    (i->>'product_id')::uuid,
    i->>'product_name',
    (i->>'quantity')::int,
    (i->>'price')::numeric
  from jsonb_array_elements(p_items) as i;

  return query select v_order_id;
end;
$$;

grant execute on function public.place_order_atomic to authenticated;
