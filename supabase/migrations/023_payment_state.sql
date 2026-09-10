-- 023_payment_state.sql
-- Payment state as a first-class record (handoff v1.1, P0-A items 3 and 4).
--
-- Before this migration an order carried only `payment_method` and
-- `razorpay_payment_id`. There was no way to answer: is this order paid? was
-- this webhook already processed? how much cash did the rider actually remit?
-- Fulfilment state and payment state were the same field, so "delivered"
-- silently implied "paid".
--
-- Four objects:
--   orders.payment_status  — the payment state machine, separate from status
--   payments               — one row per gateway payment (order_id nullable:
--                            a capture whose /api/orders/place never ran is an
--                            orphan we must still see and refund)
--   refunds                — money going back out, traceable to a payment
--   cod_collections        — cash expected / collected / remitted, per order
--   payment_events         — every verified webhook, deduped by provider id
--
-- APPLY: Supabase Dashboard → SQL Editor → Run. Idempotent and additive; the
-- server degrades cleanly if it is deployed before this runs.

-- ── 1. Payment state on the order ────────────────────────────────────────
alter table public.orders
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists razorpay_order_id text,
  add column if not exists paid_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_payment_status_check'
  ) then
    alter table public.orders
      add constraint orders_payment_status_check
      check (payment_status in (
        'unpaid', 'pending', 'paid', 'failed', 'refunded', 'partially_refunded'
      ));
  end if;
end $$;

create index if not exists orders_payment_status_idx on public.orders (payment_status);
create index if not exists orders_razorpay_order_id_idx on public.orders (razorpay_order_id);

-- Backfill: existing online orders that carry a payment id were only ever
-- written after a verified capture, so they are paid. COD/UPI stay 'unpaid'
-- and are corrected by the operator.
update public.orders
   set payment_status = 'paid',
       paid_at = coalesce(paid_at, placed_at)
 where razorpay_payment_id is not null
   and payment_status = 'unpaid';

-- ── 2. Payments ──────────────────────────────────────────────────────────
create table if not exists public.payments (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid references public.orders (id) on delete set null,
  provider            text not null default 'razorpay',
  provider_payment_id text not null,
  provider_order_id   text,
  amount_paise        bigint not null check (amount_paise >= 0),
  currency            text not null default 'INR',
  status              text not null check (status in (
                        'created', 'authorized', 'captured', 'failed', 'refunded'
                      )),
  method              text,
  captured_at         timestamptz,
  raw                 jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint payments_provider_payment_unique unique (provider, provider_payment_id)
);

create index if not exists payments_order_id_idx on public.payments (order_id);
create index if not exists payments_provider_order_idx on public.payments (provider_order_id);
create index if not exists payments_orphan_idx on public.payments (created_at)
  where order_id is null;

-- ── 3. Refunds ───────────────────────────────────────────────────────────
create table if not exists public.refunds (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid references public.orders (id) on delete set null,
  payment_id         uuid references public.payments (id) on delete set null,
  provider           text not null default 'razorpay',
  provider_refund_id text,
  amount_paise       bigint not null check (amount_paise > 0),
  status             text not null default 'pending'
                       check (status in ('pending', 'succeeded', 'failed')),
  reason             text,
  created_by         uuid references auth.users (id),
  created_at         timestamptz not null default now(),
  settled_at         timestamptz,
  constraint refunds_provider_refund_unique unique (provider, provider_refund_id)
);

create index if not exists refunds_order_id_idx on public.refunds (order_id);

-- ── 4. Cash on delivery: collection is NOT delivery ───────────────────────
create table if not exists public.cod_collections (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null unique references public.orders (id) on delete cascade,
  rider_id        uuid references public.riders (id),
  expected_paise  bigint not null check (expected_paise >= 0),
  collected_paise bigint,
  collected_at    timestamptz,
  remitted_paise  bigint,
  remitted_at     timestamptz,
  notes           text,
  created_at      timestamptz not null default now()
);

create index if not exists cod_collections_rider_idx on public.cod_collections (rider_id);
create index if not exists cod_open_idx on public.cod_collections (created_at)
  where remitted_at is null;

-- Variance is derived, never stored: what the rider owes the store right now.
create or replace view public.cod_settlement
with (security_invoker = true) as
  select
    c.id,
    c.order_id,
    c.rider_id,
    r.name                                                      as rider_name,
    c.expected_paise,
    c.collected_paise,
    c.remitted_paise,
    coalesce(c.collected_paise, 0) - coalesce(c.remitted_paise, 0) as outstanding_paise,
    coalesce(c.collected_paise, c.expected_paise) - c.expected_paise as collection_variance_paise,
    c.collected_at,
    c.remitted_at
  from public.cod_collections c
  left join public.riders r on r.id = c.rider_id;

-- ── 5. Webhook events, deduped ───────────────────────────────────────────
create table if not exists public.payment_events (
  id               uuid primary key default gen_random_uuid(),
  provider         text not null default 'razorpay',
  provider_event_id text not null,
  event_type       text,
  payload          jsonb,
  received_at      timestamptz not null default now(),
  processed_at     timestamptz,
  processing_error text,
  constraint payment_events_provider_event_unique unique (provider, provider_event_id)
);

create index if not exists payment_events_type_idx on public.payment_events (event_type);
create index if not exists payment_events_unprocessed_idx on public.payment_events (received_at)
  where processed_at is null;

-- ── 6. RLS: admin reads, server writes ───────────────────────────────────
-- Every write goes through the service role in /api/orders/place and
-- /api/webhooks/razorpay, so there is deliberately NO insert/update policy.
do $$
declare t text;
begin
  foreach t in array array['payments', 'refunds', 'cod_collections', 'payment_events']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Admins can view %s" on public.%I', t, t);
    execute format(
      'create policy "Admins can view %s" on public.%I for select using (public.is_admin())',
      t, t
    );
  end loop;
end $$;

-- A customer may see the payment rows attached to their own order.
drop policy if exists "Users can view own payments" on public.payments;
create policy "Users can view own payments"
  on public.payments for select
  using (
    order_id is not null
    and exists (
      select 1 from public.orders o
      where o.id = payments.order_id and o.user_id = auth.uid()
    )
  );
