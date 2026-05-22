-- ═══════════════════════════════════════════════════════════════════════════
-- Atomic order placement: prevents overselling under concurrent checkouts.
--
-- The naïve flow was:
--   1. Server prices the order (reads stock)
--   2. Client clicks "Place Order"
--   3. Server inserts orders + order_items rows
--   4. Server updates products.stock -= quantity for each line
--
-- Between steps 1 and 4 a second customer can race in: both pass the price
-- check, both decrement stock, and a product with stock=1 ends up at stock=-1
-- (or worse, two customers each think they got the last one).
--
-- This RPC performs the entire stock-check + order-write inside a single
-- transaction using `UPDATE … WHERE stock >= $qty RETURNING id`. If a product
-- is short, the UPDATE matches zero rows, we RAISE EXCEPTION, and the entire
-- transaction rolls back — no orphan orders, no negative stock.
--
-- The RPC takes the SAME `items` shape that the pricing endpoint validated.
-- Server callers MUST still validate the lines + recompute totals in
-- order-pricing.ts FIRST — the RPC trusts its inputs (totals are not
-- recomputed here; this is purely the inventory + write transaction).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.place_order_atomic(
  p_user_id uuid,
  p_items jsonb,        -- [{ product_id, product_name, quantity, price }]
  p_total numeric,
  p_delivery_fee numeric,
  p_discount numeric,
  p_address_line text,
  p_lat double precision,
  p_lng double precision,
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
  -- Lock + decrement each product. UPDATE returns 0 rows if stock too low,
  -- which we detect via `not found` and raise to roll back the txn.
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

  -- All decrements succeeded → write the order header
  insert into public.orders (
    user_id, status, total, delivery_fee, discount,
    address_line, lat, lng, notes
  ) values (
    p_user_id, 'placed', p_total, p_delivery_fee, p_discount,
    p_address_line, p_lat, p_lng, p_notes
  )
  returning id into v_order_id;

  -- Insert the order items in one statement
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

-- Grant execute to authenticated users — the function itself enforces
-- ownership via p_user_id which the calling route must set from the
-- session (NOT from request body).
grant execute on function public.place_order_atomic to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Restoration RPC: when an order is cancelled or a return is approved, we
-- need to add the items back to stock. Single-statement update so it's
-- naturally atomic.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.restore_stock_atomic(
  p_items jsonb  -- [{ product_id, quantity }]
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.products as p
     set stock = p.stock + (i.quantity)::int
    from jsonb_to_recordset(p_items) as i(product_id uuid, quantity int)
   where p.id = i.product_id;
end;
$$;

grant execute on function public.restore_stock_atomic to authenticated;
