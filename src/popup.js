// OtakuList popup — renders and edits the locally-stored watchlist.
const KEY = "animeList";
const STATUSES = {
  watching: "Watching",
  plan: "Plan to Watch",
  completed: "Completed",
  onhold: "On Hold",
};

let state = {};
let activeTab = "watching";
let query = "";
let sortBy = "recent";

const $ = (sel) => document.querySelector(sel);
const listEl = $("#list");
const emptyEl = $("#empty");

const getList = () => chrome.storage.local.get(KEY).then((d) => d[KEY] || {});
const setList = (list) => chrome.storage.local.set({ [KEY]: list });

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

// ── sorting ─────────────────────────────────────────────────────────
function sortItems(items) {
  const arr = [...items];
  switch (sortBy) {
    case "title":
      return arr.sort((a, b) => a.title.localeCompare(b.title));
    case "added":
      return arr.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    case "episode":
      return arr.sort((a, b) => (b.currentEpisode || 0) - (a.currentEpisode || 0));
    default: // recent
      return arr.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }
}

// ── 5-star rating widget ────────────────────────────────────────────
function starsHtml(rating) {
  let s = "";
  for (let i = 1; i <= 5; i++) {
    s += `<button class="star ${i <= rating ? "on" : ""}" data-act="rate" data-val="${i}" title="${i} star${i > 1 ? "s" : ""}">★</button>`;
  }
  return `<div class="rating">${s}</div>`;
}

function render() {
  // tab counts
  document.querySelectorAll(".tab").forEach((t) => {
    const s = t.dataset.status;
    const n = Object.values(state).filter((a) => a.status === s).length;
    t.querySelector("span").textContent = n;
    t.classList.toggle("active", s === activeTab);
  });

  const q = query.trim().toLowerCase();
  const items = sortItems(
    Object.values(state)
      .filter((a) => a.status === activeTab)
      .filter((a) => !q || a.title.toLowerCase().includes(q))
  );

  const totalCount = Object.keys(state).length;
  $("#count").textContent = `${totalCount} title${totalCount === 1 ? "" : "s"} saved`;

  if (!items.length) {
    listEl.innerHTML = "";
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;

  listEl.innerHTML = items
    .map((a) => {
      const total = a.totalEpisodes ? `<span> / ${a.totalEpisodes}</span>` : "";
      const cur = a.currentEpisode ?? 0;
      const cover = a.cover
        ? `<img class="cover" src="${escapeHtml(a.cover)}" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'cover',textContent:'🎬'}))">`
        : `<div class="cover">🎬</div>`;
      const siteLink = a.url
        ? `<a href="${escapeHtml(a.url)}" target="_blank" rel="noopener">${escapeHtml(a.site || "open")}</a>`
        : escapeHtml(a.site || "");
      const options = Object.entries(STATUSES)
        .map(([v, label]) => `<option value="${v}" ${v === a.status ? "selected" : ""}>${label}</option>`)
        .join("");
      const resumeBtn = a.url
        ? `<a class="resume" href="${escapeHtml(a.url)}" target="_blank" rel="noopener" title="Resume watching where you left off">▶</a>`
        : "";
      const hasNote = a.note && a.note.trim();
      const noteBlock = `<textarea class="note-input" data-act="noteedit" placeholder="Add a note…" rows="2" ${hasNote ? "" : "hidden"}>${escapeHtml(a.note || "")}</textarea>`;
      return `
      <div class="card" data-id="${escapeHtml(a.id)}">
        ${cover}
        <div class="body">
          <div class="name">${escapeHtml(a.title)}</div>
          <div class="site">${siteLink}</div>
          <div class="prog">
            <button data-act="dec" title="Previous episode">−</button>
            <div class="epnum">Ep <b>${cur}</b>${total}</div>
            <button data-act="inc" title="Next episode">＋</button>
          </div>
          ${starsHtml(a.rating || 0)}
          <div class="foot">
            <select data-act="status">${options}</select>
            ${resumeBtn}
            <button class="icon-btn ${hasNote ? "active" : ""}" data-act="notetoggle" title="Add / edit note">✎</button>
            <button class="del" data-act="del" title="Remove">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6"/><path d="M10 11v6M14 11v6"/></svg>
            </button>
          </div>
          ${noteBlock}
        </div>
      </div>`;
    })
    .join("");
}

// event delegation for cards
listEl.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const card = e.target.closest(".card");
  const id = card?.dataset.id;
  if (!id || !state[id]) return;
  const act = btn.dataset.act;
  const item = state[id];

  if (act === "inc" || act === "dec") {
    const cur = item.currentEpisode ?? 0;
    item.currentEpisode = Math.max(0, cur + (act === "inc" ? 1 : -1));
    item.updatedAt = Date.now();
  } else if (act === "rate") {
    const val = parseInt(btn.dataset.val, 10);
    // clicking the current rating again clears it
    item.rating = item.rating === val ? 0 : val;
    item.updatedAt = Date.now();
  } else if (act === "notetoggle") {
    const ta = card.querySelector(".note-input");
    ta.hidden = !ta.hidden;
    if (!ta.hidden) ta.focus();
    return; // nothing to persist yet
  } else if (act === "noteedit") {
    return; // handled by the "change" listener below
  } else if (act === "del") {
    const removed = { ...item };
    delete state[id];
    await setList(state);
    showUndo(removed);
    render();
    return;
  } else {
    // e.g. clicking the status <select> — leave it alone; the "change"
    // handler saves it. Re-rendering here would close the dropdown instantly.
    return;
  }
  await setList(state);
  render();
});

listEl.addEventListener("change", async (e) => {
  const card = e.target.closest(".card");
  if (!card) return;
  const id = card.dataset.id;
  if (!state[id]) return;

  const sel = e.target.closest('select[data-act="status"]');
  if (sel) {
    state[id].status = sel.value;
    state[id].updatedAt = Date.now();
    await setList(state);
    render();
    return;
  }

  const note = e.target.closest('textarea[data-act="noteedit"]');
  if (note) {
    state[id].note = note.value.trim();
    state[id].updatedAt = Date.now();
    await setList(state);
    // don't re-render — keep the textarea open and focused while editing
  }
});

// tabs
$("#tabs").addEventListener("click", (e) => {
  const tab = e.target.closest(".tab");
  if (!tab) return;
  activeTab = tab.dataset.status;
  render();
});

// search
$("#search").addEventListener("input", (e) => {
  query = e.target.value;
  render();
});

// sort
$("#sort").addEventListener("change", (e) => {
  sortBy = e.target.value;
  render();
});

// ── undo toast ──────────────────────────────────────────────────────
let toastTimer = null;
function showUndo(item) {
  clearToast();
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = `<span>Removed “${escapeHtml(item.title)}”</span><button type="button">Undo</button>`;
  document.body.appendChild(t);
  toastTimer = setTimeout(() => t.remove(), 6000);
  t.querySelector("button").addEventListener("click", async () => {
    clearTimeout(toastTimer);
    state[item.id] = item;
    await setList(state);
    t.remove();
    render();
  });
}
function showToast(msg) {
  clearToast();
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = `<span>${escapeHtml(msg)}</span>`;
  document.body.appendChild(t);
  toastTimer = setTimeout(() => t.remove(), 3000);
}
function clearToast() {
  clearTimeout(toastTimer);
  document.querySelectorAll(".toast").forEach((t) => t.remove());
}

// ── manual add ──────────────────────────────────────────────────────
const addForm = $("#addForm");
$("#addBtn").addEventListener("click", () => {
  addForm.hidden = !addForm.hidden;
  if (!addForm.hidden) $("#f-title").focus();
});
$("#cancelAdd").addEventListener("click", () => (addForm.hidden = true));
addForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = $("#f-title").value.trim();
  if (!title) return;
  const id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const now = Date.now();
  const epVal = $("#f-ep").value;
  const totVal = $("#f-total").value;
  state[id] = {
    id,
    title,
    status: $("#f-status").value,
    currentEpisode: epVal === "" ? null : parseInt(epVal, 10),
    totalEpisodes: totVal === "" ? null : parseInt(totVal, 10),
    rating: state[id]?.rating || 0,
    cover: state[id]?.cover || null,
    site: state[id]?.site || "manual entry",
    url: state[id]?.url || "",
    note: state[id]?.note || "",
    addedAt: state[id]?.addedAt || now,
    updatedAt: now,
  };
  await setList(state);
  addForm.reset();
  addForm.hidden = true;
  activeTab = state[id].status;
  render();
});

// ── export / import backup ──────────────────────────────────────────
$("#exportBtn").addEventListener("click", () => {
  if (!Object.keys(state).length) {
    showToast("Your list is empty — nothing to export.");
    return;
  }
  const payload = {
    app: "OtakuList",
    version: 1,
    exportedAt: new Date().toISOString(),
    list: state,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  const a = document.createElement("a");
  a.href = url;
  a.download = `otakulist-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast("Backup downloaded ✓");
});

const importFile = $("#importFile");
$("#importBtn").addEventListener("click", () => importFile.click());
importFile.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    // accept either our wrapped format {list: {...}} or a raw map
    const incoming = parsed && parsed.list ? parsed.list : parsed;
    if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
      throw new Error("bad shape");
    }
    let count = 0;
    for (const [id, item] of Object.entries(incoming)) {
      if (!item || !item.title) continue;
      state[id] = { ...item, id };
      if (!STATUSES[state[id].status]) state[id].status = "onhold";
      count++;
    }
    if (!count) throw new Error("no valid entries");
    await setList(state);
    render();
    showToast(`Imported ${count} title${count === 1 ? "" : "s"} ✓`);
  } catch (err) {
    showToast("Couldn't import — not a valid OtakuList backup.");
  }
  importFile.value = "";
});

// live updates if the content script saves something while popup is open
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[KEY]) {
    state = changes[KEY].newValue || {};
    render();
  }
});

// init
getList().then((list) => {
  state = list;
  // "Dropped" was removed — rescue any such items into On Hold so they're not lost.
  let changed = false;
  for (const a of Object.values(state)) {
    if (!STATUSES[a.status]) {
      a.status = "onhold";
      changed = true;
    }
  }
  if (changed) setList(state);
  render();
});
