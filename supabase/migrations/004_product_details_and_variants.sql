-- ═══════════════════════════════════════════════════════════════════
-- Blinkit-style product details + multi-unit variants.
--
-- The old products table had price/mrp/unit/stock as single columns and
-- description as a free-text blob. To match Blinkit/Zepto-style detail
-- pages we need structured nutrition info, regulatory fields (FSSAI,
-- shelf life, seller), and the ability for a single SKU to offer
-- multiple pack sizes (500 ml ₹30 vs 1 L ₹59).
--
-- Variants are OPTIONAL — products without variants keep working
-- through products.price/stock as before. Cart/pricing/place_order
-- branches on whether cart line passes a variant_id.
-- ═══════════════════════════════════════════════════════════════════

-- 1) Product detail columns
alter table public.products
  add column if not exists nutrition_per_100g jsonb,
  add column if not exists key_features         text[],
  add column if not exists processing_type      text,
  add column if not exists fat_profile          text,
  add column if not exists sugar_profile        text,
  add column if not exists biological_source    text,
  add column if not exists fssai_license        text,
  add column if not exists shelf_life           text,
  add column if not exists country_of_origin    text default 'India',
  add column if not exists seller_name          text,
  add column if not exists seller_fssai         text,
  add column if not exists seller_address       text,
  add column if not exists return_policy        text,
  add column if not exists customer_care        jsonb,
  add column if not exists disclaimer           text;

-- 2) Variants table — one product can have many (500ml, 1L, etc.)
create table if not exists public.product_variants (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products(id) on delete cascade,
  unit          text not null,                  -- "500 ml", "1 L", "200 g"
  price         numeric(10,2) not null,
  mrp           numeric(10,2) not null,
  stock         int not null default 0,
  sort_order    int not null default 0,
  is_default    boolean not null default false,
  image_url     text,
  created_at    timestamptz not null default now(),
  unique (product_id, unit)
);

create index if not exists idx_product_variants_product on public.product_variants(product_id);

alter table public.product_variants enable row level security;

create policy "Variants are viewable by everyone"
  on public.product_variants for select using (true);

create policy "Admins can manage variants"
  on public.product_variants for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Ensure at most one default variant per product
create unique index if not exists idx_product_variants_one_default
  on public.product_variants (product_id)
  where is_default = true;

-- 3) order_items: snapshot the variant so historical orders survive
--    variant edits / deletions.
alter table public.order_items
  add column if not exists variant_id   uuid references public.product_variants(id) on delete set null,
  add column if not exists variant_unit text;

-- 4) Update place_order_atomic to handle variant decrements.
--    Items shape becomes:
--      [{ product_id, product_name, quantity, price, variant_id?, variant_unit? }]
--    If variant_id is present we decrement variants.stock; else products.stock.
drop function if exists public.place_order_atomic(uuid, jsonb, numeric, numeric, numeric, text, double precision, double precision, text, text, text, text);

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
  v_variant_id uuid;
begin
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_variant_id := nullif(v_item->>'variant_id', '')::uuid;

    if v_variant_id is not null then
      -- Variant flow: decrement from product_variants.stock
      update public.product_variants
         set stock = stock - (v_item->>'quantity')::int
       where id = v_variant_id
         and stock >= (v_item->>'quantity')::int
      returning id into v_decremented_id;
    else
      -- Legacy / single-pack flow: decrement from products.stock
      update public.products
         set stock = stock - (v_item->>'quantity')::int
       where id = (v_item->>'product_id')::uuid
         and stock >= (v_item->>'quantity')::int
         and active = true
      returning id into v_decremented_id;
    end if;

    if not found then
      raise exception 'INSUFFICIENT_STOCK:%', coalesce(v_variant_id::text, v_item->>'product_id')
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

  insert into public.order_items (order_id, product_id, product_name, quantity, price, variant_id, variant_unit)
  select
    v_order_id,
    (i->>'product_id')::uuid,
    i->>'product_name',
    (i->>'quantity')::int,
    (i->>'price')::numeric,
    nullif(i->>'variant_id', '')::uuid,
    nullif(i->>'variant_unit', '')
  from jsonb_array_elements(p_items) as i;

  return query select v_order_id;
end;
$$;

grant execute on function public.place_order_atomic to authenticated;

-- 5) restore_stock_atomic — also handle variants
drop function if exists public.restore_stock_atomic(jsonb);

create or replace function public.restore_stock_atomic(
  p_items jsonb  -- [{ product_id, quantity, variant_id? }]
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Restore variant stock for items that had a variant_id
  update public.product_variants as v
     set stock = v.stock + (i.quantity)::int
    from jsonb_to_recordset(p_items) as i(variant_id uuid, quantity int)
   where v.id = i.variant_id
     and i.variant_id is not null;

  -- Restore product stock for items without a variant
  update public.products as p
     set stock = p.stock + (i.quantity)::int
    from jsonb_to_recordset(p_items) as i(product_id uuid, variant_id uuid, quantity int)
   where p.id = i.product_id
     and i.variant_id is null;
end;
$$;

grant execute on function public.restore_stock_atomic to authenticated;

select 'migration 004: product details + variants applied' as status;
