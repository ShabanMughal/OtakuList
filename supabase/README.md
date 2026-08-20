# Supabase

Database setup for the **Gacha Showcase** feature (`docs/showcase.html`).

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

## Security notes
- The **anon key is public** — safe to commit. Data is protected by the RLS policies in the
  migration (anyone can read a showcase; only the owner can write theirs).
- **Never** commit the `service_role` key. It bypasses RLS.
