// OtakuList — web Anime List app.
// Standalone list manager stored in this browser's localStorage, using the SAME
// data shape as the extension so backups (Export/Import JSON) move between them.
(function () {
  const $ = (s) => document.querySelector(s);
  const KEY = "otakulist-animelist";
  const VIEWKEY = "otakulist-view";
  const STATUSES = { watching: "Watching", plan: "Plan to Watch", completed: "Completed", onhold: "On Hold" };

  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );

  let state = load();
  let activeTab = "watching";
  let query = "";
  let sort = "updated";
  let view = localStorage.getItem(VIEWKEY) === "list" ? "list" : "grid";

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
      return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    } catch (_) {
      return {};
    }
  }
  function save() {
    localStorage.setItem(KEY, JSON.stringify(state));
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
    const cover = a.cover
      ? `<img class="al-cover" src="${esc(a.cover)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'al-cover al-cover-ph',textContent:'🎬'}))">`
      : `<div class="al-cover al-cover-ph">🎬</div>`;
    const total = a.totalEpisodes ? ` <span class="al-dim">/ ${esc(a.totalEpisodes)}</span>` : "";
    const cur = a.currentEpisode ?? 0;
    const siteLink = a.url
      ? `<a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.site || "open")}</a>`
      : esc(a.site || "");
    const options = Object.entries(STATUSES)
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
        <div class="al-title" title="${esc(a.title)}">${esc(a.title)}</div>
        <div class="al-site">${siteLink}</div>
        <div class="al-ep">
          <button class="al-step" data-act="dec" title="Previous episode">−</button>
          <span>Ep <b>${esc(cur)}</b>${total}</span>
          <button class="al-step" data-act="inc" title="Next episode">＋</button>
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
    const all = Object.values(state);
    // tab counts
    document.querySelectorAll(".al-tab").forEach((t) => {
      const s = t.dataset.status;
      t.classList.toggle("on", s === activeTab);
      t.querySelector(".n").textContent = all.filter((a) => a.status === s).length;
    });
    $("#al-count").textContent = `${all.length} title${all.length === 1 ? "" : "s"} saved`;

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
        ? `<h3>Nothing in ${esc(STATUSES[activeTab])}</h3><p>${q ? "No titles match your search." : "Move a show here, or add one."}</p>`
        : `<h3>Your list is empty</h3><p>Add a show below, or import a backup from the extension.</p>`;
    } else {
      $("#al-empty").hidden = true;
      grid.innerHTML = list.map(cardHtml).join("");
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
      item.currentEpisode = Math.max(0, (item.currentEpisode ?? 0) + (act === "inc" ? 1 : -1));
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
      delete state[card.dataset.id];
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
    const id = slug(title) || String(Date.now());
    const now = Date.now();
    const ep = $("#al-f-ep").value;
    const tot = $("#al-f-total").value;
    state[id] = {
      id,
      title,
      status: $("#al-f-status").value,
      currentEpisode: ep === "" ? 0 : parseInt(ep, 10),
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

  // ── export / import (extension-compatible) ───────────────────────────
  $("#al-export").addEventListener("click", () => {
    if (!Object.keys(state).length) return toast("Your list is empty, nothing to export.");
    const payload = { app: "OtakuList", version: 1, exportedAt: new Date().toISOString(), list: state };
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
  $("#al-import").addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const incoming = parsed && parsed.list ? parsed.list : parsed;
      if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) throw 0;
      let count = 0;
      for (const [id, item] of Object.entries(incoming)) {
        if (!item || !item.title) continue;
        state[id] = { ...item, id };
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
  // The extension's content script (on this site only) posts its saved list.
  // We show a banner and let the user load it in — auto-loading if empty.
  let extList = null;
  let autoLoaded = false;

  function mergeExt() {
    if (!extList) return;
    let c = 0;
    for (const [id, item] of Object.entries(extList)) {
      if (!item || !item.title) continue;
      state[id] = { ...item, id };
      if (!STATUSES[state[id].status]) state[id].status = "onhold";
      c++;
    }
    save();
    render();
    $("#al-extbar").hidden = true;
    toast(`Loaded ${c} title${c === 1 ? "" : "s"} from the extension ✓`);
  }

  function onExtList(list) {
    extList = list && typeof list === "object" && !Array.isArray(list) ? list : {};
    const n = Object.keys(extList).length;
    if (!n) return;
    // auto-load once if this page's list is still empty, else offer a button
    if (!Object.keys(state).length && !autoLoaded) {
      autoLoaded = true;
      mergeExt();
      return;
    }
    $("#al-extcount").textContent = n;
    $("#al-extbar").hidden = false;
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
  $("#al-extload").addEventListener("click", mergeExt);

  // ── init ─────────────────────────────────────────────────────────────
  document.querySelectorAll(".al-vbtn").forEach((x) => x.classList.toggle("on", x.dataset.view === view));
  render();
  requestExt(); // ask the extension (if installed) for its list
})();
