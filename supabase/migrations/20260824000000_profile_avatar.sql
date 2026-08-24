-- OtakuList · Gacha Showcase
-- Adds an avatar_url to profiles so showcases can display a real profile
-- picture (e.g. the one from a user's Google account) instead of initials.
--
-- Safe to re-run: uses IF NOT EXISTS / create-or-replace throughout.

-- ─────────────────────────────────────────────────────────────────────
-- Column
-- ─────────────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists avatar_url text;

comment on column public.profiles.avatar_url is
  'Profile picture URL (e.g. from Google OAuth user metadata).';

-- ─────────────────────────────────────────────────────────────────────
-- Capture display_name + avatar from OAuth metadata on sign-up too.
-- (Google sign-ups arrive without a username, so no row is created here —
--  the app collects a username afterwards and upserts the profile with the
--  avatar then. This keeps the email/password path populated as well.)
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.raw_user_meta_data->>'username', '') <> '' then
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
      coalesce(
        new.raw_user_meta_data->>'avatar_url',
        new.raw_user_meta_data->>'picture'
      )
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
