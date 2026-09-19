# Deploying the website

The site is a static Astro build, published to GitHub Pages by
`.github/workflows/deploy.yml`. **Per-profile link previews work there** — see
below. The Cloudflare Pages option further down is an alternative route to the
same result, kept for the day this moves to a custom domain.

---

## Per-profile pages

A Gacha Showcase link is meant to be pasted into Discord. Discord, Twitter,
Slack and iMessage fetch the HTML and read its `og:` tags **without running the
page's JavaScript**, so the tags have to be correct in the bytes served — and on
a static host every `showcase.html?u=name` is the same bytes. Every profile
unfurled as the same generic OtakuList card.

[`src/pages/u/[username].astro`](src/pages/u/%5Busername%5D.astro) fixes that by
generating **one real HTML file per profile at build time**:

| | |
| :--- | :--- |
| URL | `https://shabanmughal.github.io/OtakuList/u/<username>.html` |
| Source of truth | `profiles` in Supabase, read over the REST API with the anon key |
| Contents | correct `<title>`, `og:*` and `twitter:*` tags, **and** the profile itself — display name, game cards, characters, likes |
| Preview image | the profile's first cover character's portrait, falling back to the site card |

`showcase.html?u=name` still works exactly as before; links in that shape were
shared before these pages existed. Only newly copied links use `u/<name>.html`.

Three things are worth knowing:

- **A Supabase problem cannot break a deploy.** Missing env vars, an outage, a
  500, a malformed body — [`src/lib/profiles.mjs`](src/lib/profiles.mjs) logs a
  warning and returns an empty list, and the landing page, anime list and
  gallery build and deploy normally. The only casualty is that profile pages
  are not regenerated that run.
- **The build is capped at 2000 profiles**, newest first, so build time cannot
  grow without bound. Hitting the cap logs a warning naming the constant to
  raise.
- **Pages are only as fresh as the last build**, which is what the triggers
  below are for. A page for a profile deleted since the last build shows the
  ordinary *Showcase not found* state, because `showcase.js` re-fetches the row
  at runtime and the live answer always wins over the baked-in copy.

### Keeping them fresh

`deploy.yml` runs hourly on a `schedule`, so nothing is ever more than an hour
stale without any extra setup.

For a near-instant update, point a Supabase **database webhook** at GitHub's
repository-dispatch endpoint. Optional — the hourly run is the floor, and the
webhook only shortens the wait.

1. Create a fine-grained **GitHub personal access token** with
   *Contents: read and write* on this repository only. (`repository_dispatch`
   needs write on contents; nothing else.)
2. In Supabase: **Database → Webhooks → Create a new hook**.
   - Table `public.profiles`, events **Insert** and **Update**
   - Type **HTTP Request**, method `POST`
   - URL `https://api.github.com/repos/ShabanMughal/OtakuList/dispatches`
   - Headers:
     ```
     Accept:        application/vnd.github+json
     Authorization: Bearer <your token>
     Content-Type:  application/json
     ```
   - Body:
     ```json
     { "event_type": "profiles-changed" }
     ```
3. Save, edit any profile, and check the run appears under **Actions**.

Two notes. The token lives in the Supabase dashboard, not in this repo — treat
it as a secret and rotate it if the hook is ever removed. And a burst of edits
fires a burst of builds; `concurrency: pages` with `cancel-in-progress` means
only the newest survives, which is the behaviour you want.

### Search indexing

Generated pages ship `<meta name="robots" content="noindex, follow">` unless the
profile's owner turned on **List my showcase in search results** in the editor
(`profiles.searchable`, added by
`supabase/migrations/20260919000000_profile_searchable.sql`). `sitemap.xml`
lists only the profiles that opted in.

This is deliberate: profiles carry in-game UIDs and IGNs, and being indexed is a
stronger, longer-lived form of public than "anyone with the link can look".
Unfurling ignores robots directives, so Discord previews work either way.

If that migration has not been applied, the build says so and treats every
profile as not-opted-in rather than failing.

---

## Option A — stay on GitHub Pages

Nothing to do. `.github/workflows/deploy.yml` already builds `web/` and
publishes, and per-profile pages come with it.

### Verify

After a deploy:

```bash
curl -s "https://shabanmughal.github.io/OtakuList/u/<a-real-username>.html" | grep -i 'og:'
```

You should see that profile's name, its games and a character portrait. Then
check a real unfurl — Discord caches aggressively, so test with a fresh link or
use the [Facebook sharing debugger](https://developers.facebook.com/tools/debug/)
to force a re-scrape.

## Option B — Cloudflare Pages

Not required for link previews any more; the static pages above cover that on
GitHub Pages. This stays as the upgrade path if the project ever moves to a
custom domain, where rendering previews at the edge lets `showcase.html?u=name`
unfurl too, with no build and no staleness.

[`functions/[[path]].js`](functions/%5B%5Bpath%5D%5D.js) is a Cloudflare Pages
Function that does exactly that, and nothing else:

- any request that is not `showcase.html?u=<valid-username>` returns `next()`
  immediately — the rest of the site stays completely static;
- for a profile link it reads the row from Supabase with the public anon key,
  and rewrites `og:title`, `og:description`, `og:image`, `og:url` and the
  `twitter:` equivalents via `HTMLRewriter`;
- if Supabase is unreachable, the env vars are missing, or the profile does not
  exist, it serves the original page unchanged. It degrades to the generic card,
  never to an error.

It builds its preview strings from
[`src/lib/showcase-meta.mjs`](src/lib/showcase-meta.mjs), the same module the
static route uses, so a profile cannot unfurl one way on one host and another
way on the other. The file is ignored by the Astro build, so **it is inert until
you deploy to Cloudflare**.

### 1. Create the Pages project

Connect the repo at **Cloudflare dashboard → Workers & Pages → Create → Pages**:

| Setting | Value |
| :--- | :--- |
| Root directory | `web` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Functions directory | `functions` (default; it sits at `web/functions`) |

### 2. Environment variables

Add both, for Production **and** Preview:

```
PUBLIC_SUPABASE_URL       = https://yourproject.supabase.co
PUBLIC_SUPABASE_ANON_KEY  = your_anon_public_key
```

The build needs them (they're inlined into the client JS) and the Function needs
them at request time. The anon key is public by design — RLS is what protects
the data.

### 3. Keep the `/OtakuList` base path

`astro.config.mjs` sets `base: '/OtakuList'`, and **leave it that way** unless
you are ready to deal with the fallout:

- every already-shared profile link contains `/OtakuList/`;
- the Supabase **Authentication → URL Configuration** redirect allowlist points
  at those paths.

The Function matches both `/OtakuList/showcase.html` and `/showcase.html`, so it
keeps working either way.

### 4. Update Supabase auth URLs

Add the new origin to **Authentication → URL Configuration → Redirect URLs**:

```
https://<your-project>.pages.dev/OtakuList/showcase.html
https://yourdomain.com/OtakuList/showcase.html     # if you attach a custom domain
```

Leave the existing GitHub Pages entries in place until you retire that origin —
removing them early breaks sign-in for anyone mid-session there.

### 5. Old links

`shabanmughal.github.io` cannot redirect to Cloudflare by itself. Pick one:

- **Keep both alive.** The GitHub Actions deploy keeps running; old links keep
  working, just without rich previews. Simplest, and nothing breaks.
- **Turn GitHub Pages into a redirect stub.** Replace the published site with a
  page that `<meta http-equiv="refresh">`es to the Cloudflare origin, preserving
  the query string. Old links then reach the new host — after a visible hop, and
  crawler previews still won't follow it.
- **Custom domain on Cloudflare.** The cleanest end state, but it doesn't
  rescue links already shared under the `github.io` origin.

This is a positioning decision, not a technical one — it is left to the
maintainer deliberately.

### 6. Verify

After the first deploy, check that the *query-string* form unfurls too — that is
the thing the Function adds over the static pages:

```bash
curl -s "https://<your-deploy>/OtakuList/showcase.html?u=<a-real-username>" | grep -i 'og:'
```

---

## What was deliberately left out

**A generated `og:image` card** showing all four featured characters composed
into one image. That needs an image-rendering service (Workers + Satori, or a
pre-rendered upload per profile) and is a bigger piece of work than the tags.
The single character portrait already gets most of the benefit.
