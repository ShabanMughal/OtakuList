// OtakuList content script.
// Runs on every page, detects when you're watching an anime, and shows a small
// in-page card that lets you save it to your local watchlist.
(() => {
  const KEY = "animeList";
  const HOST_ID = "otakulist-host";
  const TOAST_ID = "otakulist-toast";
  // OtakuList logo mark — the Gojo character cutout, sits on the gradient tile.
  const MARK = `<img alt="OtakuList" src="${chrome.runtime.getURL("icons/character.png")}">`;

  // Load Poppins once into the host page so the shadow-DOM cards can use it.
  // Custom family name avoids clashing with any Poppins the page already defines.
  function ensureFont() {
    if (document.getElementById("otakulist-font")) return;
    const s = document.createElement("style");
    s.id = "otakulist-font";
    s.textContent = [400, 500, 600, 700]
      .map(
        (w) =>
          `@font-face{font-family:'OtakuPoppins';font-weight:${w};font-display:swap;` +
          `src:url('${chrome.runtime.getURL("fonts/poppins-" + w + ".woff2")}') format('woff2');}`
      )
      .join("");
    (document.head || document.documentElement).appendChild(s);
  }
  const FONT = "'OtakuPoppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

  // Anime we've already prompted about this page-load, so we don't nag.
  const dismissed = new Set();
  let lastKey = "";

  // ---------- storage helpers ----------
  const getList = () =>
    chrome.storage.local.get(KEY).then((d) => d[KEY] || {});

  const idFor = (title) =>
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  async function saveAnime(candidate, status) {
    const list = await getList();
    const id = idFor(candidate.title);
    const now = Date.now();
    const existing = list[id];
    list[id] = {
      id,
      title: candidate.title,
      status,
      currentEpisode: candidate.episode ?? existing?.currentEpisode ?? null,
      totalEpisodes: existing?.totalEpisodes ?? null,
      cover: candidate.cover || existing?.cover || null,
      site: candidate.domain,
      url: candidate.url,
      note: existing?.note || "",
      addedAt: existing?.addedAt || now,
      updatedAt: now,
    };
    await chrome.storage.local.set({ [KEY]: list });
    return list[id];
  }

  // ---------- detection ----------
  function metaContent(sel) {
    const el = document.querySelector(sel);
    return el ? el.getAttribute("content") : null;
  }

  function extractEpisode(str) {
    if (!str) return null;
    const m = String(str).match(/(?:episode|episodio|ep|epi|\be)[\s._:-]*?(\d{1,4})\b/i);
    return m ? parseInt(m[1], 10) : null;
  }

  function cleanTitle(raw) {
    let t = (raw || "").trim();
    // drop a trailing " - SiteName" / " | SiteName" segment (one level)
    t = t.replace(/\s*[|»·–—]\s*[^|»·–—]{0,40}$/, "");
    // cut everything from the episode marker onward
    t = t.replace(/\b(episode|episodio|ep|epi)\b.*$/i, "");
    // strip common streaming junk words
    t = t.replace(
      /\b(watch|online|streaming|free|full|hd|4k|1080p|720p|480p|english|sub(bed)?|dub(bed)?|subtitle[sd]?|kissanime|gogoanime)\b/gi,
      ""
    );
    t = t.replace(/[\s._-]{2,}/g, " ").replace(/[\s:|»·–—-]+$/g, "").trim();
    return t;
  }

  function getCandidate() {
    const url = location.href;
    const domain = location.hostname.replace(/^www\./, "");
    const rawTitle =
      metaContent('meta[property="og:title"]') ||
      metaContent('meta[name="title"]') ||
      document.title ||
      "";
    const title = cleanTitle(rawTitle);
    if (!title || title.length < 2) return null;
    const episode = extractEpisode(url) ?? extractEpisode(rawTitle);
    const cover = metaContent('meta[property="og:image"]') || null;
    return { title, episode, cover, url, domain };
  }

  // Search engines / big general sites where an "anime" mention is incidental.
  const BLOCKED_HOSTS =
    /(^|\.)(google|bing|duckduckgo|yahoo|yandex|baidu|ecosia|youtube|youtu|reddit|twitter|x|facebook|fb|instagram|tiktok|wikipedia|fandom|amazon|ebay|pinterest|quora|github|stackoverflow|chatgpt|openai)\.[a-z.]+$/;

  // Heuristic: is this an anime *watch* page or an anime detail page?
  // Only the URL PATH is inspected (not the query string), so a Google search for
  // "anime" — whose path is just "/search" — never triggers this.
  function looksLikeWatchPage() {
    const host = location.hostname.replace(/^www\./, "");
    if (BLOCKED_HOSTS.test(host)) return false;

    const path = location.pathname.toLowerCase();
    const hasVideo = !!document.querySelector("video");
    // "…/watch/…", "…-episode-12", "/ep/…", "/stream/…", "/play/…"
    const watchLike = /(\/watch|episode|-ep-?\d|\/ep[\/-]|\/stream|\/play)/.test(path);
    // detail pages: "/anime/…", "/series/…", "/title/…"
    const detailLike = /(\/anime\/|\/series\/|\/title\/)/.test(path);

    // A real player on a watch-style URL, OR a recognizable anime URL structure.
    return (hasVideo && watchLike) || watchLike || detailLike;
  }

  // ---------- UI ----------
  function removeBanner() {
    const host = document.getElementById(HOST_ID);
    if (host) host.remove();
  }

  function showBanner(candidate) {
    removeBanner();
    ensureFont();
    const host = document.createElement("div");
    host.id = HOST_ID;
    host.style.cssText =
      "all:initial;position:fixed;right:18px;bottom:18px;z-index:2147483647;";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host{ --bg:#17141f; --panel:#1e1b2e; --panel-2:#2a2540; --line:#3b3554;
          --text:#f4f2ff; --muted:#b0a9cf; --accent:#8b5cf6; --accent-2:#a78bfa; }
        *{box-sizing:border-box;font-family:${FONT};}
        .card{width:340px;background:var(--bg);color:var(--text);border:1px solid var(--line);
          border-radius:16px;box-shadow:0 16px 48px rgba(0,0,0,.55);overflow:hidden;
          animation:pop .25s ease;}
        @keyframes pop{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1}}
        /* header — mirrors the popup header */
        .head{position:relative;display:flex;align-items:center;gap:10px;
          padding:12px 14px;background:linear-gradient(135deg,#221d38,#17141f);
          border-bottom:1px solid var(--line);}
        .logo{width:34px;height:34px;display:grid;place-items:center;flex:none;
          background:linear-gradient(135deg,var(--accent),#6366f1);border-radius:10px;color:#fff;}
        .logo img{width:30px;height:30px;display:block;object-fit:contain;}
        .brand h1{margin:0;font-size:14px;font-weight:700;letter-spacing:.2px;}
        .brand p{margin:0;font-size:11px;color:var(--accent-2);font-weight:600;}
        .close{position:absolute;top:8px;right:10px;background:transparent;border:none;
          color:var(--muted);font-size:18px;width:24px;height:24px;padding:0;cursor:pointer;
          border-radius:6px;line-height:1;}
        .close:hover{background:var(--panel-2);color:var(--text);}
        /* body */
        .top{display:flex;gap:10px;padding:12px 14px 4px;}
        .cover{width:46px;height:62px;border-radius:8px;object-fit:cover;flex:none;
          background:var(--panel-2);display:grid;place-items:center;color:var(--muted);font-size:20px;}
        .meta{flex:1;min-width:0;}
        .title{margin:0;font-size:13px;font-weight:600;line-height:1.3;
          border:1px solid var(--line);background:var(--panel-2);color:#fff;
          border-radius:8px;padding:7px 9px;width:100%;outline:none;}
        .title:focus{border-color:var(--accent);}
        .ep{font-size:12px;color:var(--muted);margin:8px 0 0;}
        .ep b{color:var(--accent-2);}
        /* actions — primary + ghost like the popup buttons */
        .actions{display:flex;gap:8px;padding:12px 14px 14px;}
        .actions button{flex:1;border-radius:9px;padding:9px 6px;font-size:12px;
          font-weight:600;cursor:pointer;transition:.15s;}
        .watch{background:var(--accent);color:#fff;border:none;}
        .watch:hover{background:#7c46f0;}
        .plan{background:var(--panel-2);color:#d9d4f2;border:1px solid var(--line);}
        .plan:hover{background:#352f52;}
        .saved{padding:20px 14px;text-align:center;color:#c4f0d4;font-size:13px;font-weight:600;}
      </style>
      <div class="card">
        <div class="head">
          <span class="logo">${MARK}</span>
          <div class="brand">
            <h1>OtakuList</h1>
            <p>Detected while watching</p>
          </div>
          <button class="close" title="Dismiss">×</button>
        </div>
        <div class="top">
          ${candidate.cover ? `<img class="cover" src="${candidate.cover}" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'cover',textContent:'🎬'}))">` : `<div class="cover">🎬</div>`}
          <div class="meta">
            <input class="title" value="">
            <p class="ep">${candidate.episode ? `Episode <b>${candidate.episode}</b>` : "Episode not detected"}</p>
          </div>
        </div>
        <div class="actions">
          <button class="watch">▶ Watching</button>
          <button class="plan">＋ Plan to watch</button>
        </div>
      </div>`;

    // set title safely (avoid HTML injection from page title)
    const input = root.querySelector(".title");
    input.value = candidate.title;

    const finish = (msg) => {
      root.querySelector(".card").innerHTML = `<div class="saved">${msg}</div>`;
      setTimeout(removeBanner, 1400);
    };

    root.querySelector(".close").onclick = () => {
      dismissed.add(lastKey);
      removeBanner();
    };
    root.querySelector(".watch").onclick = async () => {
      candidate.title = input.value.trim() || candidate.title;
      await saveAnime(candidate, "watching");
      finish("✓ Saved to Watching");
    };
    root.querySelector(".plan").onclick = async () => {
      candidate.title = input.value.trim() || candidate.title;
      await saveAnime(candidate, "plan");
      finish("✓ Saved to Plan to Watch");
    };

    document.documentElement.appendChild(host);
  }

  // A small, non-interactive confirmation pill (used for silent auto-updates).
  function showToast(msg) {
    removeBanner();
    ensureFont();
    const old = document.getElementById(TOAST_ID);
    if (old) old.remove();
    const host = document.createElement("div");
    host.id = TOAST_ID;
    host.style.cssText = "all:initial;position:fixed;right:18px;bottom:18px;z-index:2147483647;";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        *{box-sizing:border-box;font-family:${FONT};}
        .toast{display:flex;align-items:center;gap:10px;background:#1e1b2e;color:#f4f2ff;
          border:1px solid #3b3554;border-radius:12px;padding:10px 14px 10px 10px;
          box-shadow:0 12px 32px rgba(0,0,0,.5);animation:in .25s ease;}
        @keyframes in{from{opacity:0;transform:translateY(10px)}to{opacity:1}}
        .logo{width:28px;height:28px;display:grid;place-items:center;flex:none;
          background:linear-gradient(135deg,#8b5cf6,#6366f1);border-radius:8px;color:#fff;}
        .logo img{width:24px;height:24px;display:block;object-fit:contain;}
        .txt{font-size:12px;line-height:1.35;} .txt b{color:#a78bfa;font-weight:700;}
      </style>
      <div class="toast">
        <span class="logo">${MARK}</span>
        <div class="txt"><b>OtakuList</b><br>${msg}</div>
      </div>`;
    document.documentElement.appendChild(host);
    setTimeout(() => host.remove(), 2600);
  }

  // ---------- driver ----------
  async function detect() {
    if (!looksLikeWatchPage()) return;
    const candidate = getCandidate();
    if (!candidate) return;
    const id = idFor(candidate.title);
    const key = candidate.domain + "|" + id + "|" + (candidate.episode ?? "");
    if (key === lastKey || dismissed.has(key)) return;
    lastKey = key;

    const list = await getList();
    const existing = list[id];

    // Already in "Watching" → advance the episode silently, no modal.
    if (existing && existing.status === "watching") {
      if (candidate.episode !== null && candidate.episode !== existing.currentEpisode) {
        existing.currentEpisode = candidate.episode;
        existing.url = candidate.url;
        existing.site = candidate.domain;
        if (candidate.cover && !existing.cover) existing.cover = candidate.cover;
        existing.updatedAt = Date.now();
        await chrome.storage.local.set({ [KEY]: list });
        showToast(`Updated to Episode <b>${candidate.episode}</b>`);
      }
      return; // don't interrupt the binge
    }

    // Brand-new anime, or one sitting in Plan/On Hold/Completed/Dropped
    // → show the modal so you can add it or move it to Watching.
    showBanner(candidate);
  }

  // ---------- navigation watching ----------
  // Re-detect on reloads, SPA route changes, hash changes, AND silent episode
  // swaps (many players change the episode without changing the URL at all).
  let lastSig = "";
  const currentSig = () => location.href + "|" + document.title;

  // A new episode's title/player usually loads a beat after navigation,
  // so we re-check a few times with a stagger.
  const scheduleDetect = () => [0, 700, 1600, 3000].forEach((d) => setTimeout(detect, d));

  function onNav() {
    lastKey = ""; // allow the modal to show again for the new episode
    scheduleDetect();
  }

  // Patch history so in-app "next episode" links trigger detection.
  for (const method of ["pushState", "replaceState"]) {
    const orig = history[method];
    history[method] = function () {
      const ret = orig.apply(this, arguments);
      onNav();
      return ret;
    };
  }
  window.addEventListener("popstate", onNav);
  window.addEventListener("hashchange", onNav);

  // Continuous fallback: catches episode changes that emit no navigation event.
  // detect() bails cheaply (before touching storage) when nothing has changed.
  setInterval(() => {
    const sig = currentSig();
    if (sig !== lastSig) {
      lastSig = sig;
      onNav();
    } else {
      detect(); // retry in case the title/player just finished loading
    }
  }, 2000);

  scheduleDetect(); // first pass on load
})();
