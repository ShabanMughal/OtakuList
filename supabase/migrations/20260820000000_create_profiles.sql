-- OtakuList · Gacha Showcase
-- Creates the `profiles` table that stores each user's username, display name
-- and their showcase games (as JSON), plus Row-Level Security so anyone can
-- READ a showcase but only the owner can WRITE their own.
--
-- Safe to re-run: uses IF NOT EXISTS / DROP … IF EXISTS throughout.

-- ─────────────────────────────────────────────────────────────────────
-- Table
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id           uuid        primary key references auth.users on delete cascade,
  username     text        unique not null,
  display_name text,
  games        jsonb       not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- 3–20 chars, lowercase letters / numbers / underscore only
  constraint username_format check (username ~ '^[a-z0-9_]{3,20}$')
);

comment on table public.profiles is 'Public gacha showcases — one row per user.';
comment on column public.profiles.games is 'Array of game cards: [{game,customName,rank,ign,uid,chars,note}, ...]';

-- ─────────────────────────────────────────────────────────────────────
-- Row-Level Security
-- ─────────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;

-- anyone (even logged-out) may view any showcase
drop policy if exists "profiles_select_public" on public.profiles;
create policy "profiles_select_public"
  on public.profiles for select
  using (true);

-- a user may create only their own row
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

-- a user may update only their own row
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- a user may delete only their own row
drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own"
  on public.profiles for delete
  using (auth.uid() = id);

-- ─────────────────────────────────────────────────────────────────────
-- Auto-touch updated_at on every update
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();
