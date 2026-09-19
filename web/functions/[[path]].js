// Cloudflare Pages Function — per-profile link previews for the Gacha Showcase.
//
// Why this exists: a showcase link is meant to be pasted into Discord. On a
// purely static host every `showcase.html?u=name` serves the same OG tags, so
// every profile unfurls as the generic OtakuList card. Discord, Twitter and
// friends do not run the page's JavaScript before building an embed, so
// injecting meta tags client-side cannot work — the tags have to be correct in
// the bytes we serve.
//
// Everything else on the site is untouched: this returns next() immediately for
// any request that is not a profile link, so the rest stays fully static.
//
// Requires two environment variables in the Pages project (same values the
// build already uses): PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY.
// Without them the function no-ops and you get the generic card back — which is
// exactly the current behaviour, never an error page.

// The preview strings themselves live in src/lib/showcase-meta.mjs, shared with
// the Astro route that generates one static page per profile for GitHub Pages
// (src/pages/u/[username].astro). Both hosts must unfurl a profile identically,
// so neither owns the format.
import { buildMeta } from "../src/lib/showcase-meta.mjs";

const SHOWCASE_PATHS = ["/OtakuList/showcase.html", "/showcase.html"];

const esc = (s) =>
  String(s == null ? "" : s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

async function fetchProfile(env, username) {
  const base = String(env.PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
  const key = String(env.PUBLIC_SUPABASE_ANON_KEY || "");
  if (!base || !key) return null;
  const url =
    `${base}/rest/v1/profiles` +
    `?select=username,display_name,games,featured,likes_count,avatar_url` +
    `&username=eq.${encodeURIComponent(username)}&limit=1`;
  const res = await fetch(url, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
    // the roster changes rarely and a profile rarely — let the edge cache help
    cf: { cacheTtl: 60, cacheEverything: true },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

// The character roster ships with the site, so we can resolve a portrait for
// the featured character and use it as the preview image.
async function fetchRoster(origin, basePath) {
  try {
    const res = await fetch(`${origin}${basePath}data/characters.json`, {
      cf: { cacheTtl: 3600, cacheEverything: true },
    });
    if (!res.ok) return {};
    return await res.json();
  } catch (_) {
    return {};
  }
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  // Fast path: everything that isn't a profile link stays static.
  if (!SHOWCASE_PATHS.includes(url.pathname)) return next();
  const username = url.searchParams.get("u");
  if (!username || !/^[a-z0-9_]{3,20}$/.test(username)) return next();

  const response = await next();
  const type = response.headers.get("content-type") || "";
  if (!type.includes("text/html")) return response;

  let profile = null;
  try {
    profile = await fetchProfile(env, username);
  } catch (_) {
    return response; // Supabase unreachable — serve the generic card
  }
  if (!profile) return response;

  const basePath = url.pathname.startsWith("/OtakuList/") ? "/OtakuList/" : "/";
  const roster = await fetchRoster(url.origin, basePath);
  const meta = buildMeta(profile, roster, url.href, `${url.origin}${basePath}assets/og-image.png`);

  // Rewrite the tags in place. Anything we don't recognise passes through.
  const replace = {
    "og:title": meta.title,
    "og:description": meta.description,
    "og:image": meta.image,
    "og:url": meta.url,
    "twitter:title": meta.title,
    "twitter:description": meta.description,
    "twitter:image": meta.image,
  };
  const seen = new Set();

  return new HTMLRewriter()
    .on("title", {
      element(el) {
        el.setInnerContent(meta.title);
      },
    })
    .on("meta", {
      element(el) {
        const key = el.getAttribute("property") || el.getAttribute("name");
        if (key && key in replace) {
          el.setAttribute("content", replace[key]);
          seen.add(key);
        }
        if (key === "description") el.setAttribute("content", meta.description);
      },
    })
    .on("head", {
      element(el) {
        // Add any tag the page didn't already have.
        for (const [key, value] of Object.entries(replace)) {
          if (seen.has(key)) continue;
          const attr = key.startsWith("og:") ? "property" : "name";
          el.append(`<meta ${attr}="${esc(key)}" content="${esc(value)}">`, { html: true });
        }
      },
    })
    .transform(response);
}
