// OtakuList background service worker.
// Keeps the toolbar badge showing how many anime are currently "watching".

const KEY = "animeList";

async function refreshBadge() {
  const data = await chrome.storage.local.get(KEY);
  const list = data[KEY] || {};
  const watching = Object.values(list).filter((a) => a.status === "watching").length;
  await chrome.action.setBadgeBackgroundColor({ color: "#8b5cf6" });
  await chrome.action.setBadgeText({ text: watching ? String(watching) : "" });
}

chrome.runtime.onInstalled.addListener(refreshBadge);
chrome.runtime.onStartup.addListener(refreshBadge);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[KEY]) refreshBadge();
});

// ---------- AniList resolver ----------
// Give every site a canonical AniList identity (id + poster) so the same anime
// is deduped across sites and always gets a reliable cover. Look up by id when
// the site exposes one (e.g. Miruro), otherwise search by title. Runs in the
// service worker so the page's CSP can't block the request. Results are cached.
const anilistCache = new Map();

const MEDIA_FIELDS =
  "id title{romaji english} coverImage{extraLarge large medium}";

function shapeMedia(m) {
  if (!m) return null;
  const img = m.coverImage || {};
  return {
    id: m.id,
    romaji: m.title?.romaji || null,
    english: m.title?.english || null,
    cover: img.extraLarge || img.large || img.medium || null,
  };
}

async function anilistRequest(query, variables) {
  const res = await fetch("https://graphql.anilist.co/", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`AniList ${res.status}`);
  const data = await res.json();
  return shapeMedia(data?.data?.Media);
}

async function resolveAnime({ id, title }) {
  const key = id ? `id:${id}` : `q:${String(title || "").trim().toLowerCase()}`;
  if (anilistCache.has(key)) return anilistCache.get(key);
  let result = null;
  try {
    result = id
      ? await anilistRequest(
          `query($id:Int){Media(id:$id,type:ANIME){${MEDIA_FIELDS}}}`,
          { id: Number(id) }
        )
      : title
      ? await anilistRequest(
          `query($s:String){Media(search:$s,type:ANIME){${MEDIA_FIELDS}}}`,
          { s: title }
        )
      : null;
  } catch {
    result = null;
  }
  anilistCache.set(key, result);
  return result;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "anilistResolve" && (msg.id || msg.title)) {
    resolveAnime({ id: msg.id, title: msg.title })
      .then((result) => sendResponse({ result }))
      .catch((err) => sendResponse({ result: null, error: String(err) }));
    return true; // keep the message channel open for the async response
  }
});
