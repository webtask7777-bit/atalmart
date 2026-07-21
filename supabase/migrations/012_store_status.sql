-- 011_store_status.sql
--
-- Store availability switch for (a) rush handling — admin pauses new orders
-- when the dark store is slammed, and (b) pre-launch — show an "Opening Soon"
-- board while the warehouse isn't operational yet.
--
-- Lives on the singleton settings row (migration 010) so flipping it
-- propagates to every customer instantly (settings are DB-backed + hydrated).
--
--   open         → normal store
--   busy         → "We're handling heavy rush" banner + new orders paused
--   opening_soon → full "Opening Soon" board + ordering blocked (pre-launch)

alter table public.settings
  add column if not exists store_status text not null default 'open'
    check (store_status in ('open', 'busy', 'opening_soon')),
  add column if not exists store_status_message text not null default '';
