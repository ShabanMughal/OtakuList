-- OtakuList · Gacha Showcase
-- Auto-create a public.profiles row when a new auth user signs up, using the
-- username they passed in sign-up metadata (options.data.username).
-- Runs as SECURITY DEFINER so it can insert past RLS.
--
-- Uniqueness is still guaranteed by the UNIQUE constraint on profiles.username:
-- if the username is taken, this insert fails and the whole sign-up is rejected.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- only create a profile if a username was provided at sign-up
  if coalesce(new.raw_user_meta_data->>'username', '') <> '' then
    insert into public.profiles (id, username, display_name)
    values (
      new.id,
      lower(new.raw_user_meta_data->>'username'),
      coalesce(new.raw_user_meta_data->>'display_name', '')
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
