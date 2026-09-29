-- VoltGrid account data is deliberately separate from relayer and chain state.
-- This migration contains no secrets, wallet credentials, outcome metrics, or PII
-- beyond the optional display label a user chooses for their own account.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint profiles_display_name_length check (
    display_name is null or (length(btrim(display_name)) between 1 and 80)
  )
);

create table public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  default_scenario text not null default 'sunny',
  compact_navigation boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_preferences_scenario check (default_scenario in ('sunny', 'rainy', 'heatwave'))
);

create table public.linked_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  wallet_address text not null,
  chain_id bigint not null,
  verification_method text not null default 'eip191',
  verified_at timestamptz not null,
  unlinked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint linked_wallets_address_normalized check (
    wallet_address = lower(wallet_address)
    and wallet_address ~ '^0x[0-9a-f]{40}$'
  ),
  constraint linked_wallets_chain_id check (chain_id between 1 and 2147483647),
  constraint linked_wallets_verification_method check (verification_method = 'eip191'),
  constraint linked_wallets_dates check (unlinked_at is null or unlinked_at >= verified_at)
);

create table public.house_registration_drafts (
  draft_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null default 'House draft',
  solar_enabled boolean not null default false,
  battery_enabled boolean not null default false,
  battery_capacity_wh integer,
  updated_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  constraint house_registration_drafts_label_length check (length(btrim(label)) between 1 and 120),
  constraint house_registration_drafts_battery_shape check (
    (battery_enabled and battery_capacity_wh is not null and battery_capacity_wh between 1 and 100000)
    or (not battery_enabled and battery_capacity_wh is null)
  )
);

create table public.saved_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  day_id text not null,
  chain_id bigint not null,
  market_address text not null,
  scenario text not null,
  seed text not null,
  saved_at timestamptz not null,
  constraint saved_days_pk primary key (user_id, day_id),
  constraint saved_days_day_id_normalized check (
    day_id = lower(day_id) and day_id ~ '^0x[0-9a-f]{64}$'
  ),
  constraint saved_days_chain_id check (chain_id between 1 and 2147483647),
  constraint saved_days_market_address_normalized check (
    market_address = lower(market_address)
    and market_address ~ '^0x[0-9a-f]{40}$'
  ),
  constraint saved_days_scenario check (scenario in ('sunny', 'rainy', 'heatwave')),
  constraint saved_days_seed_length check (length(seed) between 1 and 256)
);

create index linked_wallets_user_id_idx on public.linked_wallets using btree (user_id);
create unique index linked_wallets_active_address_idx
  on public.linked_wallets using btree (chain_id, wallet_address)
  where unlinked_at is null;
create index house_registration_drafts_user_id_updated_at_idx
  on public.house_registration_drafts using btree (user_id, updated_at desc);
create index saved_days_user_id_saved_at_idx
  on public.saved_days using btree (user_id, saved_at desc);

alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.linked_wallets enable row level security;
alter table public.house_registration_drafts enable row level security;
alter table public.saved_days enable row level security;

create policy "profiles_select_own"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy "profiles_insert_own"
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);
create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
create policy "profiles_delete_own"
  on public.profiles for delete to authenticated
  using ((select auth.uid()) = id);

create policy "user_preferences_select_own"
  on public.user_preferences for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "user_preferences_insert_own"
  on public.user_preferences for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "user_preferences_update_own"
  on public.user_preferences for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "user_preferences_delete_own"
  on public.user_preferences for delete to authenticated
  using ((select auth.uid()) = user_id);

-- A linked wallet is only readable/removable by its owner. There is deliberately
-- no authenticated INSERT/UPDATE policy: a future server verifier must create a
-- row only after a fresh, expiring, single-use signature challenge is checked.
create policy "linked_wallets_select_own"
  on public.linked_wallets for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "linked_wallets_delete_own"
  on public.linked_wallets for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "house_registration_drafts_select_own"
  on public.house_registration_drafts for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "house_registration_drafts_insert_own"
  on public.house_registration_drafts for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "house_registration_drafts_update_own"
  on public.house_registration_drafts for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "house_registration_drafts_delete_own"
  on public.house_registration_drafts for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "saved_days_select_own"
  on public.saved_days for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "saved_days_insert_own"
  on public.saved_days for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "saved_days_update_own"
  on public.saved_days for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "saved_days_delete_own"
  on public.saved_days for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Explicit grants keep the migration safe when the Data API's automatic public
-- table exposure default changes. The wallet table has no write grant for the
-- authenticated client; its writes belong to a future verified server adapter.
grant usage on schema public to authenticated;
revoke all on table public.profiles, public.user_preferences,
  public.linked_wallets, public.house_registration_drafts, public.saved_days from anon, authenticated;
grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.user_preferences to authenticated;
grant select, delete on table public.linked_wallets to authenticated;
grant select, insert, update, delete on table public.house_registration_drafts to authenticated;
grant select, insert, update, delete on table public.saved_days to authenticated;
