// OtakuList service worker — lets the installed app (home-screen PWA) open
// and show your list with no connection.
//
// Deliberately small:
//   • pages are network-first, so a deploy is picked up on the next open and
//     the cached copy is only a fallback for when you're offline;
//   • content-hashed build files, fonts and images are served from cache and
//     refreshed in the background; scripts that keep their name across
//     deploys (/js/*.js) are network-first like pages;
//   • nothing cross-origin is ever cached — Supabase (your account and list),
//     AniList and Google Fonts always go straight to the network.
//
// The list itself lives in localStorage / the cloud row, not here, so clearing
// this cache can never lose data.
const VERSION = "v2";
const CACHE = `otakulist-${VERSION}`;

// Enough to open the app offline on first launch after install.
const PRECACHE = [
  "/animelist",
  "/mangalist",
  "/js/animelist.js",
  "/js/pwa.js",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // One missing file must not stop the worker installing.
      .then((cache) => Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cloudflare Pages serves /animelist.html at /animelist (308 from the .html
// form). Store pages under that pretty path so either spelling finds them.
function pageKey(url) {
  const u = new URL(url);
  return u.origin + u.pathname.replace(/\.html$/, "").replace(/\/index$/, "/");
}

// Pages by their pretty path (no query, so a shared ?url= link still finds
// the cached page offline); everything else by its exact URL.
const cacheKey = (request) => (request.mode === "navigate" ? pageKey(request.url) : request.url);

async function fromNetworkThenCache(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    // A redirected response can't be handed back to a navigation, and an
    // error page isn't worth keeping.
    if (res.ok && !res.redirected) cache.put(cacheKey(request), res.clone());
    return res;
  } catch {
    return (
      (await cache.match(cacheKey(request))) ||
      // an uncached page opened offline still gets the app
      (request.mode === "navigate" && (await cache.match(pageKey(self.location.origin + "/animelist")))) ||
      Response.error()
    );
  }
}

async function fromCacheThenRefresh(event) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(event.request);
  const refresh = fetch(event.request)
    .then((res) => {
      if (res.ok) cache.put(event.request, res.clone());
      return res;
    })
    .catch(() => null);
  if (cached) {
    event.waitUntil(refresh);
    return cached;
  }
  return (await refresh) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Supabase, AniList, fonts…

  if (request.mode === "navigate") {
    event.respondWith(fromNetworkThenCache(request));
    return;
  }
  // Content-hashed build output and images never change under the same
  // name, so the cache can answer first.
  if (url.pathname.startsWith("/_astro/") || /\.(woff2?|png|jpe?g|webp|svg)$/.test(url.pathname)) {
    event.respondWith(fromCacheThenRefresh(event));
    return;
  }
  // /js/*.js, the manifest and data files keep their names across deploys:
  // network first, so an update is live on the next open, cache offline.
  if (/\.(js|css|webmanifest|json)$/.test(url.pathname)) {
    event.respondWith(fromNetworkThenCache(request));
  }
});
