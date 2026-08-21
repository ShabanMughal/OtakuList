-- OtakuList · Gacha Showcase — hand-picked cover characters
-- Lets a user choose up to 4 characters (from any of their games) to feature as
-- the cover on their showcase card. Stored as a JSON array of { game, name }.
alter table public.profiles
  add column if not exists featured jsonb not null default '[]'::jsonb;
