// OtakuList — web Anime & Manga List app.
// Standalone list manager stored in this browser's localStorage, using the SAME
// data shape as the extension so backups (Export/Import JSON) move between them.
(function () {
  const $ = (s) => document.querySelector(s);
  const KEY = "otakulist-animelist";
  const VIEWKEY = "otakulist-view";
  const STATUSES = { watching: "Watching", plan: "Plan to Watch", completed: "Completed", onhold: "On Hold" };
  // Manga share the status keys (one list format for sync and backups); only
  // the words differ.
  const MANGA_STATUSES = { watching: "Reading", plan: "Plan to Read", completed: "Completed", onhold: "On Hold" };
  const statusLabels = (type) => (type === "manga" ? MANGA_STATUSES : STATUSES);
  // Entries without a type predate manga support, so they are anime.
  const typeOf = (a) => (a && a.type === "manga" ? "manga" : "anime");
  const FORMATS = { manga: "Manga", manhwa: "Manhwa", manhua: "Manhua", novel: "Light Novel" };
  const CLOUD = typeof sb !== "undefined" && !!sb;
  let cloudUser = null;
  let cloudReady = false;
  let cloudTimer = null;

  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );

  // A delete writes a tombstone — { id, deleted:true, updatedAt } — rather than
  // dropping the key, so it survives a merge with the extension or another
  // device that still holds its copy. Every read below filters them out.
  const isTombstone = (a) => !!a && a.deleted === true;
  const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

  let state = load();
  // animelist.html and mangalist.html share this script and the one list;
  // the page says which half of it to show.
  const root = document.querySelector("[data-list-type]");
  const activeType = root && root.dataset.listType === "manga" ? "manga" : "anime";
  let activeTab = "watching";
  let query = "";
  let sort = "updated";
  let view = localStorage.getItem(VIEWKEY) === "list" ? "list" : "grid";

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
      // Expire tombstones once every device has had ample time to see them.
      const now = Date.now();
      for (const [id, a] of Object.entries(raw)) {
        if (isTombstone(a) && now - (a.updatedAt || 0) > TOMBSTONE_TTL_MS) delete raw[id];
      }
      return raw;
    } catch (_) {
      return {};
    }
  }
  function save() {
    localStorage.setItem(KEY, JSON.stringify(state));
    if (cloudReady) {
      clearTimeout(cloudTimer);
      cloudTimer = setTimeout(saveCloud, 500);
    }
  }

  function cloudStatus(text) {
    const el = $("#al-cloud-status");
    if (el) el.textContent = text || "";
  }

  // Which account this browser's list was last synced with. Signing in as the
  // same account (or with a list that never belonged to one) merges; a
  // different account's list is replaced, never merged into theirs.
  const OWNERKEY = "otakulist-animelist-owner";

  // Union of both; where a title exists in each, the later edit wins —
  // tombstones included, so deletes stick. Same rule as the extension.
  function mergeLists(local, remote) {
    const merged = { ...remote };
    for (const [k, item] of Object.entries(local)) {
      if (!item || typeof item !== "object") continue;
      const rival = merged[k];
      if (!rival || (item.updatedAt || 0) > (rival.updatedAt || 0)) merged[k] = item;
    }
    return merged;
  }

  async function saveCloud() {
    if (!cloudUser || !cloudReady) return;
    cloudStatus("Saving…");
    const { error } = await sb.from("anime_lists").upsert({ user_id: cloudUser.id, list: state }, { onConflict: "user_id" });
    cloudStatus(error ? "Cloud save failed" : "Synced");
  }

  async function loadCloud(user) {
    cloudUser = user;
    const { data, error } = await sb.from("anime_lists").select("list").eq("user_id", user.id).maybeSingle();
    if (error) {
      cloudStatus("Cloud sync unavailable");
      return;
    }
    const remote = data && data.list && typeof data.list === "object" && !Array.isArray(data.list) ? data.list : {};
    const owner = localStorage.getItem(OWNERKEY);
    // Anything added before the cloud answered (e.g. straight from the share
    // sheet) must survive the load.
    const next = !owner || owner === user.id ? mergeLists(state, remote) : remote;
    const needsPush = JSON.stringify(next) !== JSON.stringify(remote);
    state = next;
    localStorage.setItem(KEY, JSON.stringify(state));
    localStorage.setItem(OWNERKEY, user.id);
    cloudReady = true;
    if (needsPush) await saveCloud();
    // The extension's copy may be newer than the cloud row (e.g. it was
    // offline); fold it back in so a cloud load can't hide those edits.
    mergeExt();
    cloudStatus("Synced");
    render();
  }

  async function initCloud() {
    if (!CLOUD) return;
    const { data } = await sb.auth.getSession();
    if (data.session) {
      await loadCloud(data.session.user);
    }
    sb.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session) {
        await loadCloud(session.user);
      } else if (event === "SIGNED_OUT") {
        cloudUser = null;
        cloudReady = false;
        cloudStatus("");
      }
    });
  }

  const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  // ── sorting ──────────────────────────────────────────────────────────
  function sortList(arr) {
    const a = arr.slice();
    if (sort === "title") return a.sort((x, y) => x.title.localeCompare(y.title));
    if (sort === "added") return a.sort((x, y) => (y.addedAt || 0) - (x.addedAt || 0));
    if (sort === "episode") return a.sort((x, y) => (y.currentEpisode || 0) - (x.currentEpisode || 0));
    return a.sort((x, y) => (y.updatedAt || 0) - (x.updatedAt || 0)); // updated
  }

  // ── rendering ────────────────────────────────────────────────────────
  function starsHtml(rating) {
    let s = "";
    for (let i = 1; i <= 5; i++)
      s += `<button class="al-star ${i <= rating ? "on" : ""}" data-act="rate" data-val="${i}" title="${i} star${i > 1 ? "s" : ""}">★</button>`;
    return `<div class="al-stars">${s}</div>`;
  }

  function cardHtml(a) {
    const manga = typeOf(a) === "manga";
    const icon = manga ? "📖" : "🎬";
    const noun = manga ? "chapter" : "episode";
    const cover = a.cover
      ? `<img class="al-cover" src="${esc(a.cover)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'al-cover al-cover-ph',textContent:'${icon}'}))">`
      : `<div class="al-cover al-cover-ph">${icon}</div>`;
    const total = a.totalEpisodes ? ` <span class="al-dim">/ ${esc(a.totalEpisodes)}</span>` : "";
    const cur = a.currentEpisode ?? 0;
    // Some sites number from episode 1 of the whole series; shown alongside
    // rather than written into progress against a season count.
    const abs =
      a.absoluteEpisode && a.absoluteEpisode !== a.currentEpisode
        ? ` <span class="al-dim" title="Absolute episode number across the whole series">· abs. ${esc(a.absoluteEpisode)}</span>`
        : "";
    const siteLink = a.url
      ? `<a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.site || "open")}</a>`
      : esc(a.site || "");
    const options = Object.entries(statusLabels(typeOf(a)))
      .map(([v, label]) => `<option value="${v}" ${v === a.status ? "selected" : ""}>${label}</option>`)
      .join("");
    const resume = a.url
      ? `<a class="al-iconbtn" href="${esc(a.url)}" target="_blank" rel="noopener" title="Resume where you left off">▶</a>`
      : "";
    const hasNote = a.note && a.note.trim();
    return `
    <article class="al-card" data-id="${esc(a.id)}">
      ${cover}
      <div class="al-cbody">
        <div class="al-title" title="${esc(a.title)}">${esc(a.title)}${manga && a.format ? `<span class="al-format">${esc(a.format)}</span>` : ""}</div>
        <div class="al-site">${siteLink}</div>
        <div class="al-ep">
          <button class="al-step" data-act="dec" title="Previous ${noun}">−</button>
          <span>${manga ? "Ch" : "Ep"} <b>${esc(cur)}</b>${total}${abs}</span>
          <button class="al-step" data-act="inc" title="Next ${noun}">＋</button>
        </div>
        ${starsHtml(a.rating || 0)}
        <div class="al-actions">
          <select class="al-status" data-act="status">${options}</select>
          ${resume}
          <button class="al-iconbtn ${hasNote ? "on" : ""}" data-act="notetoggle" title="Add / edit note">✎</button>
          <button class="al-iconbtn al-del" data-act="del" title="Remove">🗑</button>
        </div>
        <textarea class="al-note" data-act="noteedit" placeholder="Add a note…" rows="2" ${hasNote ? "" : "hidden"}>${esc(a.note || "")}</textarea>
      </div>
    </article>`;
  }

  function render() {
    const everything = Object.values(state).filter((a) => !isTombstone(a));
    const labels = statusLabels(activeType);
    // anime / manga page links show how many each holds
    document.querySelectorAll(".al-kind").forEach((k) => {
      k.querySelector(".n").textContent = everything.filter((a) => typeOf(a) === k.dataset.type).length;
    });
    const all = everything.filter((a) => typeOf(a) === activeType);
    // tab counts
    document.querySelectorAll(".al-tab").forEach((t) => {
      const s = t.dataset.status;
      t.classList.toggle("on", s === activeTab);
      t.querySelector(".n").textContent = all.filter((a) => a.status === s).length;
    });
    $("#al-count").textContent = `${all.length} ${activeType === "manga" ? "manga" : "anime"} saved`;

    const q = query.trim().toLowerCase();
    const list = sortList(
      all.filter((a) => a.status === activeTab).filter((a) => !q || a.title.toLowerCase().includes(q))
    );

    const grid = $("#al-grid");
    grid.className = view === "list" ? "al-list" : "al-grid";
    if (!list.length) {
      grid.innerHTML = "";
      $("#al-empty").hidden = false;
      $("#al-empty").innerHTML = all.length
        ? `<h3>Nothing in ${esc(labels[activeTab])}</h3><p>${q ? "No titles match your search." : "Move a title here, or add one."}</p>`
        : (activeType === "manga"
            ? `<h3>No manga yet</h3><p>Add a manga, manhwa or manhua, paste a link to the chapter you're on, or bring your list over from the extension.</p>`
            : `<h3>Your list is empty</h3><p>Add a show, paste a link to the episode you're on, or bring your list over from the extension.</p>`) +
          `<div class="al-empty-acts">
            <button type="button" class="al-act al-act-primary" data-empty="add">＋ Add ${activeType === "manga" ? "manga" : "anime"}</button>
            <button type="button" class="al-act al-act-soft" data-empty="paste">🔗 Paste link</button>
            <button type="button" class="al-act" data-empty="import">⬆ Import backup</button>
          </div>`;
    } else {
      $("#al-empty").hidden = true;
      grid.innerHTML = list.map(cardHtml).join("");
      enhanceSelects(grid);
    }
  }

  // ── card interactions ────────────────────────────────────────────────
  $("#al-grid").addEventListener("click", (e) => {
    const card = e.target.closest(".al-card");
    if (!card) return;
    const el = e.target.closest("[data-act]");
    if (!el) return;
    const act = el.dataset.act;
    const item = state[card.dataset.id];
    if (!item) return;

    if (act === "inc" || act === "dec") {
      // Chapters can be fractional (110.5); a step lands back on a whole number.
      const cur = item.currentEpisode ?? 0;
      item.currentEpisode = Math.max(0, act === "inc" ? Math.floor(cur) + 1 : Math.ceil(cur) - 1);
      item.updatedAt = Date.now();
      save();
      render();
    } else if (act === "rate") {
      const val = parseInt(el.dataset.val, 10);
      item.rating = item.rating === val ? 0 : val;
      item.updatedAt = Date.now();
      save();
      render();
    } else if (act === "del") {
      const id = card.dataset.id;
      state[id] = { id, deleted: true, updatedAt: Date.now() };
      save();
      render();
    } else if (act === "notetoggle") {
      const ta = card.querySelector(".al-note");
      ta.hidden = !ta.hidden;
      if (!ta.hidden) ta.focus();
    }
  });
  $("#al-grid").addEventListener("change", (e) => {
    const card = e.target.closest(".al-card");
    const el = e.target.closest("[data-act='status']");
    if (!card || !el) return;
    const item = state[card.dataset.id];
    if (!item) return;
    item.status = el.value;
    item.updatedAt = Date.now();
    save();
    activeTab = item.status;
    render();
  });
  $("#al-grid").addEventListener("input", (e) => {
    const card = e.target.closest(".al-card");
    const el = e.target.closest("[data-act='noteedit']");
    if (!card || !el) return;
    const item = state[card.dataset.id];
    if (!item) return;
    item.note = el.value;
    item.updatedAt = Date.now();
    save();
  });

  // ── toolbar ──────────────────────────────────────────────────────────
  document.querySelectorAll(".al-tab").forEach((t) =>
    t.addEventListener("click", () => {
      activeTab = t.dataset.status;
      render();
    })
  );
  $("#al-search").addEventListener("input", (e) => {
    query = e.target.value;
    render();
  });
  $("#al-sort").addEventListener("change", (e) => {
    sort = e.target.value;
    render();
  });
  document.querySelectorAll(".al-vbtn").forEach((b) =>
    b.addEventListener("click", () => {
      view = b.dataset.view;
      localStorage.setItem(VIEWKEY, view);
      document.querySelectorAll(".al-vbtn").forEach((x) => x.classList.toggle("on", x === b));
      render();
    })
  );

  // ── add modal ────────────────────────────────────────────────────────
  const modal = $("#al-modal");
  const openModal = () => {
    modal.hidden = false;
    $("#al-f-title").focus();
  };
  const closeModal = () => {
    modal.hidden = true;
    $("#al-form").reset();
  };
  $("#al-add").addEventListener("click", openModal);
  $("#al-modal-close").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
  $("#al-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const title = $("#al-f-title").value.trim();
    if (!title) return;
    const kind = $("#al-f-type").value;
    const manga = kind !== "anime";
    // Same key scheme as the extension: manga keys are prefixed so a manga
    // never overwrites the anime of the same name.
    const id = (manga ? "manga-" : "") + (slug(title) || String(Date.now()));
    const now = Date.now();
    const ep = $("#al-f-ep").value;
    const tot = $("#al-f-total").value;
    state[id] = {
      id,
      ...(manga ? { type: "manga", format: FORMATS[kind] } : {}),
      title,
      status: $("#al-f-status").value,
      currentEpisode: ep === "" ? 0 : parseFloat(ep),
      totalEpisodes: tot === "" ? null : parseInt(tot, 10),
      rating: state[id]?.rating || 0,
      cover: $("#al-f-cover").value.trim() || state[id]?.cover || null,
      site: $("#al-f-site").value.trim() || state[id]?.site || "manual entry",
      url: state[id]?.url || "",
      note: state[id]?.note || "",
      addedAt: state[id]?.addedAt || now,
      updatedAt: now,
    };
    save();
    activeTab = state[id].status;
    closeModal();
    render();
  });

  // ── backup menu (holds export / import) ──────────────────────────────
  const backupBtn = $("#al-backup-btn");
  const backupMenu = $("#al-backup-menu");
  function setBackupMenu(open, refocus) {
    backupMenu.hidden = !open;
    backupBtn.setAttribute("aria-expanded", String(open));
    if (open) backupMenu.querySelector(".al-mi").focus();
    else if (refocus) backupBtn.focus();
  }
  backupBtn.addEventListener("click", () => setBackupMenu(backupMenu.hidden));
  document.addEventListener("click", (e) => {
    if (!backupMenu.hidden && !e.target.closest(".al-backup")) setBackupMenu(false);
  });
  backupMenu.addEventListener("keydown", (e) => {
    const items = [...backupMenu.querySelectorAll(".al-mi")];
    const i = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length].focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setBackupMenu(false, true);
    } else if (e.key === "Tab") {
      setBackupMenu(false);
    }
  });

  // ── export / import (extension-compatible) ───────────────────────────
  $("#al-export").addEventListener("click", () => {
    setBackupMenu(false);
    // Strip tombstones — a backup is the list, not its sync bookkeeping.
    const exportable = Object.fromEntries(
      Object.entries(state).filter(([, a]) => !isTombstone(a))
    );
    if (!Object.keys(exportable).length) return toast("Your list is empty, nothing to export.");
    const payload = { app: "OtakuList", version: 1, exportedAt: new Date().toISOString(), list: exportable };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `otakulist-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Backup downloaded ✓");
  });
  const importFile = $("#al-importfile");
  $("#al-import").addEventListener("click", () => {
    setBackupMenu(false);
    importFile.click();
  });
  importFile.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const incoming = parsed && parsed.list ? parsed.list : parsed;
      if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) throw 0;
      let count = 0;
      for (const [id, item] of Object.entries(incoming)) {
        if (!item || isTombstone(item) || !item.title) continue;
        state[id] = { ...item, id, deleted: false };
        if (!STATUSES[state[id].status]) state[id].status = "onhold";
        count++;
      }
      if (!count) throw 0;
      save();
      render();
      toast(`Imported ${count} title${count === 1 ? "" : "s"} ✓`);
    } catch (_) {
      toast("Couldn't import, not a valid OtakuList backup.");
    }
    importFile.value = "";
  });

  // ── quick add: paste a link (and Android's "Share to OtakuList") ─────────
  // Phones can't run the extension, so this is its stand-in: paste the link of
  // the episode/chapter you're on — or share it to the installed app, which
  // opens this page with ?title=&text=&url= (manifest share_target) — and it
  // works out anime vs manga, the title and the episode/chapter, then offers
  // AniList matches to pick from. The parsing mirrors src/content.js.
  const Q = {
    type: "anime",
    progress: null,
    url: "",
    site: "",
    hits: [],
    pick: null, // index into hits, or null to save the typed title as-is
    timer: 0,
    seq: 0,
  };

  const findUrl = (s) => (String(s || "").match(/https?:\/\/\S+/i) || [""])[0].replace(/[)\].,;'"]+$/, "");

  function extractEpisode(str) {
    if (!str) return null;
    let v = String(str);
    try {
      const u = new URL(v);
      for (const n of ["ep", "episode", "epi"]) {
        const p = u.searchParams.get(n);
        if (p && /^\d{1,4}$/.test(p)) return parseInt(p, 10);
      }
      v = `${u.pathname} ${u.search}`;
    } catch (_) {}
    const m = v.match(/(?:episode|episodio|ep|epi|\be)[\s._:/-]*=?\s*(\d{1,4})\b/i);
    return m ? parseInt(m[1], 10) : null;
  }
  function extractChapter(str) {
    if (!str) return null;
    let v = String(str);
    try {
      const u = new URL(v);
      for (const n of ["chapter", "chap", "ch"]) {
        const p = u.searchParams.get(n);
        if (p && /^\d{1,5}(\.\d{1,2})?$/.test(p)) return parseFloat(p);
      }
      v = `${u.pathname} ${u.search}`;
    } catch (_) {}
    const m = v.match(/(?:chapter|chapitre|capitulo|chap|\bch)[\s._:/-]*=?\s*(\d{1,5}(?:\.\d{1,2})?)(?!\d)/i);
    return m ? parseFloat(m[1]) : null;
  }
  function looksManga(url, text) {
    let path = "";
    try {
      path = new URL(url).pathname.toLowerCase();
    } catch (_) {}
    let host = "";
    try {
      host = new URL(url).hostname;
    } catch (_) {}
    return (
      /(chapter|chapitre|capitulo|\/ch[-_]?\d|\/read(er)?\/)/.test(path) ||
      /\/(manga|manhwa|manhua|webtoons?|comics?)[\/-]/.test(path + "/") ||
      /(manga|manhwa|manhua|webtoon|comic|scans?\b)/.test(host) ||
      /\b(chapter|ch\.\s*\d|manga|manhwa|manhua|webtoon)\b/i.test(text)
    );
  }
  function cleanTitle(raw, type) {
    let t = String(raw || "").trim();
    t = t.replace(/\s*[|»·–—]\s*[^|»·–—]{0,40}$/, "");
    if (type === "manga") {
      t = t.replace(/\b(chapter|chapitre|capitulo|chap|ch|vol|volume)\b.*$/i, "");
      t = t.replace(/\b(read|reading|online|free|full|english|raw|scans?|manga|manhwa|manhua|webtoon|comic|colou?red|latest)\b/gi, "");
    } else {
      t = t.replace(/\b(episode|episodio|ep|epi)\b.*$/i, "");
      t = t.replace(/\b(watch|online|streaming|free|full|hd|4k|1080p|720p|480p|english|sub(bed)?|dub(bed)?|subtitle[sd]?)\b/gi, "");
    }
    return t.replace(/[\s._-]{2,}/g, " ").replace(/[\s:|»·–—-]+$/g, "").replace(/^[\s:|»·–—-]+/g, "").trim();
  }
  function titleFromUrl(url) {
    let path = "";
    try {
      path = new URL(url).pathname;
    } catch (_) {
      return "";
    }
    const ignore = /^(anime|manga|manhwa|manhua|webtoons?|comics?|read|reader|watch|stream|play|series|title|video|episodes?|chapters?|ep|embed|player)$/i;
    const seg = path
      .split("/")
      .filter(Boolean)
      .reverse()
      .find((p) => /[a-z]/i.test(p) && !/^\d+$/.test(p) && !/^(chapter|chap|ch|c|episode|ep)[-_]?\d/i.test(p) && !ignore.test(p) && !/^[0-9a-f-]{20,}$/i.test(p));
    if (!seg) return "";
    return seg
      .replace(/\.(html?|php)$/i, "")
      .replace(/[-_]+/g, " ")
      // a trailing "episode 5" / "chapter 12" glued into the slug
      .replace(/\s+(episode|ep|chapter|ch)\s*\d+(\.\d+)?$/i, "")
      .replace(/\s+\d+$/, "")
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  // → { type, title, progress, url, site }
  function parseShared({ title = "", text = "", url = "" }) {
    const link = url || findUrl(text) || findUrl(title);
    const words = [title, String(text).replace(link, "")].map((s) => s.trim()).filter(Boolean).join(" ");
    const type = looksManga(link, words) ? "manga" : "anime";
    const unit = type === "manga" ? extractChapter : extractEpisode;
    const progress = unit(link) ?? unit(words);
    let name = cleanTitle(words, type);
    if (!name || name.length < 2 || /^https?:/i.test(name)) name = titleFromUrl(link);
    let site = "";
    try {
      site = new URL(link).hostname.replace(/^www\./, "");
    } catch (_) {}
    return { type, title: name, progress, url: link, site };
  }

  // AniList lookups, straight from the page (its API allows CORS).
  const FIELDS =
    "id title{romaji english} coverImage{extraLarge large} format episodes chapters countryOfOrigin seasonYear startDate{year}";
  const readingFormat = (m) =>
    m.format === "NOVEL" ? "Light Novel" : m.format === "ONE_SHOT" ? "One-shot" : { KR: "Manhwa", CN: "Manhua", TW: "Manhua" }[m.countryOfOrigin] || "Manga";
  async function searchAniList(q, type) {
    const res = await fetch("https://graphql.anilist.co/", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        query: `query($s:String){Page(perPage:6){media(search:$s,type:${type === "manga" ? "MANGA" : "ANIME"}){${FIELDS}}}}`,
        variables: { s: q },
      }),
    });
    if (!res.ok) throw new Error(`AniList ${res.status}`);
    const data = await res.json();
    return (data?.data?.Page?.media || []).map((m) => ({
      id: m.id,
      name: m.title?.english || m.title?.romaji || "Untitled",
      cover: m.coverImage?.extraLarge || m.coverImage?.large || null,
      total: (type === "manga" ? m.chapters : m.episodes) || null,
      format: type === "manga" ? readingFormat(m) : m.format || null,
      year: m.seasonYear || m.startDate?.year || null,
    }));
  }

  const qm = $("#al-quick");
  const normT = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  function quickRenderType() {
    const manga = Q.type === "manga";
    document.querySelectorAll(".aq-type").forEach((b) => b.classList.toggle("on", b.dataset.type === Q.type));
    $("#aq-unit").textContent = manga ? "Chapter" : "Episode";
    $("#aq-save").textContent = manga ? "📖 Reading" : "▶ Watching";
    $("#aq-plan").textContent = manga ? "＋ Plan to read" : "＋ Plan to watch";
  }
  function quickRenderHits(msg) {
    const box = $("#aq-results");
    if (msg) {
      box.innerHTML = `<div class="aq-hint">${esc(msg)}</div>`;
      return;
    }
    box.innerHTML = Q.hits
      .map((h, i) => {
        const sub = [h.format, h.year, h.total ? `${h.total} ${Q.type === "manga" ? "ch" : "eps"}` : ""].filter(Boolean).join(" · ");
        const thumb = h.cover ? `<img src="${esc(h.cover)}" alt="" loading="lazy">` : `<span class="aq-ph">${Q.type === "manga" ? "📖" : "🎬"}</span>`;
        return `<button type="button" class="aq-hit${Q.pick === i ? " on" : ""}" data-i="${i}">${thumb}<span><b>${esc(h.name)}</b><small>${esc(sub)}</small></span></button>`;
      })
      .join("");
  }
  function quickSearch() {
    clearTimeout(Q.timer);
    const q = $("#aq-title").value.trim();
    Q.hits = [];
    Q.pick = null;
    if (!q) return quickRenderHits("Type a title to find it on AniList.");
    quickRenderHits("Searching AniList…");
    const seq = ++Q.seq;
    Q.timer = setTimeout(async () => {
      let hits = [];
      try {
        hits = await searchAniList(q, Q.type);
      } catch (_) {
        if (seq === Q.seq) quickRenderHits("Couldn't reach AniList — you can still save it as typed.");
        return;
      }
      if (seq !== Q.seq) return; // a newer search is on its way
      Q.hits = hits;
      Q.pick = hits.length ? 0 : null; // best match preselected
      quickRenderHits(hits.length ? "" : "No matches — it will be saved as typed.");
    }, 350);
  }
  function quickFill(input) {
    const p = parseShared(input);
    Q.type = p.type;
    Q.url = p.url;
    Q.site = p.site;
    $("#aq-title").value = p.title;
    $("#aq-progress").value = p.progress ?? "";
    quickRenderType();
    quickSearch();
  }

  function openQuick(prefill) {
    qm.hidden = false;
    $("#aq-paste").value = prefill ? [prefill.title, prefill.text, prefill.url].filter(Boolean).join(" ") : "";
    if (prefill) quickFill(prefill);
    else {
      Q.type = activeType;
      Q.url = Q.site = "";
      $("#aq-title").value = "";
      $("#aq-progress").value = "";
      quickRenderType();
      quickRenderHits("Paste a link above, or type a title.");
      $("#aq-paste").focus();
    }
  }
  const closeQuick = () => {
    qm.hidden = true;
  };

  function quickSave(status) {
    const hit = Q.pick != null ? Q.hits[Q.pick] : null;
    const title = (hit ? hit.name : $("#aq-title").value).trim();
    if (!title) return $("#aq-title").focus();
    const manga = Q.type === "manga";
    const progVal = $("#aq-progress").value;
    const progress = progVal === "" ? null : parseFloat(progVal);
    // Same entry if AniList says so, or the title matches — never across kinds.
    const existingId = Object.keys(state).find((k) => {
      const a = state[k];
      if (!a || isTombstone(a) || typeOf(a) !== Q.type) return false;
      if (hit && a.anilistId && String(a.anilistId) === String(hit.id)) return true;
      return normT(a.title) === normT(title);
    });
    const id = existingId || (manga ? "manga-" : "") + (slug(title) || String(Date.now()));
    const prev = existingId ? state[id] : null;
    const now = Date.now();
    state[id] = {
      ...(prev || {}),
      id,
      ...(manga ? { type: "manga", format: hit?.format || prev?.format || "Manga" } : {}),
      title: prev?.title || title,
      status,
      currentEpisode: progress ?? prev?.currentEpisode ?? 0,
      totalEpisodes: hit?.total ?? prev?.totalEpisodes ?? null,
      anilistId: hit ? String(hit.id) : prev?.anilistId || null,
      cover: hit?.cover || prev?.cover || null,
      site: Q.site || prev?.site || "manual entry",
      url: Q.url || prev?.url || "",
      rating: prev?.rating || 0,
      note: prev?.note || "",
      addedAt: prev?.addedAt || now,
      updatedAt: now,
      deleted: false,
    };
    save();
    closeQuick();
    if (Q.type === activeType) {
      activeTab = status;
      render();
      toast(`${prev ? "Updated" : "Saved"} “${state[id].title}” ✓`);
    } else {
      render(); // the kind counts change
      toast(`${prev ? "Updated" : "Saved"} “${state[id].title}” in your ${manga ? "Manga" : "Anime"} list ✓`);
    }
  }

  $("#al-quickbtn").addEventListener("click", () => openQuick(null));
  // the empty state's shortcuts to the hero actions
  $("#al-empty").addEventListener("click", (e) => {
    const b = e.target.closest("[data-empty]");
    if (!b) return;
    ({ add: openModal, paste: () => openQuick(null), import: () => importFile.click() })[b.dataset.empty]();
  });
  $("#aq-close").addEventListener("click", closeQuick);
  qm.addEventListener("click", (e) => {
    if (e.target === qm) closeQuick();
  });
  $("#aq-paste").addEventListener("input", (e) => {
    const v = e.target.value.trim();
    if (v) quickFill({ text: v });
  });
  $("#aq-title").addEventListener("input", quickSearch);
  document.querySelectorAll(".aq-type").forEach((b) =>
    b.addEventListener("click", () => {
      if (Q.type === b.dataset.type) return;
      Q.type = b.dataset.type;
      quickRenderType();
      quickSearch();
    })
  );
  $("#aq-results").addEventListener("click", (e) => {
    const b = e.target.closest(".aq-hit");
    if (!b) return;
    const i = +b.dataset.i;
    Q.pick = Q.pick === i ? null : i; // tap again to save as typed instead
    quickRenderHits("");
  });
  $("#aq-save").addEventListener("click", () => quickSave("watching"));
  $("#aq-plan").addEventListener("click", () => quickSave("plan"));

  // Arrived from Android's share sheet?
  (function fromShareSheet() {
    const p = new URLSearchParams(location.search);
    const shared = { title: p.get("title") || "", text: p.get("text") || "", url: p.get("url") || "" };
    if (!shared.title && !shared.text && !shared.url) return;
    // Drop the params so a refresh doesn't reopen it.
    history.replaceState(null, "", location.pathname);
    openQuick(shared);
  })();

  // ── themed dropdowns ─────────────────────────────────────────────────
  // The browser draws a native <select>'s option list itself — white, with
  // the OS arrow — which clashes with the dark page and made our light option
  // text near-invisible. Each select keeps working underneath (hidden), so the
  // existing "change" handlers are untouched; a button shows its value and one
  // shared menu, fixed to the viewport so a card's edges can't clip it,
  // lists the options.
  const CHEVRON =
    '<svg class="al-dd-chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  const menu = document.createElement("div");
  menu.className = "al-dd-menu";
  menu.setAttribute("role", "listbox");
  menu.hidden = true;
  document.body.appendChild(menu);
  let menuFor = null; // the <select> the open menu belongs to

  function enhanceSelects(scope) {
    scope.querySelectorAll("select.al-status, select.al-select").forEach((sel) => {
      if (sel.dataset.dd) return;
      sel.dataset.dd = "1";
      sel.classList.add("al-dd-native");
      sel.tabIndex = -1;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "al-dd-btn " + (sel.classList.contains("al-status") ? "al-dd-status" : "al-dd-sort");
      btn.setAttribute("aria-haspopup", "listbox");
      btn.setAttribute("aria-expanded", "false");
      btn.innerHTML = `<span class="al-dd-label"></span>${CHEVRON}`;
      btn._select = sel;
      sel.after(btn);
      syncButton(btn);
    });
  }
  const syncButton = (btn) => {
    const opt = btn._select.options[btn._select.selectedIndex];
    btn.querySelector(".al-dd-label").textContent = opt ? opt.textContent : "";
  };

  function openMenu(btn) {
    const sel = btn._select;
    menuFor = sel;
    menu.innerHTML = [...sel.options]
      .map(
        (o, i) =>
          `<button type="button" role="option" class="al-dd-opt${o.selected ? " on" : ""}" aria-selected="${o.selected}" data-i="${i}">${esc(o.textContent)}</button>`
      )
      .join("");
    menu.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    // Below the button, or above it when there isn't room.
    const r = btn.getBoundingClientRect();
    menu.style.minWidth = r.width + "px";
    const h = menu.offsetHeight;
    const below = r.bottom + 6 + h <= window.innerHeight;
    menu.style.top = (below ? r.bottom + 6 : Math.max(8, r.top - 6 - h)) + "px";
    menu.style.left = Math.min(r.left, window.innerWidth - menu.offsetWidth - 8) + "px";
    (menu.querySelector(".on") || menu.firstElementChild).focus();
  }
  function closeMenu(refocus) {
    if (menu.hidden) return;
    const btn = menuFor && menuFor.nextElementSibling;
    menu.hidden = true;
    menuFor = null;
    if (btn) {
      btn.setAttribute("aria-expanded", "false");
      if (refocus && btn.isConnected) btn.focus();
    }
  }
  function choose(i) {
    const sel = menuFor;
    closeMenu(true);
    if (!sel || sel.selectedIndex === i) return;
    sel.selectedIndex = i;
    if (sel.nextElementSibling) syncButton(sel.nextElementSibling);
    // bubbles, so the grid's delegated handler sees it like a real change
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".al-dd-btn");
    if (btn) {
      const same = menuFor === btn._select;
      closeMenu(false);
      if (!same) openMenu(btn);
      return;
    }
    const opt = e.target.closest(".al-dd-opt");
    if (opt) return choose(+opt.dataset.i);
    if (!menu.contains(e.target)) closeMenu(false);
  });
  menu.addEventListener("keydown", (e) => {
    const items = [...menu.children];
    const at = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = (at + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[next].focus();
    } else if (e.key === "Escape" || e.key === "Tab") {
      if (e.key === "Escape") e.preventDefault();
      closeMenu(e.key === "Escape");
    }
  });
  // A fixed menu would drift away from its button, so just close it.
  window.addEventListener("resize", () => closeMenu(false));
  window.addEventListener("scroll", () => closeMenu(false), true);

  // ── tiny toast ───────────────────────────────────────────────────────
  let toastTimer = null;
  function toast(msg) {
    let el = $("#al-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "al-toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
  }

  // ── extension bridge ─────────────────────────────────────────────────
  // The extension's content script (on this site only) posts its saved list
  // on load and again whenever it changes. It is merged in automatically:
  // per title, whichever copy was edited most recently wins, so a stale
  // extension copy can never undo an edit made here (or a delete — our
  // tombstone carries its own updatedAt).
  let extList = null;

  function mergeExt() {
    if (!extList) return;
    let changed = 0;
    for (const [id, item] of Object.entries(extList)) {
      if (!item || isTombstone(item) || !item.title) continue;
      const mine = state[id];
      if (mine && (mine.updatedAt || 0) >= (item.updatedAt || 0)) continue;
      state[id] = { ...item, id, deleted: false };
      if (!STATUSES[state[id].status]) state[id].status = "onhold";
      changed++;
    }
    if (!changed) return;
    save();
    render();
    toast(`Synced ${changed} title${changed === 1 ? "" : "s"} from the extension ✓`);
  }

  function onExtList(list) {
    const raw = list && typeof list === "object" && !Array.isArray(list) ? list : {};
    extList = Object.fromEntries(Object.entries(raw).filter(([, a]) => !isTombstone(a)));
    mergeExt();
  }

  const requestExt = () =>
    window.postMessage({ source: "otakulist-web", type: "request-list" }, location.origin);

  window.addEventListener("message", (e) => {
    if (e.source !== window || e.origin !== location.origin) return;
    const d = e.data;
    if (!d || d.source !== "otakulist-ext") return;
    if (d.type === "hello") requestExt();
    else if (d.type === "list") onExtList(d.list);
  });

  // ── init ─────────────────────────────────────────────────────────────
  enhanceSelects(document.querySelector(".al-tools"));
  document.querySelectorAll(".al-vbtn").forEach((x) => x.classList.toggle("on", x.dataset.view === view));
  render();
  initCloud();
  requestExt(); // ask the extension (if installed) for its list
})();
