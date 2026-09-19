-- OtakuList · Gacha Showcase — per-profile search-engine opt-in
--
-- Each public profile now gets its own static page (web/src/pages/u/[username].astro)
-- so a link unfurls as that profile in Discord instead of as the generic site
-- card. A real page is also a page Google can index — and that is a stronger
-- form of public than "anyone with the link can look":
--
--   • profiles carry in-game UIDs and IGNs;
--   • a search result is permanent in a way a shared link is not, and stays in
--     the cache long after the profile is edited or deleted;
--   • nobody ticking "public profile" was agreeing to that.
--
-- Unfurling does not go through robots directives, so link previews work either
-- way. This column therefore controls search only: the generated page emits
-- <meta name="robots" content="noindex, follow"> unless it is true, and
-- sitemap.xml lists only the profiles that opted in.
--
-- Default false: opting in has to be a decision someone made.
--
-- Safe to re-run.

alter table public.profiles
  add column if not exists searchable boolean not null default false;

comment on column public.profiles.searchable is
  'Owner opted this profile into search-engine indexing. false ⇒ its static page is noindex and it is left out of sitemap.xml. Does not affect link previews, which ignore robots directives.';

-- Writes are already owner-only: profiles_update_own in
-- 20260820000000_create_profiles.sql scopes every update to auth.uid() = id,
-- and that covers new columns as they are added. No extra policy is needed —
-- and adding a column-specific one would not make it stricter.
