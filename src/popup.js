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

// Deleting writes a tombstone — { id, deleted:true, updatedAt } — instead of
// removing the key, so the delete survives a cloud merge with a device that
// still has its copy (see src/cloud.js). Nothing below the storage layer should
// ever show one, so every read filters them out.
const isTombstone = (a) => !!a && a.deleted === true;
const liveEntries = () => Object.values(state).filter((a) => !isTombstone(a));
const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

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
  const live = liveEntries();
  document.querySelectorAll(".tab").forEach((t) => {
    const s = t.dataset.status;
    const n = live.filter((a) => a.status === s).length;
    t.querySelector("span").textContent = n;
    t.classList.toggle("active", s === activeTab);
  });

  const q = query.trim().toLowerCase();
  const items = sortItems(
    live
      .filter((a) => a.status === activeTab)
      .filter((a) => !q || a.title.toLowerCase().includes(q))
  );

  const totalCount = live.length;
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
      // Sites that count from episode 1 of the whole series record an absolute
      // number; show it alongside rather than pretending it's season progress.
      const abs =
        a.absoluteEpisode && a.absoluteEpisode !== a.currentEpisode
          ? `<span class="abs" title="Absolute episode number across the whole series">abs. ${escapeHtml(a.absoluteEpisode)}</span>`
          : "";
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
            <div class="epnum">Ep <b>${cur}</b>${total}${abs}</div>
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
    // Tombstone, not a key removal — otherwise a merge from a device that
    // still holds this entry would bring it straight back.
    state[id] = { id, deleted: true, updatedAt: Date.now() };
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
    // Restamp so the restored entry outranks the tombstone we just pushed.
    state[item.id] = { ...item, deleted: false, updatedAt: Date.now() };
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
  // A backup is a snapshot of the list, not of its sync bookkeeping — strip
  // tombstones so an exported file never carries deletions around.
  const exportable = Object.fromEntries(
    Object.entries(state).filter(([, a]) => !isTombstone(a))
  );
  if (!Object.keys(exportable).length) {
    showToast("Your list is empty — nothing to export.");
    return;
  }
  const payload = {
    app: "OtakuList",
    version: 1,
    exportedAt: new Date().toISOString(),
    list: exportable,
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
      // Older or hand-edited files may carry tombstones — ignore them rather
      // than importing a deletion as if it were a title.
      if (!item || isTombstone(item) || !item.title) continue;
      state[id] = { ...item, id, deleted: false };
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

// ── optional cloud sync ─────────────────────────────────────────────
// Logging in is never required: the list works exactly as before without an
// account. All the real work (auth, merge, upload) happens in the background
// worker — the popup only shows its state and forwards button presses.
const authPanel = $("#authPanel");
const authForm = $("#authForm");
const authAccount = $("#authAccount");
const cloudBtn = $("#cloudBtn");
let authMode = "login";

// `configured` is null until the service worker has answered — see the note on
// the first paint at the bottom of this file. Only the worker can tell us for
// certain, because the answer depends on values baked into cloud-config.js,
// which is a module this classic script cannot import.
let cloud = { configured: null, status: { state: "signed-out" } };

// Mirrors STATUS_KEY in src/cloud.js. Copied rather than imported for the same
// reason as TOMBSTONE_TTL_MS above: cloud.js is a module owned by the service
// worker and popup.js is a classic script.
const STATUS_KEY = "otakuSyncStatus";

const sendCloud = (msg) =>
  new Promise((resolve) =>
    chrome.runtime.sendMessage(msg, (res) =>
      resolve(chrome.runtime.lastError ? { error: chrome.runtime.lastError.message } : res || {})
    )
  );

const SYNC_LABELS = {
  syncing: "Syncing…",
  synced: "Synced ✓",
  error: "Sync paused",
};

function setAuthError(message) {
  const el = $("#authError");
  el.textContent = message || "";
  el.hidden = !message;
}

function renderCloud() {
  const { configured, status } = cloud;
  // The ☁ button stays visible even when sync isn't configured — a button that
  // silently isn't there just looks broken. The panel explains what's missing.
  cloudBtn.hidden = false;
  // While `configured` is still unknown, assume it is. "Cloud sync isn't set
  // up" is the rare case, and flashing it at someone who *is* signed in reads
  // as their account having been dropped — much worse than a beat of the
  // ordinary login form before the real answer lands.
  const known = configured !== null;
  $("#authSetup").hidden = !known || configured;
  if (known && !configured) {
    authForm.hidden = true;
    authAccount.hidden = true;
    cloudBtn.classList.remove("on", "warn");
    cloudBtn.title = "Cloud sync isn't set up";
    return;
  }
  const signedIn = status.state !== "signed-out";
  const label = SYNC_LABELS[status.state] || "";

  authForm.hidden = signedIn;
  authAccount.hidden = !signedIn;
  cloudBtn.classList.toggle("on", signedIn && status.state !== "error");
  cloudBtn.classList.toggle("warn", status.state === "error");
  cloudBtn.title = signedIn ? `${status.email || "Signed in"} — ${label}` : "Log in to sync";

  $("#subtitle").textContent = signedIn
    ? `${label}${status.email ? ` · ${status.email}` : ""}`
    : "Your anime watchlist, kept safe";

  if (signedIn) {
    $("#authEmailLabel").textContent = status.email || "Signed in";
    $("#authStatus").textContent =
      status.state === "error" ? status.message || "Sync paused" : label;
  } else if (status.message) {
    // e.g. the refresh token expired while the popup was closed
    setAuthError(status.message);
  }
}

cloudBtn.addEventListener("click", () => {
  authPanel.hidden = !authPanel.hidden;
  if (!authPanel.hidden) {
    addForm.hidden = true;
    if (!authForm.hidden) $("#authEmail").focus();
  }
});

$("#authToggle").addEventListener("click", () => {
  authMode = authMode === "login" ? "signup" : "login";
  const login = authMode === "login";
  $("#authTitle").textContent = login ? "Log in to sync" : "Create an account";
  $("#authSubmit").textContent = login ? "Log in" : "Create account";
  $("#authToggle").textContent = login ? "Create an account" : "I already have one";
  $("#authPass").autocomplete = login ? "current-password" : "new-password";
  setAuthError("");
});

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#authEmail").value.trim();
  const password = $("#authPass").value;
  const submit = $("#authSubmit");
  submit.disabled = true;
  setAuthError("");

  const res =
    authMode === "login"
      ? await sendCloud({ type: "cloudSignIn", email, password })
      : await sendCloud({ type: "cloudSignUp", email, password });

  submit.disabled = false;
  if (res.error) {
    setAuthError(res.error);
    return;
  }
  authForm.reset();
  if (res.confirmationRequired) {
    setAuthError("");
    showToast("Check your email to confirm, then log in.");
    return;
  }
  authPanel.hidden = true;
  showToast("Logged in — your list is syncing ✓");
});

$("#signOutBtn").addEventListener("click", async () => {
  await sendCloud({ type: "cloudSignOut" });
  // The list itself stays exactly where it is — only the sync stops.
  showToast("Logged out. Your list is still saved here.");
});

$("#syncBtn").addEventListener("click", async () => {
  const res = await sendCloud({ type: "cloudSync", mode: "merge" });
  if (res.error) showToast(res.error);
});

// live updates if the content script saves something while popup is open
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes[KEY]) {
    state = changes[KEY].newValue || {};
    render();
  }
  if (changes[STATUS_KEY]) {
    cloud.status = changes[STATUS_KEY].newValue || { state: "signed-out" };
    renderCloud();
  }
});

// init
//
// Nothing here may wait on the service worker. MV3 shuts that worker down when
// it goes idle, so on most popup opens Chrome has to cold-start it — load
// background.js as a module, pull in cloud.js, fetch the config file — before
// any reply comes back. The ☁ button used to sit hidden for all of that, which
// is long enough that clicking it straight after opening the popup did nothing.
//
// So the first paint is drawn from what is already local:
//
//   the button  — drawn synchronously, before a single await;
//   the status  — the worker writes it to chrome.storage.local (STATUS_KEY in
//                 cloud.js), so reading it back is the same kind of trip as the
//                 list itself, with no worker involved.
//
// The worker is still asked, and its answer still wins. It just no longer gates
// anything being drawn.
renderCloud();

chrome.storage.local.get(STATUS_KEY).then((data) => {
  // If the worker got there first, it has the authoritative answer — leave it.
  if (cloud.configured !== null) return;
  const cached = data[STATUS_KEY];
  if (!cached) return;
  cloud.status = cached;
  renderCloud();
});

sendCloud({ type: "cloudState" }).then((res) => {
  if (res.error) {
    // The background worker didn't answer — say so rather than looking dead.
    cloud.configured = false;
    $("#authSetupMsg").textContent = `Sync unavailable: ${res.error}`;
    return renderCloud();
  }
  cloud = res;
  renderCloud();
  if (!res.configured) return;
  // Opening the popup is a good moment to pick up edits made on the website or
  // in another browser.
  if (cloud.status.state !== "signed-out") sendCloud({ type: "cloudSync", mode: "merge" });
});

getList().then((list) => {
  state = list;
  let changed = false;
  const now = Date.now();
  for (const [id, a] of Object.entries(state)) {
    // Expire tombstones once every device has had ample time to see them.
    if (isTombstone(a)) {
      if (now - (a.updatedAt || 0) > TOMBSTONE_TTL_MS) {
        delete state[id];
        changed = true;
      }
      continue; // a tombstone has no status to rescue
    }
    // "Dropped" was removed — rescue any such items into On Hold so they're not lost.
    if (!STATUSES[a.status]) {
      a.status = "onhold";
      changed = true;
    }
  }
  if (changed) setList(state);
  render();
});
