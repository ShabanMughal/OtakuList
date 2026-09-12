// OtakuList optional cloud sync.
//
// Signing in is entirely optional: until you do, the watchlist lives only in
// chrome.storage.local exactly as before. Once signed in, the list is mirrored
// into the same private `anime_lists` row the website's Anime List page uses,
// so the extension and the site stay in step.
//
// We talk to Supabase over plain REST instead of bundling supabase-js: MV3
// forbids loading a remote script, and all we need is three auth endpoints and
// one table.
import { SUPABASE_URL as BUILT_IN_URL, SUPABASE_ANON_KEY as BUILT_IN_KEY } from "./cloud-config.js";

const LIST_KEY = "animeList";
const SESSION_KEY = "otakuSession";
const STATUS_KEY = "otakuSyncStatus";
const TABLE = "anime_lists";

// Refresh a token this long before it actually expires, so a sync in flight
// can't die halfway through.
const REFRESH_MARGIN_MS = 60000;

// Where the project's URL + anon key come from, in order:
//   1. cloud-config.local.json next to the manifest — gitignored, so your own
//      project's values never end up in the repo. Written by
//      `node scripts/sync-ext-config.mjs`.
//   2. the committed src/cloud-config.js, normally empty.
// It is fetched rather than imported on purpose: a missing file then just means
// "not configured", instead of an import error that stops the whole service
// worker (and with it the badge and the AniList lookups).
const LOCAL_CONFIG_FILE = "cloud-config.local.json";
let configPromise = null;

function loadConfig() {
  if (!configPromise) {
    configPromise = (async () => {
      try {
        const res = await fetch(chrome.runtime.getURL(LOCAL_CONFIG_FILE));
        if (res.ok) {
          const json = await res.json();
          const url = String(json.url || "").trim();
          const key = String(json.anonKey || "").trim();
          if (url && key) return { url, key };
        }
      } catch {
        // no local file — fall back to whatever is baked into cloud-config.js
      }
      return { url: String(BUILT_IN_URL || "").trim(), key: String(BUILT_IN_KEY || "").trim() };
    })();
  }
  return configPromise;
}

export async function isConfigured() {
  const { url, key } = await loadConfig();
  return /^https:\/\/\S+/.test(url) && !!key;
}

const apiBase = (url) => url.replace(/\/+$/, "");

// ---------- local state ----------
const getStored = async (key) => (await chrome.storage.local.get(key))[key];

export const getSession = () => getStored(SESSION_KEY);
export const getList = async () => (await getStored(LIST_KEY)) || {};
export const getStatus = async () =>
  (await getStored(STATUS_KEY)) || { state: "signed-out", message: "", email: "" };

async function setStatus(state, message = "") {
  const session = await getSession();
  await chrome.storage.local.set({
    [STATUS_KEY]: { state, message, email: session?.user?.email || "", at: Date.now() },
  });
}

// Key order is meaningless for a plain object, so compare lists by a stable
// (key-sorted) serialisation — otherwise every merge would look like a change.
function signature(list) {
  return JSON.stringify(
    Object.keys(list)
      .sort()
      .map((k) => [k, list[k]])
  );
}

// ---------- auth ----------
async function authRequest(path, body, token) {
  const { url, key } = await loadConfig();
  const res = await fetch(`${apiBase(url)}/auth/v1/${path}`, {
    method: "POST",
    headers: {
      apikey: key,
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      data.error_description || data.msg || data.message || `Request failed (${res.status})`
    );
  }
  return data;
}

function sessionFrom(data, fallbackUser) {
  if (!data?.access_token) return null;
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (Number(data.expires_in) || 3600) * 1000,
    user: {
      id: data.user?.id || fallbackUser?.id,
      email: data.user?.email || fallbackUser?.email || "",
    },
  };
}

async function assertConfigured() {
  if (!(await isConfigured())) {
    throw new Error("Cloud sync isn't set up in this build — see src/cloud-config.js.");
  }
}

export async function signIn(email, password) {
  await assertConfigured();
  const session = sessionFrom(await authRequest("token?grant_type=password", { email, password }));
  if (!session?.user?.id) throw new Error("Sign-in failed — no session returned.");
  await chrome.storage.local.set({ [SESSION_KEY]: session });
  await syncNow("merge");
  return session.user;
}

// A project with "Confirm email" on returns a user but no session — the list
// starts syncing only once they have clicked the link and signed in.
export async function signUp(email, password) {
  await assertConfigured();
  const session = sessionFrom(await authRequest("signup", { email, password }));
  if (!session?.user?.id) return { confirmationRequired: true };
  await chrome.storage.local.set({ [SESSION_KEY]: session });
  await syncNow("merge");
  return { confirmationRequired: false, user: session.user };
}

export async function signOut() {
  const session = await getSession();
  if (session) {
    // Best effort — a dead token still signs you out locally.
    await authRequest("logout", {}, session.access_token).catch(() => {});
  }
  await endSession();
}

// Drop the session but KEEP the list: signing out is not a deletion.
async function endSession(message = "") {
  lastPushedSig = "";
  await chrome.storage.local.remove(SESSION_KEY);
  await chrome.storage.local.set({
    [STATUS_KEY]: { state: "signed-out", message, email: "", at: Date.now() },
  });
}

async function refreshSession(session) {
  const next = sessionFrom(
    await authRequest("token?grant_type=refresh_token", { refresh_token: session.refresh_token }),
    session.user
  );
  if (!next?.user?.id) throw new Error("refresh failed");
  await chrome.storage.local.set({ [SESSION_KEY]: next });
  return next;
}

// The session we should use right now, refreshed if it is close to expiring.
// Returns null (and signs out locally) when the refresh token is no longer
// accepted — e.g. the password was changed on another device.
async function activeSession() {
  const session = await getSession();
  if (!session) return null;
  if (Date.now() < session.expires_at - REFRESH_MARGIN_MS) return session;
  try {
    return await refreshSession(session);
  } catch {
    await endSession("Session expired — sign in again to resume syncing.");
    return null;
  }
}

// ---------- table access ----------
async function rest(path, init, session) {
  const { url, key } = await loadConfig();
  const call = (s) =>
    fetch(`${apiBase(url)}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: key,
        Authorization: `Bearer ${s.access_token}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });

  let res = await call(session);
  if (res.status === 401) {
    // Token rejected mid-flight — refresh once and retry before giving up.
    const next = await refreshSession(session).catch(() => null);
    if (!next) {
      await endSession("Session expired — sign in again to resume syncing.");
      throw new Error("signed-out");
    }
    res = await call(next);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Supabase ${res.status}${body ? `: ${body.slice(0, 160)}` : ""}`);
  }
  return res;
}

const isListShape = (v) => !!v && typeof v === "object" && !Array.isArray(v);

async function pull(session) {
  const res = await rest(
    `${TABLE}?select=list&user_id=eq.${encodeURIComponent(session.user.id)}`,
    { method: "GET" },
    session
  );
  const rows = await res.json();
  const list = Array.isArray(rows) ? rows[0]?.list : null;
  if (!isListShape(list)) return {};
  // Never let a malformed row poison the local list.
  return Object.fromEntries(
    Object.entries(list).filter(([, item]) => item && typeof item === "object" && item.title)
  );
}

// Skip a push that would write exactly what we last wrote (the storage listener
// and an explicit "Sync now" can easily ask for the same state twice).
let lastPushedSig = "";

async function push(session, list) {
  const sig = signature(list);
  if (sig === lastPushedSig) return;
  await rest(
    TABLE,
    {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ user_id: session.user.id, list }),
    },
    session
  );
  lastPushedSig = sig;
}

// ---------- merge ----------
// Union of both sides; when an entry exists in each, the one touched most
// recently wins. Used whenever we pull, so signing in on a device that already
// has a watchlist cannot wipe the cloud copy — or be wiped by it.
export function mergeLists(local, remote) {
  const merged = { ...remote };
  for (const [key, item] of Object.entries(local)) {
    if (!item || typeof item !== "object" || !item.title) continue;
    const rival = merged[key];
    if (!rival || (item.updatedAt || 0) >= (rival.updatedAt || 0)) merged[key] = item;
  }
  return merged;
}

// ---------- sync ----------
// "merge" pulls the cloud copy in before pushing (sign-in, browser start,
// popup open). "push" just uploads the local list, which is what makes a
// delete here actually delete there.
let inFlight = null;
let queuedMode = null;

export function syncNow(mode = "merge") {
  // Never run two syncs at once, but don't drop the second request either — a
  // pull asked for mid-upload still has to happen, and a merge outranks a push.
  if (inFlight) {
    queuedMode = queuedMode === "merge" || mode === "merge" ? "merge" : "push";
    return inFlight;
  }
  inFlight = runSync(mode).finally(() => {
    inFlight = null;
    const next = queuedMode;
    queuedMode = null;
    if (next) syncNow(next);
  });
  return inFlight;
}

async function runSync(mode) {
  if (!(await isConfigured())) return;
  const session = await activeSession();
  if (!session) return;
  try {
    await setStatus("syncing");
    const local = await getList();
    let next = local;
    if (mode === "merge") {
      next = mergeLists(local, await pull(session));
      if (signature(next) !== signature(local)) {
        await chrome.storage.local.set({ [LIST_KEY]: next });
      }
    }
    await push(session, next);
    await setStatus("synced");
  } catch (err) {
    if (String(err?.message) === "signed-out") return; // endSession already reported it
    await setStatus("error", friendlyError(err));
  }
}

function friendlyError(err) {
  const msg = String(err?.message || err);
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return "Offline — will sync later.";
  if (/\b4(0[13]|04)\b/.test(msg)) return "Sync rejected — check the anime_lists table and its policies.";
  return msg.slice(0, 120);
}
