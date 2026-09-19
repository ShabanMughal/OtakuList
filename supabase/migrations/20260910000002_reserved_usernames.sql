-- OtakuList · Gacha Showcase — reserved usernames
--
-- Signup is open and a username becomes a public URL under the project's own
-- domain, so names that read as official have to be off-limits. Enforced here
-- rather than only in the availability check, because that check is a courtesy
-- the client performs, not a gate anyone has to pass through.
--
-- Safe to re-run.

create or replace function public.gs_username_reserved(name text)
returns boolean
language sql
immutable
parallel safe
as $$
  select lower(coalesce(name, '')) in (
    'admin', 'administrator', 'api', 'support', 'staff', 'showcase', 'mod',
    'moderator', 'otakulist', 'system', 'root', 'help', 'official', 'security',
    'abuse', 'billing', 'contact', 'team', 'owner', 'null', 'undefined'
  );
$$;

comment on function public.gs_username_reserved(text) is
  'True for usernames that must not be claimed by ordinary accounts.';

-- Free any reserved name already taken by pushing it to a suffixed variant,
-- so adding the constraint cannot fail. (Normally a no-op.)
update public.profiles
set username = left(username, 17) || '_x'
where public.gs_username_reserved(username);

alter table public.profiles drop constraint if exists profiles_username_not_reserved;
alter table public.profiles
  add constraint profiles_username_not_reserved check (not public.gs_username_reserved(username));

-- ─────────────────────────────────────────────────────────────────────
-- Let a user delete their own showcase from the app.
--
-- profiles_delete_own already permits this, but deleting the row leaves the
-- auth user without a profile, which the app treats as "hasn't claimed a
-- username yet" — the correct state to land in.
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.gs_delete_my_profile()
returns void
language plpgsql
security invoker -- runs as the caller, so RLS still applies
set search_path = public
as $$
begin
  delete from public.profiles where id = auth.uid();
end;
$$;

comment on function public.gs_delete_my_profile() is
  'Deletes the calling user''s showcase. RLS applies: it can only ever remove your own row.';

revoke all on function public.gs_delete_my_profile() from public;
grant execute on function public.gs_delete_my_profile() to authenticated;
