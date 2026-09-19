-- OtakuList · Gacha Showcase — shape and size limits on the JSON columns
--
-- `games` and `featured` are owner-writable jsonb on a table with PUBLIC read.
-- Without bounds, one account can park a multi-megabyte blob that every gallery
-- visitor then downloads, and unexpected fields reach the renderer.
--
-- NOTE: `games` is an ARRAY (its default is '[]'::jsonb), so the type check is
-- 'array', not 'object'. `anime_lists.list` is the object-shaped one.
--
-- Limits chosen to sit far above a real profile: six games, each with a handful
-- of fields and a comma-joined character list, lands around 1–2 KB. 16 KB is
-- roughly ten times the worst realistic case.
--
-- Safe to re-run.

-- ─────────────────────────────────────────────────────────────────────
-- Validator for the per-entry shape. A CHECK constraint cannot contain a
-- subquery, so the per-element test lives in an IMMUTABLE function.
-- Returns false for anything malformed; the constraint does the rejecting.
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.gs_games_valid(games jsonb)
returns boolean
language sql
immutable
parallel safe
as $$
  select
    jsonb_typeof(games) = 'array'
    and jsonb_array_length(games) <= 12
    and not exists (
      select 1
      from jsonb_array_elements(games) as e
      where jsonb_typeof(e) <> 'object'
         -- known games only; anything else is a client bug or a hand-crafted write
         or coalesce(e->>'game', '') not in ('genshin', 'hsr', 'zzz', 'wuwa', 'pgr', 'custom')
         -- per-field length caps
         or length(coalesce(e->>'customName', '')) > 40
         or length(coalesce(e->>'rank', ''))       > 16
         or length(coalesce(e->>'ign', ''))        > 40
         or length(coalesce(e->>'uid', ''))        > 24
         or length(coalesce(e->>'note', ''))       > 280
         or length(coalesce(e->>'chars', ''))      > 2000
    );
$$;

comment on function public.gs_games_valid(jsonb) is
  'True when a profiles.games array is well-shaped: known game keys and sane field lengths.';

-- ─────────────────────────────────────────────────────────────────────
-- Clamp anything already stored that would violate the new constraints, so
-- adding them cannot fail on existing data.
-- ─────────────────────────────────────────────────────────────────────
update public.profiles
set games = '[]'::jsonb
where not public.gs_games_valid(games) or pg_column_size(games) >= 16384;

update public.profiles
set featured = '[]'::jsonb
where jsonb_typeof(featured) <> 'array' or jsonb_array_length(featured) > 4;

-- ─────────────────────────────────────────────────────────────────────
-- Constraints
-- ─────────────────────────────────────────────────────────────────────
alter table public.profiles drop constraint if exists profiles_games_shape;
alter table public.profiles
  add constraint profiles_games_shape check (public.gs_games_valid(games));

alter table public.profiles drop constraint if exists profiles_games_size;
alter table public.profiles
  add constraint profiles_games_size check (pg_column_size(games) < 16384);

alter table public.profiles drop constraint if exists profiles_featured_shape;
alter table public.profiles
  add constraint profiles_featured_shape check (jsonb_typeof(featured) = 'array');

-- the UI already caps the cover at 4; enforce it where it cannot be bypassed
alter table public.profiles drop constraint if exists profiles_featured_max;
alter table public.profiles
  add constraint profiles_featured_max check (jsonb_array_length(featured) <= 4);

alter table public.profiles drop constraint if exists profiles_featured_size;
alter table public.profiles
  add constraint profiles_featured_size check (pg_column_size(featured) < 2048);

-- free-text fields are rendered on public pages; bound them too
alter table public.profiles drop constraint if exists profiles_display_name_len;
alter table public.profiles
  add constraint profiles_display_name_len check (char_length(coalesce(display_name, '')) <= 40);
