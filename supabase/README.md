# Supabase

Database setup for the **Gacha Showcase** and optional private **Anime List cloud sync** features.

## Run the migration

**Option A — SQL Editor (quickest):**
1. Open your project → **SQL Editor** → **New query**.
2. Paste the contents of [`migrations/20260820000000_create_profiles.sql`](migrations/20260820000000_create_profiles.sql).
3. Click **Run**. (Safe to re-run — it uses `IF NOT EXISTS` / `DROP … IF EXISTS`.)

**Option B — Supabase CLI:**
```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

## After the migration
1. **Authentication → Providers → Email**: make sure it's enabled (magic link is on by default).
2. **Authentication → URL Configuration**: add your site + local test URLs to the redirect allowlist, e.g.
   - `https://shabanmughal.github.io/OtakuList/showcase.html`
   - `http://localhost:8000/showcase.html`
3. **Project Settings → API**: copy the **Project URL** and **anon public key** into
   `docs/supabase-config.js`.

### Anime List cloud sync

Run [`migrations/20260907000000_anime_lists.sql`](migrations/20260907000000_anime_lists.sql) after the profiles
migrations. The Anime List page uses the `anime_lists` table only when a user signs in; its RLS policies allow each
authenticated user to read and update only their own list. Add the same public Supabase URL and anon key to
`web/.env`:

```dotenv
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
```

The **browser extension** syncs to the same `anime_lists` table, so one account covers both. Give it the same two
values with `node scripts/sync-ext-config.mjs`, which writes the gitignored `cloud-config.local.json` so they stay out
of the repo; without it the extension runs local-only. The extension calls the Supabase REST and Auth endpoints
directly (no SDK — MV3 forbids remote scripts), which the `https://*.supabase.co/*` host permission in `manifest.json`
allows. Sign-up from the extension uses email + password; if **Confirm email** is on, the user must click the emailed
link before the list starts syncing.

## Hardening migrations

Three later migrations tighten what may be *written*, as opposed to who may write it. RLS answers
"whose row is this?" and nothing else — a row's owner can still put anything they like in it, and
`profiles` is world-readable, so its contents reach every visitor.

| Migration | What it does |
| :--- | :--- |
| `20260910000000_avatar_url_allowlist.sql` | `avatar_url` must be an `https` URL on Google's picture CDN or this project's Supabase public storage. An arbitrary URL there would let any profile owner log the IP and user-agent of everyone browsing the gallery. Existing out-of-policy values are nulled (those users fall back to initials), and `handle_new_user()` now drops a disallowed picture instead of failing the whole signup. |
| `20260910000001_profile_payload_limits.sql` | Shape and size bounds on `games` / `featured`: known game keys only, per-field length caps, ≤ 4 cover characters, and a 16 KB ceiling — so one account cannot park a blob that every gallery visitor then downloads. Note `games` is an **array**; only `anime_lists.list` is object-shaped. |
| `20260910000002_reserved_usernames.sql` | Blocks `admin`, `support`, `otakulist`, … from being claimed, and adds `gs_delete_my_profile()` so a user can delete their own showcase from the app. |

The client enforces the same rules in `web/public/js/showcase.js` (`safeAvatarUrl`, the field caps,
`RESERVED_USERNAMES`). That is for error messages and for rows written before these migrations — the
constraints are what actually guarantee the bounds.

## Recommended auth settings

**Turn on Authentication → Providers → Email → Confirm email.** With signup open and unconfirmed,
`likes_count` can be farmed with throwaway addresses and stops meaning anything. Both the extension
popup and the website already handle the confirm-email flow and tell the user to check their inbox,
so this needs no code change — it is a dashboard toggle.

## Moderation

`display_name`, per-game notes and the custom game name are free text on public pages served from
this project's domain. Current handling:

- links and `@handles` are stripped on write (`stripLinks`) — enough that a profile is not a free
  billboard, not a content filter;
- every profile carries a **⚑ Report this profile** link that opens a pre-filled GitHub issue;
- a user can delete their own showcase from their profile page;
- to remove one as maintainer: `delete from public.profiles where username = '…';` in the SQL editor.
  That leaves the auth user intact, so they can claim a new username — ban the account under
  **Authentication → Users** if that is the intent.

## Security notes
- The **anon key is public** — safe to commit. Data is protected by the RLS policies in the
  migration (anyone can read a showcase; only the owner can write theirs).
- **Never** commit the `service_role` key. It bypasses RLS.
- RLS is not input validation. It controls *who writes a row*, never *what the row contains* —
  which is why the hardening migrations above exist.
