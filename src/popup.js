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

function render() {
  // tab counts
  document.querySelectorAll(".tab").forEach((t) => {
    const s = t.dataset.status;
    const n = Object.values(state).filter((a) => a.status === s).length;
    t.querySelector("span").textContent = n;
    t.classList.toggle("active", s === activeTab);
  });

  const q = query.trim().toLowerCase();
  const items = Object.values(state)
    .filter((a) => a.status === activeTab)
    .filter((a) => !q || a.title.toLowerCase().includes(q))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  $("#count").textContent = `${Object.keys(state).length} title${Object.keys(state).length === 1 ? "" : "s"} saved`;

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
          <div class="foot">
            <select data-act="status">${options}</select>
            <button class="del" data-act="del" title="Remove">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6"/><path d="M10 11v6M14 11v6"/></svg>
            </button>
          </div>
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
  } else if (act === "del") {
    if (!confirm(`Remove "${item.title}" from your list?`)) return;
    delete state[id];
  } else {
    // e.g. clicking the status <select> — leave it alone; the "change"
    // handler saves it. Re-rendering here would close the dropdown instantly.
    return;
  }
  await setList(state);
  render();
});

listEl.addEventListener("change", async (e) => {
  const sel = e.target.closest('select[data-act="status"]');
  if (!sel) return;
  const id = e.target.closest(".card").dataset.id;
  if (!state[id]) return;
  state[id].status = sel.value;
  state[id].updatedAt = Date.now();
  await setList(state);
  render();
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

// manual add
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
