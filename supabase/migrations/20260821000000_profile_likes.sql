-- OtakuList · Gacha Showcase — profile likes
-- Any logged-in user can "like" another user's showcase. Likes are unique per
-- (profile, liker). A denormalised profiles.likes_count is kept in sync by a
-- trigger so galleries can show counts without an extra query per card.

-- running total on the profile itself
alter table public.profiles
  add column if not exists likes_count integer not null default 0;

create table if not exists public.profile_likes (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  liker_id   uuid not null references auth.users(id)     on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, liker_id)
);

alter table public.profile_likes enable row level security;

-- anyone may read likes (for counts and liked-state)
drop policy if exists "likes_select_public" on public.profile_likes;
create policy "likes_select_public"
  on public.profile_likes for select
  using (true);

-- a user may like (insert) only as themselves
drop policy if exists "likes_insert_own" on public.profile_likes;
create policy "likes_insert_own"
  on public.profile_likes for insert
  with check (auth.uid() = liker_id);

-- a user may remove only their own like
drop policy if exists "likes_delete_own" on public.profile_likes;
create policy "likes_delete_own"
  on public.profile_likes for delete
  using (auth.uid() = liker_id);

-- keep profiles.likes_count in sync. SECURITY DEFINER so it can update another
-- user's profile row (the liker is not the profile owner) past RLS.
create or replace function public.sync_profile_likes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    update public.profiles set likes_count = likes_count + 1 where id = new.profile_id;
  elsif (tg_op = 'DELETE') then
    update public.profiles set likes_count = greatest(0, likes_count - 1) where id = old.profile_id;
  end if;
  return null;
end;
$$;

drop trigger if exists profile_likes_sync on public.profile_likes;
create trigger profile_likes_sync
  after insert or delete on public.profile_likes
  for each row execute function public.sync_profile_likes();

-- backfill counts for any pre-existing likes (safe to re-run)
update public.profiles p
set likes_count = coalesce((select count(*) from public.profile_likes l where l.profile_id = p.id), 0);
