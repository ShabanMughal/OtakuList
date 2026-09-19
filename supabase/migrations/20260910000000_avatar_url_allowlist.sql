-- OtakuList · Gacha Showcase — constrain avatar_url to hosts we actually produce
--
-- RLS decides WHO may write a row, never WHAT they write. `avatar_url` is
-- rendered in a public gallery, so an arbitrary URL there lets any profile
-- owner log the IP and user-agent of everyone who browses it, and a
-- `javascript:` or `data:` value is an XSS waiting for the first render path
-- that puts it somewhere more dangerous than an <img src>.
--
-- Allowed: Google's OAuth picture CDN (what "Continue with Google" returns) and
-- this project's own Supabase storage, public-object paths only. NULL is
-- allowed — it simply means "no picture", and the UI draws initials instead.
--
-- The same rule is enforced client-side in web/public/js/showcase.js
-- (safeAvatarUrl). Neither layer is sufficient alone: the constraint stops a
-- hostile row being written through the API at all, the client stops one that
-- predates this migration from rendering.
--
-- Safe to re-run.

-- ─────────────────────────────────────────────────────────────────────
-- Neutralise any existing row that would violate the constraint, so adding
-- it cannot fail. Those users keep their profile and fall back to initials.
-- ─────────────────────────────────────────────────────────────────────
update public.profiles
set avatar_url = null
where avatar_url is not null
  and avatar_url !~ '^https://([a-z0-9-]+\.)?googleusercontent\.com/[^[:space:]]*$'
  and avatar_url !~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/[^[:space:]]*$';

alter table public.profiles
  drop constraint if exists profiles_avatar_url_allowlist;

alter table public.profiles
  add constraint profiles_avatar_url_allowlist check (
    avatar_url is null
    -- Google OAuth pictures: lh3.googleusercontent.com and siblings
    or avatar_url ~ '^https://([a-z0-9-]+\.)?googleusercontent\.com/[^[:space:]]*$'
    -- this project's Supabase storage, public objects only
    or avatar_url ~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/[^[:space:]]*$'
  );

comment on constraint profiles_avatar_url_allowlist on public.profiles is
  'avatar_url must be an https URL on Google''s picture CDN or this project''s Supabase public storage. Blocks arbitrary URLs used for visitor IP logging, and javascript:/data: schemes.';

-- ─────────────────────────────────────────────────────────────────────
-- Keep the signup trigger from writing a URL the constraint would reject:
-- an OAuth provider we have not allowlisted would otherwise fail the whole
-- signup rather than just skipping the picture.
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate text;
begin
  if coalesce(new.raw_user_meta_data->>'username', '') <> '' then
    candidate := coalesce(
      new.raw_user_meta_data->>'avatar_url',
      new.raw_user_meta_data->>'picture'
    );
    -- drop anything outside the allowlist instead of rejecting the signup
    if candidate is not null
       and candidate !~ '^https://([a-z0-9-]+\.)?googleusercontent\.com/[^[:space:]]*$'
       and candidate !~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/[^[:space:]]*$'
    then
      candidate := null;
    end if;

    insert into public.profiles (id, username, display_name, avatar_url)
    values (
      new.id,
      lower(new.raw_user_meta_data->>'username'),
      coalesce(
        new.raw_user_meta_data->>'display_name',
        new.raw_user_meta_data->>'full_name',
        new.raw_user_meta_data->>'name',
        ''
      ),
      candidate
    );
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
