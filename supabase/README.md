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

## Security notes
- The **anon key is public** — safe to commit. Data is protected by the RLS policies in the
  migration (anyone can read a showcase; only the owner can write theirs).
- **Never** commit the `service_role` key. It bypasses RLS.
