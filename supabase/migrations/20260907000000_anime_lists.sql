-- OtakuList - private anime watchlists
-- One cloud-synced list per authenticated user. The JSON shape matches the
-- browser/extension list so export and import remain compatible.

create table if not exists public.anime_lists (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  list       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint anime_lists_list_object check (jsonb_typeof(list) = 'object')
);

comment on table public.anime_lists is 'Private cloud-synced OtakuList anime lists, one per authenticated user.';
comment on column public.anime_lists.list is 'Anime list keyed by title id, matching the browser list format.';

alter table public.anime_lists enable row level security;

drop policy if exists "anime_lists_select_own" on public.anime_lists;
create policy "anime_lists_select_own"
  on public.anime_lists for select
  using (auth.uid() = user_id);

drop policy if exists "anime_lists_insert_own" on public.anime_lists;
create policy "anime_lists_insert_own"
  on public.anime_lists for insert
  with check (auth.uid() = user_id);

drop policy if exists "anime_lists_update_own" on public.anime_lists;
create policy "anime_lists_update_own"
  on public.anime_lists for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "anime_lists_delete_own" on public.anime_lists;
create policy "anime_lists_delete_own"
  on public.anime_lists for delete
  using (auth.uid() = user_id);

drop trigger if exists anime_lists_set_updated_at on public.anime_lists;
create trigger anime_lists_set_updated_at
  before update on public.anime_lists
  for each row
  execute function public.set_updated_at();
