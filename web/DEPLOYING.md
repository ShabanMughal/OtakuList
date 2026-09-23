# Deploying the website

The site is a static Astro build served from the root of
**https://otakulist.pages.dev** (Cloudflare Pages), built and uploaded by
`.github/workflows/deploy.yml`. The old `shabanmughal.github.io/OtakuList`
address is now a redirect stub — see [Old GitHub Pages links](#old-github-pages-links).

The address lives in one place: `site` in [`astro.config.mjs`](astro.config.mjs).
Canonicals, `og:url`, `og:image` and the sitemap all read it back as
`import.meta.env.SITE`. If the Pages project name (or a custom domain) changes,
also update `robots.txt`, the stub in `github-pages-redirect/`, `--project-name`
in `deploy.yml`, and the two URLs in the extension (`FULL_LIST_URL` in
`src/popup.js`, the bridge host in `src/content.js`).

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
| URL | `https://otakulist.pages.dev/u/<username>` |
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

## Hosting — Cloudflare Pages

### 1. Create the Pages project (once)

`deploy.yml` uploads with `wrangler pages deploy`, which needs the project to
exist. Either create it as a **Direct Upload** project named `otakulist` in the
dashboard (**Workers & Pages → Create → Pages → Upload assets**), or:

```bash
npx wrangler pages project create otakulist --production-branch=main
```

Don't connect the Git integration as well — that would build every push twice.
Building in GitHub Actions is what keeps the hourly schedule and the Supabase
webhook trigger above working.

### 2. Secrets and variables

**GitHub → Settings → Secrets and variables → Actions:**

| Secret | Value |
| :--- | :--- |
| `CLOUDFLARE_API_TOKEN` | API token with **Account → Cloudflare Pages → Edit** |
| `CLOUDFLARE_ACCOUNT_ID` | shown in the Cloudflare dashboard sidebar |
| `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY` | already there — the build inlines them |

**Cloudflare → the Pages project → Settings → Variables and Secrets:** add
`PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` for Production. The build
doesn't need these (it runs in GitHub), but the showcase Function reads them at
request time. Without them it serves the generic card — never an error.

### 3. Supabase auth URLs

**Authentication → URL Configuration:**

- **Site URL:** `https://otakulist.pages.dev`
- **Redirect URLs:** add `https://otakulist.pages.dev/**`

Keep the old `shabanmughal.github.io` entries until you're sure nobody is
mid-sign-in there, then remove them.

### The showcase Function

[`functions/[[path]].js`](functions/%5B%5Bpath%5D%5D.js) renders previews at the
edge for the older `showcase.html?u=name` links, which the static `u/<name>`
pages can't cover:

- it runs only for the paths in [`public/_routes.json`](public/_routes.json) —
  `/showcase`, `/showcase.html` and `/OtakuList/*` — so the rest of the site is
  served statically and never counts against the Functions quota;
- Cloudflare serves `showcase.html` at `/showcase` (and 308s the `.html` form
  there), so it matches both;
- for a profile link it reads the row from Supabase and rewrites the `og:` and
  `twitter:` tags with `HTMLRewriter`; if Supabase is unreachable, the env vars
  are missing or the profile doesn't exist, it serves the page unchanged;
- anything still arriving with the old `/OtakuList/` prefix gets a 301 to the
  same path without it.

It builds its preview strings from
[`src/lib/showcase-meta.mjs`](src/lib/showcase-meta.mjs), the same module the
static route uses, so a profile can't unfurl one way here and another way there.

### Old GitHub Pages links

GitHub Pages can't send real redirects, so
[`.github/workflows/pages-redirect.yml`](../.github/workflows/pages-redirect.yml)
publishes [`github-pages-redirect/index.html`](../github-pages-redirect/index.html)
as both `index.html` and `404.html` (GitHub serves `404.html` for every unknown
path). It strips `/OtakuList` and forwards to the same path, query and hash on
the new site — so `…/OtakuList/showcase.html?u=name` and
`…/OtakuList/u/name.html` both land on the right profile.

Run it once after the first Cloudflare deploy (**Actions → GitHub Pages
redirect to Cloudflare → Run workflow**). It's a client-side hop, so crawlers
building a link preview won't follow it: an old link pasted into Discord shows
the "moved" card, and the new `pages.dev` links unfurl properly.

### Verify

```bash
curl -s "https://otakulist.pages.dev/u/<a-real-username>" | grep -i 'og:'
curl -sL "https://otakulist.pages.dev/showcase.html?u=<a-real-username>" | grep -i 'og:'
```

You should see that profile's name, its games and a character portrait. Then
check a real unfurl — Discord caches aggressively, so test with a fresh link or
use the [Facebook sharing debugger](https://developers.facebook.com/tools/debug/)
to force a re-scrape.

---

## What was deliberately left out

**A generated `og:image` card** showing all four featured characters composed
into one image. That needs an image-rendering service (Workers + Satori, or a
pre-rendered upload per profile) and is a bigger piece of work than the tags.
The single character portrait already gets most of the benefit.
