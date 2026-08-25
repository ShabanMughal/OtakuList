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
  // Miruro is an SPA: its URL, title, and player can update at different times.
  // Increment this whenever navigation starts so an older async detection cannot
  // write progress after the user has moved to another show.
  let navigationVersion = 0;

  // ---------- storage helpers ----------
  const getList = () =>
    chrome.storage.local.get(KEY).then((d) => d[KEY] || {});

  const idFor = (title) =>
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  // The same anime opened on a different site should map to the SAME entry, not
  // a duplicate. Match on the strongest identity available, in order:
  //   1. AniList id  — canonical across every site
  //   2. sourceId    — site's own id (e.g. Miruro)
  //   3. normalized title — last-resort textual match
  function findExistingKey(list, candidate) {
    const nk = normText(candidate.title);
    for (const [k, a] of Object.entries(list)) {
      if (!a) continue;
      if (candidate.anilistId && a.anilistId && String(a.anilistId) === String(candidate.anilistId))
        return k;
      if (candidate.sourceId && a.sourceId && String(a.sourceId) === String(candidate.sourceId))
        return k;
      if (nk && a.title && normText(a.title) === nk) return k;
    }
    return null;
  }

  async function saveAnime(candidate, status) {
    const list = await getList();
    const key = findExistingKey(list, candidate) || idFor(candidate.title);
    const now = Date.now();
    const existing = list[key];
    list[key] = {
      id: key,
      // Keep the title already stored (may be user-edited); only a brand-new
      // entry takes the title as detected on this site.
      title: existing?.title || candidate.title,
      status,
      currentEpisode: candidate.episode ?? existing?.currentEpisode ?? null,
      totalEpisodes: candidate.totalEpisodes ?? existing?.totalEpisodes ?? null,
      cover: candidate.cover || existing?.cover || null,
      site: candidate.domain,
      sourceId: candidate.sourceId || existing?.sourceId || null,
      anilistId: candidate.anilistId || existing?.anilistId || null,
      url: candidate.url,
      note: existing?.note || "",
      addedAt: existing?.addedAt || now,
      updatedAt: now,
    };
    await chrome.storage.local.set({ [KEY]: list });
    return list[key];
  }

  // ---------- detection ----------
  function metaContent(sel) {
    const el = document.querySelector(sel);
    return el ? el.getAttribute("content") : null;
  }

  function extractEpisode(str) {
    if (!str) return null;
    let value = String(str);
    try {
      const url = new URL(value, location.href);
      for (const name of ["ep", "episode", "epi", "episodio"]) {
        const param = url.searchParams.get(name);
        if (param && /^\d{1,4}$/.test(param)) return parseInt(param, 10);
      }
      value = `${url.pathname} ${url.search}`;
    } catch {
      // Not a valid URL, fall through to plain-text matching.
    }

    const m = value.match(/(?:episode|episodio|ep|epi|\be)[\s._:-]*=?\s*(\d{1,4})\b/i);
    return m ? parseInt(m[1], 10) : null;
  }

  function titleFromPath(pathname) {
    const ignore = new Set([
      "anime",
      "episode",
      "episodes",
      "ep",
      "stream",
      "play",
      "watch",
      "series",
      "title",
      "video",
      "player",
      "embed",
    ]);
    const segment = String(pathname)
      .split("/")
      .filter(Boolean)
      .reverse()
      .find((part) => /[a-z]/i.test(part) && !/^\d+$/.test(part) && !ignore.has(part.toLowerCase()));
    if (!segment) return "";
    return segment
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (ch) => ch.toUpperCase());
  }

  function isGenericTitle(title, domain) {
    const t = String(title || "").trim().toLowerCase();
    if (!t) return true;
    if (t.length < 3) return true;
    if (t === domain || t === `watch ${domain}`) return true;
    return /^(anime|episode|episodes|watch|stream|player|video|home|miruro)$/i.test(t);
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

  // og:image on many sites is a fixed site banner/logo rather than the anime's
  // own poster. Reject those by name so we fall back to the 🎬 placeholder
  // instead of saving a misleading site cover.
  function looksLikeSiteImage(src) {
    if (!src) return true;
    const s = src.toLowerCase();
    return /(logo|favicon|banner|header|brand|default|placeholder|no[-_]?(image|cover|poster|thumb)|og[-_]?image|site[-_]?(cover|image)|apple[-_]?touch)/.test(
      s
    );
  }

  const isHttp = (src) => !!src && /^https?:\/\//.test(src);

  // URLs from anime cover CDNs (AniList / MAL / Kitsu) or explicit cover/poster
  // paths. A strong positive signal that works even when the image is lazy-
  // loaded or off-screen and its pixel dimensions aren't readable yet.
  function looksLikeCoverUrl(src) {
    if (!isHttp(src) || looksLikeSiteImage(src)) return false;
    return /(anilistcdn\/media\/anime\/cover|myanimelist\.net\/images\/anime|kitsu\.[a-z]+\/.*posters|\/(covers?|posters?)\/)/i.test(
      src
    );
  }

  const normText = (s) =>
    String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  // Pages list many look-alike posters (sidebar recommendations, related
  // seasons), so "first match" grabs the wrong one. Instead score every image
  // and pick the best. The strongest signal for the MAIN poster is that its
  // alt/title matches the anime we detected; cover-CDN urls, poster containers,
  // and portrait shape reinforce it.
  function getCover(title) {
    const want = normText(title);
    const wantWords = new Set(want.split(" ").filter((w) => w.length > 2));
    const inPoster = new Set(
      Array.from(
        document.querySelectorAll(
          ".anisc-poster img, .film-poster img, .anime-poster img, .poster img, .cover img, img.poster, img.cover, img[itemprop='image']"
        )
      )
    );

    let best = null;
    let bestScore = 0;
    for (const img of Array.from(document.images || [])) {
      const src = img.currentSrc || img.src || img.getAttribute("data-src");
      if (!isHttp(src) || looksLikeSiteImage(src)) continue;
      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;
      const ratio = w && h ? h / w : 0;
      const portrait = ratio >= 1.2 && ratio <= 1.9 && w >= 80 && h >= 120;
      const coverUrl = looksLikeCoverUrl(src);
      // Skip images that show none of the poster hallmarks.
      if (!portrait && !coverUrl && !inPoster.has(img)) continue;

      let score = 1;
      const alt = normText(img.alt || img.title || img.getAttribute("aria-label"));
      if (want && alt) {
        if (alt === want || alt.includes(want) || want.includes(alt)) score += 8000;
        else {
          // partial word overlap for truncated/renamed titles
          const hits = [...wantWords].filter((word) => alt.includes(word)).length;
          if (hits) score += 1500 * (hits / wantWords.size);
        }
      }
      if (coverUrl) score += 1000;
      if (inPoster.has(img)) score += 500;
      if (portrait) score += 300;
      score += Math.min(w * h, 300000) / 1000; // size, capped so it can't dominate
      if (score > bestScore) {
        bestScore = score;
        best = src;
      }
    }
    if (best) return best;

    const meta =
      metaContent('meta[property="og:image"]') ||
      metaContent('meta[name="twitter:image"]');
    if (isHttp(meta) && !looksLikeSiteImage(meta)) return meta;
    return null;
  }

  // Miruro runs on several mirror TLDs (miruro.tv, miruro.to, …).
  const isMiruro = (domain) => /(^|\.)miruro\./.test(domain);

  // Ask the background worker to resolve an anime on AniList — by id (Miruro,
  // whose URLs carry the AniList media id) or by title search (every other
  // site). Returns {id, romaji, english, cover} or null on any failure.
  function resolveAnime(payload) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: "anilistResolve", ...payload }, (res) => {
          if (chrome.runtime.lastError) return resolve(null);
          resolve(res?.result || null);
        });
      } catch {
        resolve(null);
      }
    });
  }

  // Ask the background worker for several AniList matches for a free-text query,
  // used by the "Wrong anime?" corrector in the save card.
  function searchAnimeList(query) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: "anilistSearch", query }, (res) => {
          if (chrome.runtime.lastError) return resolve([]);
          resolve(res?.results || []);
        });
      } catch {
        resolve([]);
      }
    });
  }

  const escapeHtml = (s) =>
    String(s == null ? "" : s).replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );

  // Guard against a bad title-search hit: require real word overlap between the
  // detected title and AniList's romaji/english before adopting its id/cover.
  function titleMatchesResolved(title, resolved) {
    const want = new Set(normText(title).split(" ").filter((w) => w.length > 2));
    if (!want.size) return false;
    const got = normText([resolved.romaji, resolved.english].filter(Boolean).join(" "));
    if (!got) return false;
    let hits = 0;
    for (const w of want) if (got.includes(w)) hits++;
    return hits / want.size >= 0.5;
  }

  function miruroSourceId(pathname) {
    const match = String(pathname).match(/^\/watch\/(?:[^/]+\/)?(\d+)(?:\/|$)/i);
    return match ? match[1] : null;
  }

  function miruroEpisode(pathname) {
    const segment = String(pathname).split("/").filter(Boolean).pop() || "";
    const match = segment.match(/-(\d{1,4})$/);
    return match ? parseInt(match[1], 10) : null;
  }

  function getCandidate() {
    const url = location.href;
    const domain = location.hostname.replace(/^www\./, "");
    const pathTitle = titleFromPath(location.pathname);
    const rawTitle =
      (isMiruro(domain) ? document.title : null) ||
      metaContent('meta[property="og:title"]') ||
      metaContent('meta[name="title"]') ||
      "";
    const cleanedTitle = cleanTitle(rawTitle);
    // Episode routes contain a provider slug rather than the anime title, so
    // keep the page title for display and use Miruro's numeric id separately.
    const title = isGenericTitle(cleanedTitle, domain) && pathTitle ? pathTitle : cleanedTitle;
    if (!title || title.length < 2) return null;
    const episode =
      (isMiruro(domain) ? miruroEpisode(location.pathname) : null) ??
      extractEpisode(url) ??
      extractEpisode(document.querySelector(".ep-number")?.textContent) ??
      extractEpisode(rawTitle);
    const cover = getCover(title);
    return { title, episode, cover, url, domain, sourceId: miruroSourceId(location.pathname) };
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
        /* "Wrong anime?" corrector */
        .fix{background:transparent;border:none;color:var(--accent-2);font-size:11px;
          font-weight:600;cursor:pointer;padding:0;margin:6px 0 0;text-decoration:underline;}
        .fix:hover{color:var(--text);}
        .search{padding:2px 14px 6px;}
        .search-input{width:100%;font-size:12px;border:1px solid var(--line);
          background:var(--panel-2);color:#fff;border-radius:8px;padding:7px 9px;outline:none;}
        .search-input:focus{border-color:var(--accent);}
        .results{max-height:190px;overflow:auto;margin-top:6px;display:flex;
          flex-direction:column;gap:4px;}
        .res{display:flex;align-items:center;gap:8px;width:100%;text-align:left;
          background:var(--panel-2);border:1px solid var(--line);border-radius:8px;
          padding:5px 7px;cursor:pointer;color:var(--text);}
        .res:hover{background:#352f52;border-color:var(--accent);}
        .res img,.res .ph{width:30px;height:40px;border-radius:5px;object-fit:cover;
          flex:none;background:var(--bg);display:grid;place-items:center;font-size:14px;}
        .res-t{display:flex;flex-direction:column;min-width:0;}
        .res-t b{font-size:12px;font-weight:600;line-height:1.25;overflow:hidden;
          text-overflow:ellipsis;white-space:nowrap;}
        .res-t small{font-size:10px;color:var(--muted);}
        .hint{font-size:11px;color:var(--muted);padding:6px 2px;}
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
            <button class="fix" type="button">Wrong anime?</button>
          </div>
        </div>
        <div class="search" hidden>
          <input class="search-input" type="text" placeholder="Search the correct anime…">
          <div class="results"></div>
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

    // ── "Wrong anime?" corrector ──────────────────────────────────────
    // Detection is a guess; let the user search AniList and pick the right
    // show, which fixes the title, cover, canonical id and episode count.
    const fixBtn = root.querySelector(".fix");
    const searchPanel = root.querySelector(".search");
    const searchInput = root.querySelector(".search-input");
    const results = root.querySelector(".results");
    let searchTimer = 0;
    let hits = [];

    // Swap the card's cover thumbnail to a new source (falls back to 🎬).
    const setCover = (src) => {
      const cur = root.querySelector(".top .cover");
      if (!cur) return;
      const img = document.createElement("img");
      img.className = "cover";
      img.src = src;
      img.onerror = () =>
        img.replaceWith(
          Object.assign(document.createElement("div"), {
            className: "cover",
            textContent: "🎬",
          })
        );
      cur.replaceWith(img);
    };

    const renderResults = (items) => {
      if (!items.length) {
        results.innerHTML = `<div class="hint">No matches — try a different spelling.</div>`;
        return;
      }
      results.innerHTML = items
        .map((m, i) => {
          const name = m.english || m.romaji || "Untitled";
          const sub = [m.format, m.seasonYear].filter(Boolean).join(" · ");
          const thumb = m.cover
            ? `<img src="${escapeHtml(m.cover)}" alt="">`
            : `<span class="ph">🎬</span>`;
          return `<button class="res" type="button" data-i="${i}">${thumb}<span class="res-t"><b>${escapeHtml(
            name
          )}</b><small>${escapeHtml(sub)}</small></span></button>`;
        })
        .join("");
    };

    const runSearch = () => {
      const q = searchInput.value.trim();
      clearTimeout(searchTimer);
      if (!q) {
        results.innerHTML = "";
        return;
      }
      results.innerHTML = `<div class="hint">Searching…</div>`;
      searchTimer = setTimeout(async () => {
        const items = await searchAnimeList(q);
        if (!host.isConnected) return;
        hits = items;
        renderResults(items);
      }, 350);
    };

    fixBtn.onclick = () => {
      const opening = searchPanel.hidden;
      searchPanel.hidden = !opening;
      if (opening) {
        searchInput.value = input.value.trim() || candidate.title;
        searchInput.focus();
        searchInput.select();
        runSearch(); // pre-fill matches for the current title
      }
    };

    searchInput.addEventListener("input", runSearch);

    results.addEventListener("click", (e) => {
      const btn = e.target.closest(".res");
      if (!btn) return;
      const m = hits[Number(btn.dataset.i)];
      if (!m) return;
      const name = m.english || m.romaji || input.value;
      input.value = name;
      candidate.title = name;
      candidate.anilistId = String(m.id);
      candidate.sourceId = null; // the detected site id may belong to the wrong show
      if (m.cover) {
        candidate.cover = m.cover;
        setCover(m.cover);
      }
      if (m.episodes) candidate.totalEpisodes = m.episodes;
      searchPanel.hidden = true;
    });

    // The poster often loads a beat after the card (SPA info panels, lazy imgs).
    // If we opened without a cover, keep re-checking briefly and swap it in.
    if (!candidate.cover) {
      const top = root.querySelector(".top");
      let tries = 0;
      const timer = setInterval(() => {
        if (!host.isConnected || tries++ >= 8) return clearInterval(timer);
        const found = getCover(candidate.title);
        if (!found) return;
        candidate.cover = found;
        const img = document.createElement("img");
        img.className = "cover";
        img.src = found;
        img.onerror = () =>
          img.replaceWith(
            Object.assign(document.createElement("div"), {
              className: "cover",
              textContent: "🎬",
            })
          );
        top.querySelector(".cover").replaceWith(img);
        clearInterval(timer);
      }, 700);
    }

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
    const versionAtStart = navigationVersion;
    const urlAtStart = candidate.url;
    const id = idFor(candidate.title);
    const key = candidate.domain + "|" + (candidate.sourceId || "") + "|" + id + "|" + (candidate.episode ?? "");
    if (key === lastKey || dismissed.has(key)) return;
    lastKey = key;

    const list = await getList();

    // Do not trust a candidate captured before an SPA transition. The old
    // request may resolve after Miruro has already rendered a different anime.
    // Re-read the candidate as well as checking the navigation version because
    // some transitions update the DOM without changing history immediately.
    const current = getCandidate();
    if (
      versionAtStart !== navigationVersion ||
      location.href !== urlAtStart ||
      !current ||
      idFor(current.title) !== id ||
      current.sourceId !== candidate.sourceId ||
      current.episode !== candidate.episode
    ) {
      return;
    }

    // Resolve a canonical AniList identity so the same anime is deduped across
    // sites and gets a reliable poster. Trust the id on Miruro (it's in the
    // URL); elsewhere search by title and require it to actually match.
    const resolved = await resolveAnime(
      isMiruro(candidate.domain) && candidate.sourceId
        ? { id: candidate.sourceId }
        : { title: candidate.title }
    );
    // A slow lookup could resolve after the user moved on; re-verify context.
    if (versionAtStart !== navigationVersion || location.href !== urlAtStart) return;
    if (resolved && resolved.id) {
      const trusted =
        (isMiruro(candidate.domain) && candidate.sourceId) ||
        titleMatchesResolved(candidate.title, resolved);
      if (trusted) {
        candidate.anilistId = String(resolved.id);
        if (resolved.cover) candidate.cover = resolved.cover;
      }
    }

    const existingKey = findExistingKey(list, candidate);
    const existing = existingKey ? list[existingKey] : null;

    // Already in "Watching" → advance the episode silently, no modal.
    if (existing && existing.status === "watching") {
      if (candidate.episode !== null && candidate.episode !== existing.currentEpisode) {
        existing.currentEpisode = candidate.episode;
        existing.url = candidate.url;
        existing.site = candidate.domain;
        if (candidate.sourceId) existing.sourceId = candidate.sourceId;
        if (candidate.anilistId) existing.anilistId = candidate.anilistId;
        // Fill a missing cover, or replace an old one with a confident AniList
        // poster (fixes entries saved before cover detection improved).
        if (candidate.cover && (!existing.cover || looksLikeCoverUrl(candidate.cover)))
          existing.cover = candidate.cover;
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
    navigationVersion += 1;
    lastKey = ""; // allow the modal to show again for the new episode
    removeBanner();
    const toast = document.getElementById(TOAST_ID);
    if (toast) toast.remove();
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
  // Poll the URL separately from the slower retry loop. Some SPA routers keep
  // their own reference to history.pushState, so our history patch can miss a
  // route change even though the address bar changes without a page reload.
  setInterval(() => {
    const sig = currentSig();
    if (sig !== lastSig) {
      lastSig = sig;
      onNav();
    }
  }, 500);

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

  // ── website bridge ─────────────────────────────────────────────────────
  // Lets the OtakuList web app (Create list page) read the list saved by this
  // extension. Gated strictly to the official site + localhost so no other page
  // can ask the extension for your list.
  (function otakulistBridge() {
    const h = location.hostname;
    const allowed = h === "shabanmughal.github.io" || h === "localhost" || h === "127.0.0.1";
    if (!allowed) return;

    async function sendList() {
      const store = await chrome.storage.local.get(KEY);
      window.postMessage({ source: "otakulist-ext", type: "list", list: store[KEY] || {} }, location.origin);
    }

    window.addEventListener("message", (e) => {
      if (e.source !== window || e.origin !== location.origin) return;
      const d = e.data;
      if (d && d.source === "otakulist-web" && d.type === "request-list") sendList();
    });

    // announce we're here so the page can request immediately
    window.postMessage({ source: "otakulist-ext", type: "hello" }, location.origin);
    // reflect live edits (e.g. an episode auto-bumped while the tab is open)
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area === "local" && ch[KEY]) sendList();
    });
  })();
})();
