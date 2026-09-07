-- ═══════════════════════════════════════════════════════════════════════════
-- 016 — Procurement + Pricing + Profit/Loss transparency
--
-- Goal (from the brief): Atalmart buys stock wholesale (Flipkart Wholesale is
-- the primary supplier). The admin needs to record what each SKU *cost*, turn
-- that into transparent per-product margins, and roll actual sales up into a
-- profit & loss view. Nothing here is a secret credential, so it all lives in
-- the DB behind admin-only RLS.
--
-- What this migration adds:
--   1. products.cost_price + products.supplier_id  (landed unit cost of goods)
--   2. product_variants.cost_price                 (per pack-size cost)
--   3. order_items.cost_price                      (COGS snapshot at sale time)
--   4. suppliers                                    (Flipkart Wholesale seeded)
--   5. purchase_orders + purchase_order_items       (wholesale invoice capture)
--   6. trg_snapshot_order_item_cost                 (auto-fills COGS on sale)
--   7. receive_purchase_order(uuid) RPC             (invoice → stock + landed cost)
--
-- ── APPLY NOTES ─────────────────────────────────────────────────────────────
-- The LIVE atalmart DB has drifted from the migration files (see 013's header).
-- Everything below is written to be **idempotent** and to touch ONLY new
-- objects + additive columns — it does NOT redefine place_order_atomic or any
-- other drifted function. Safe to paste whole into the Supabase SQL Editor.
--   • COGS is captured by a BEFORE-INSERT trigger on order_items, so order
--     placement keeps working untouched regardless of which place_order_atomic
--     overload is live.
--   • Receiving a purchase order routes stock through a normal UPDATE, so the
--     migration-006 stock_movements ledger records it (reason='grn').
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) Cost columns on products ──────────────────────────────────────────────
-- cost_price = landed unit cost (wholesale price + allocated tax/freight). This
-- is the number the P&L treats as COGS. Defaults to 0 = "cost not entered yet"
-- (the pricing console flags those so margins are never silently wrong).
alter table public.products
  add column if not exists cost_price  numeric(10,2) not null default 0,
  add column if not exists supplier_id uuid;

-- ── 2) Cost column on variants (pack-size level costs) ───────────────────────
alter table public.product_variants
  add column if not exists cost_price numeric(10,2) not null default 0;

-- ── 3) COGS snapshot column on order_items ──────────────────────────────────
-- Historical orders must survive later cost edits, so we freeze the cost that
-- applied at sale time onto every line.
alter table public.order_items
  add column if not exists cost_price numeric(10,2) not null default 0;

-- ── 4) Suppliers ─────────────────────────────────────────────────────────────
create table if not exists public.suppliers (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  contact_name  text,
  phone         text,
  email         text,
  gstin         text,               -- supplier GST number (Flipkart Wholesale's)
  address       text,
  notes         text,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

alter table public.suppliers enable row level security;

drop policy if exists "Admins can manage suppliers" on public.suppliers;
create policy "Admins can manage suppliers" on public.suppliers for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- Now that suppliers exists, wire products.supplier_id to it.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_supplier_id_fkey'
  ) then
    alter table public.products
      add constraint products_supplier_id_fkey
      foreign key (supplier_id) references public.suppliers(id) on delete set null;
  end if;
end $$;

-- Seed Flipkart Wholesale as the primary supplier (idempotent by name).
insert into public.suppliers (name, gstin, notes)
select 'Flipkart Wholesale', null, 'Primary wholesale procurement source'
where not exists (
  select 1 from public.suppliers where lower(name) = 'flipkart wholesale'
);

-- ── 5) Purchase orders (wholesale invoice capture) ───────────────────────────
-- One row per Flipkart Wholesale invoice/bill. Header carries the freight/other
-- charges that get allocated across lines to compute true landed cost.
create table if not exists public.purchase_orders (
  id              uuid primary key default gen_random_uuid(),
  supplier_id     uuid references public.suppliers(id) on delete set null,
  invoice_number  text,
  invoice_date    date,
  status          text not null default 'draft'
                    check (status in ('draft','received','cancelled')),
  -- Header-level extras that inflate the true cost of goods. Allocated across
  -- lines (pro-rata by gross line value) when the PO is received.
  shipping_total  numeric(10,2) not null default 0,
  other_charges   numeric(10,2) not null default 0,
  -- Denormalised totals kept for fast listing; recomputed by the app on save.
  goods_subtotal  numeric(12,2) not null default 0,   -- sum(unit_cost*qty)
  tax_total       numeric(12,2) not null default 0,   -- sum(per-line tax)
  grand_total     numeric(12,2) not null default 0,   -- goods+tax+shipping+other
  notes           text,
  received_at     timestamptz,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists purchase_orders_supplier_idx
  on public.purchase_orders (supplier_id);
create index if not exists purchase_orders_status_idx
  on public.purchase_orders (status, invoice_date desc);

alter table public.purchase_orders enable row level security;
drop policy if exists "Admins can manage purchase orders" on public.purchase_orders;
create policy "Admins can manage purchase orders" on public.purchase_orders for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

create table if not exists public.purchase_order_items (
  id           uuid primary key default gen_random_uuid(),
  po_id        uuid not null references public.purchase_orders(id) on delete cascade,
  product_id   uuid references public.products(id) on delete set null,
  product_name text not null,               -- snapshot / free text if unmatched
  quantity     int  not null check (quantity > 0),
  unit_cost    numeric(10,2) not null default 0,   -- pre-tax wholesale price / unit
  tax_rate     numeric(5,2)  not null default 0,   -- GST %, e.g. 5, 12, 18
  line_total   numeric(12,2) not null default 0,   -- unit_cost*qty (taxable value)
  created_at   timestamptz not null default now()
);

create index if not exists purchase_order_items_po_idx
  on public.purchase_order_items (po_id);
create index if not exists purchase_order_items_product_idx
  on public.purchase_order_items (product_id);

alter table public.purchase_order_items enable row level security;
drop policy if exists "Admins can manage purchase order items" on public.purchase_order_items;
create policy "Admins can manage purchase order items" on public.purchase_order_items for all using (
  exists (
    select 1 from public.purchase_orders po
    join public.profiles pr on pr.id = auth.uid() and pr.role = 'admin'
    where po.id = po_id
  )
);

-- ── 6) COGS snapshot trigger on order_items ──────────────────────────────────
-- Fills cost_price at INSERT time from the variant cost (if the line has a
-- variant) else the product cost. Only fills when the caller didn't set one,
-- so an explicit value (e.g. a correction) is never clobbered. Decoupled from
-- place_order_atomic on purpose — works no matter which overload is live.
create or replace function public.snapshot_order_item_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cost numeric(10,2);
begin
  if NEW.cost_price is not null and NEW.cost_price > 0 then
    return NEW;
  end if;

  if NEW.variant_id is not null then
    select cost_price into v_cost from public.product_variants where id = NEW.variant_id;
  end if;

  if v_cost is null or v_cost = 0 then
    select cost_price into v_cost from public.products where id = NEW.product_id;
  end if;

  NEW.cost_price := coalesce(v_cost, 0);
  return NEW;
end;
$$;

drop trigger if exists trg_snapshot_order_item_cost on public.order_items;
create trigger trg_snapshot_order_item_cost
  before insert on public.order_items
  for each row
  execute function public.snapshot_order_item_cost();

-- Best-effort backfill of existing lines with the current product cost (0 until
-- costs are entered, so this is harmless and just seeds the column).
update public.order_items oi
   set cost_price = coalesce(
         (select v.cost_price from public.product_variants v where v.id = oi.variant_id),
         (select p.cost_price from public.products p where p.id = oi.product_id),
         0)
 where oi.cost_price = 0;

-- ── 7) receive_purchase_order — invoice → stock + landed cost ────────────────
-- Allocates the header freight/other charges across lines pro-rata by gross
-- line value, computes a true landed unit cost, bumps product stock (which the
-- 006 ledger captures as a 'grn' movement) and writes the landed cost back onto
-- the product / variant. Idempotent: refuses to re-receive a non-draft PO.
create or replace function public.receive_purchase_order(p_po_id uuid)
returns table (received_lines int, total_units int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status         text;
  v_shipping       numeric(12,2);
  v_other          numeric(12,2);
  v_extra          numeric(12,2);
  v_total_gross    numeric(12,2);
  v_line           record;
  v_line_tax       numeric(12,2);
  v_line_gross     numeric(12,2);
  v_alloc          numeric(12,2);
  v_landed_total   numeric(12,2);
  v_landed_unit    numeric(10,2);
  v_lines          int := 0;
  v_units          int := 0;
  v_has_variant    boolean;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  select status, shipping_total, other_charges
    into v_status, v_shipping, v_other
    from public.purchase_orders where id = p_po_id for update;

  if v_status is null then
    raise exception 'PO_NOT_FOUND:%', p_po_id using errcode = 'P0001';
  end if;
  if v_status <> 'draft' then
    raise exception 'PO_NOT_DRAFT:%', v_status using errcode = 'P0001';
  end if;

  v_extra := coalesce(v_shipping, 0) + coalesce(v_other, 0);

  -- Total gross across lines (taxable + per-line tax) — the allocation base.
  select coalesce(sum(line_total + line_total * coalesce(tax_rate,0)/100.0), 0)
    into v_total_gross
    from public.purchase_order_items where po_id = p_po_id;

  -- Label the stock movements this txn creates.
  perform set_config('app.stock_reason', 'grn', true);
  perform set_config('app.stock_source', 'purchase_receive', true);

  for v_line in
    select * from public.purchase_order_items where po_id = p_po_id
  loop
    v_line_tax   := v_line.line_total * coalesce(v_line.tax_rate, 0) / 100.0;
    v_line_gross := v_line.line_total + v_line_tax;

    if v_total_gross > 0 then
      v_alloc := (v_line_gross / v_total_gross) * v_extra;
    else
      v_alloc := 0;
    end if;

    v_landed_total := v_line_gross + v_alloc;
    v_landed_unit  := round(v_landed_total / greatest(v_line.quantity, 1), 2);

    v_lines := v_lines + 1;
    v_units := v_units + v_line.quantity;

    if v_line.product_id is null then
      continue;   -- unmatched line: recorded on the invoice but no stock target
    end if;

    -- Does this product have variants? If exactly one, treat it as the target;
    -- otherwise cost lands on the parent product row.
    select count(*) = 1 into v_has_variant
      from public.product_variants where product_id = v_line.product_id;

    if v_has_variant then
      update public.product_variants
         set stock = stock + v_line.quantity,
             cost_price = v_landed_unit
       where product_id = v_line.product_id;
      -- keep parent cost in sync for margin reporting
      update public.products
         set cost_price = v_landed_unit,
             supplier_id = coalesce(supplier_id,
               (select supplier_id from public.purchase_orders where id = p_po_id))
       where id = v_line.product_id;
    else
      update public.products
         set stock = stock + v_line.quantity,
             cost_price = v_landed_unit,
             supplier_id = coalesce(supplier_id,
               (select supplier_id from public.purchase_orders where id = p_po_id))
       where id = v_line.product_id;
    end if;
  end loop;

  update public.purchase_orders
     set status = 'received', received_at = now(), updated_at = now()
   where id = p_po_id;

  return query select v_lines, v_units;
end;
$$;

grant execute on function public.receive_purchase_order to authenticated;

-- ── 8) Keep wholesale cost out of customer hands ─────────────────────────────
-- Customers see the SELLING price only. Customer-facing queries already omit
-- cost (src/lib/supabase/product-columns.ts), and this is the DB backstop: the
-- PUBLIC anon key (shipped in every browser) is stripped of the privilege to
-- read the cost columns, so it can't be scraped via the REST API directly.
--   • anon          → cannot read cost (below).
--   • authenticated → retains access (the admin panel reads cost as a logged-in
--                     admin). A logged-in customer could still query it via the
--                     API; to close that too, move admin cost reads to a
--                     service-role server route and revoke from authenticated.
--   • service_role  → full access (server routes / receive_purchase_order).
revoke select (cost_price)  on public.products         from anon;
revoke select (supplier_id) on public.products         from anon;
revoke select (cost_price)  on public.product_variants from anon;
revoke all on public.suppliers            from anon;
revoke all on public.purchase_orders      from anon;
revoke all on public.purchase_order_items from anon;

notify pgrst, 'reload schema';

select 'migration 016: procurement + pricing + P&L installed (cost hidden from anon)' as status;
