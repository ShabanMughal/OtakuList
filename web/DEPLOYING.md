# Deploying the website

The site is a static Astro build. It runs on GitHub Pages today; moving it to
Cloudflare Pages is what makes **per-profile link previews** work, because those
need a server to render the meta tags.

---

## Why move at all

A Gacha Showcase link is meant to be pasted into Discord. On a purely static
host every `showcase.html?u=name` serves identical `og:` tags, so every profile
unfurls as the same generic OtakuList card — the share feature technically works
and is practically pointless.

Client-side injection cannot fix this: Discord, Twitter, Slack and iMessage
fetch the HTML and read the tags **without running the page's JavaScript**. The
tags have to be correct in the bytes served.

[`functions/[[path]].js`](functions/%5B%5Bpath%5D%5D.js) is a Cloudflare Pages
Function that does exactly that, and nothing else:

- any request that is not `showcase.html?u=<valid-username>` returns `next()`
  immediately — the rest of the site stays completely static;
- for a profile link it reads the row from Supabase with the public anon key,
  and rewrites `og:title`, `og:description`, `og:image`, `og:url` and the
  `twitter:` equivalents via `HTMLRewriter`;
- the preview image is the profile's **first cover character's portrait**, which
  is the thing that makes a link worth pasting. It falls back to the site card;
- if Supabase is unreachable, the env vars are missing, or the profile does not
  exist, it serves the original page unchanged. It can degrade to today's
  behaviour, never to an error.

The file is ignored by the Astro build, so **it is inert until you deploy to
Cloudflare**. Committing it changes nothing about the current GitHub Pages site.

---

## Option A — stay on GitHub Pages

Nothing to do. `.github/workflows/deploy.yml` already builds `web/` and
publishes. Profile links will keep unfurling as the generic card.

## Option B — Cloudflare Pages (enables link previews)

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

After the first deploy:

```bash
curl -s "https://<your-deploy>/OtakuList/showcase.html?u=<a-real-username>" | grep -i 'og:'
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
