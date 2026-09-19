-- OtakuList · Gacha Showcase — text hygiene on public free-text fields
--
-- `display_name` (40 chars), each game's `customName` (40), `ign` (40) and
-- `note` (280) are free text rendered on public pages under this project's
-- domain, with signup open. 20260910000001 bounded their *length*; nothing
-- bounded their *content*.
--
-- Two things are worth stopping in the database rather than only in the client,
-- because RLS says who may write a row and never what the row contains:
--
--   1. Links. An open text box on someone else's domain is worth abusing
--      precisely because it is free.
--   2. Invisible and bidi control characters — zero-width joiners, RTL
--      overrides, directional isolates. They make a string render as something
--      other than what it contains, which is exactly how a display name gets
--      dressed up as "OtakuList Staff".
--
-- Deliberately NOT a content filter. There is no profanity list here and there
-- should not be: the ⚑ report link and self-delete cover what filtering cannot.
--
-- Scope, deliberately narrow. The constraint below rejects only the
-- unambiguous cases: an explicit scheme (`http://`, `https://`), a `www.`
-- prefix, and the invisible/bidi characters. Bare-domain detection is a
-- heuristic and stays client-side only (`LINKISH` in web/public/js/showcase.js),
-- where a false positive is a visibly cleaned field rather than an opaque save
-- failure the user cannot act on.
--
-- Existing rows are SCRUBBED, not blanked. Wiping a whole games array because
-- someone put a link in one note would cost them everything else in it.
--
-- Safe to re-run.

-- ─────────────────────────────────────────────────────────────────────
-- The characters that render as nothing, or flip the direction of what
-- follows. Listed one by one rather than as ranges so the set is readable
-- and cannot quietly widen.
--   00AD soft hyphen · 200B-200D zero-width space/non-joiner/joiner
--   200E-200F LTR/RTL marks · 202A-202E bidi embeddings and overrides
--   2066-2069 bidi isolates · FEFF byte-order mark
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.gs_invisible_class()
returns text
language sql
immutable
parallel safe
as $$
  select '[' || U&'\00AD\200B\200C\200D\200E\200F\202A\202B\202C\202D\202E\2066\2067\2068\2069\FEFF' || ']';
$$;

comment on function public.gs_invisible_class() is
  'Regex character class of invisible and bidi control characters that must not appear in public free text.';

-- True when a piece of public free text carries neither an explicit link nor an
-- invisible/bidi control character. NULL and '' are clean.
create or replace function public.gs_text_clean(t text)
returns boolean
language sql
immutable
parallel safe
as $$
  select coalesce(t, '') !~* '(https?://|www\.)'
     and coalesce(t, '') !~ public.gs_invisible_class();
$$;

comment on function public.gs_text_clean(text) is
  'False when public free text contains an explicit URL or an invisible/bidi control character. Bare-domain detection is client-side only, on purpose.';

-- What gs_text_clean rejects, removed — plus whitespace runs (newlines
-- included) collapsed, matching normalize()/cleanText() in showcase.js. Used to
-- clean rows written before this migration.
create or replace function public.gs_text_scrub(t text)
returns text
language sql
immutable
parallel safe
as $$
  select btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(coalesce(t, ''), '(?i)(https?://|www\.)\S*', '', 'g'),
        public.gs_invisible_class(), '', 'g'),
      '\s+', ' ', 'g')
  );
$$;

comment on function public.gs_text_scrub(text) is
  'Removes explicit links and invisible/bidi controls and collapses whitespace runs. The repair used on existing rows.';

-- ─────────────────────────────────────────────────────────────────────
-- Clean what is already stored, so adding the constraints cannot fail.
-- ─────────────────────────────────────────────────────────────────────
update public.profiles
set display_name = nullif(public.gs_text_scrub(display_name), '')
where not public.gs_text_clean(display_name);

-- Rebuild `games` element by element, keeping the array's order and every field
-- this migration has no opinion about.
update public.profiles p
set games = (
  select coalesce(jsonb_agg(
           e - 'customName' - 'ign' - 'note'
             || jsonb_strip_nulls(jsonb_build_object(
                  'customName', nullif(public.gs_text_scrub(e->>'customName'), ''),
                  'ign',        nullif(public.gs_text_scrub(e->>'ign'), ''),
                  'note',       nullif(public.gs_text_scrub(e->>'note'), '')))
           order by ord
         ), '[]'::jsonb)
  from jsonb_array_elements(p.games) with ordinality as t(e, ord)
)
where exists (
  select 1
  from jsonb_array_elements(p.games) as e
  where not public.gs_text_clean(e->>'customName')
     or not public.gs_text_clean(e->>'ign')
     or not public.gs_text_clean(e->>'note')
);

-- ─────────────────────────────────────────────────────────────────────
-- Constraints
-- ─────────────────────────────────────────────────────────────────────
alter table public.profiles drop constraint if exists profiles_display_name_clean;
alter table public.profiles
  add constraint profiles_display_name_clean check (public.gs_text_clean(display_name));

-- Fold the same test into the existing per-entry validator. Everything else in
-- it is unchanged from 20260910000001 — known game keys and the length caps.
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
         -- free text on a public page: no links, no invisible/bidi controls
         or not public.gs_text_clean(e->>'customName')
         or not public.gs_text_clean(e->>'ign')
         or not public.gs_text_clean(e->>'note')
    );
$$;

comment on function public.gs_games_valid(jsonb) is
  'True when a profiles.games array is well-shaped: known game keys, sane field lengths, and public free text free of links and invisible/bidi controls.';

-- Re-adding the constraint revalidates every row against the widened function.
alter table public.profiles drop constraint if exists profiles_games_shape;
alter table public.profiles
  add constraint profiles_games_shape check (public.gs_games_valid(games));
