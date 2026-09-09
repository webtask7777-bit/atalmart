-- 021_expansion_requests.sql
-- "Notify me when you launch here" capture from the pincode gate.
-- When a visitor enters a non-serviceable pincode, they can leave a phone
-- number or email. This is demand data for deciding where to expand next.
--
-- APPLY: paste into Supabase Dashboard → SQL Editor → Run. Idempotent.
--
-- Writes go through /api/expansion/notify with the service-role client, so
-- there is NO anon insert policy — the table is not directly reachable with
-- the public anon key. Admins can read it (public.is_admin() from 011).

create table if not exists public.expansion_requests (
  id           uuid primary key default gen_random_uuid(),
  pincode      text not null check (pincode ~ '^\d{6}$'),
  contact      text not null,
  contact_type text not null check (contact_type in ('phone', 'email')),
  source       text not null default 'pincode_gate',
  user_agent   text,
  created_at   timestamptz not null default now(),
  -- One row per (pincode, contact): repeat submits are a no-op, not spam.
  constraint expansion_requests_unique unique (pincode, contact)
);

create index if not exists expansion_requests_pincode_idx
  on public.expansion_requests (pincode);

alter table public.expansion_requests enable row level security;

drop policy if exists "Admins can view expansion requests" on public.expansion_requests;
create policy "Admins can view expansion requests"
  on public.expansion_requests for select
  using (public.is_admin());

-- Handy rollup for the admin: which pincodes are people asking for most?
create or replace view public.expansion_demand as
  select pincode, count(*) as requests, max(created_at) as last_request_at
  from public.expansion_requests
  group by pincode
  order by requests desc, last_request_at desc;
