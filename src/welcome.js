// OtakuList welcome page, opened once on first install (see background.js).
//
// "Continue with Google" doesn't sign in here: it takes this same tab to the
// website's login page, and once you're signed in there the site hands the
// extension its session (see adoptSession in cloud.js). The storage listener
// below notices and flips this page to "signed in" if you come back to it.

// Mirrors STATUS_KEY in src/cloud.js (this is a classic script, not a module).
const STATUS_KEY = "otakuSyncStatus";

const $ = (sel) => document.querySelector(sel);
// Replaced by the worker's answer (cloud-config.local.json can override it).
let siteUrl = "https://otakulist.pages.dev";

const sendCloud = (msg) =>
  new Promise((resolve) =>
    chrome.runtime.sendMessage(msg, (res) =>
      resolve(chrome.runtime.lastError ? { error: chrome.runtime.lastError.message } : res || {})
    )
  );

function show(id) {
  for (const s of ["signIn", "done", "local"]) $(`#${s}`).hidden = s !== id;
}

function showStatus(status) {
  if (status && status.state !== "signed-out") {
    $("#doneText").textContent = status.email ? `Signed in as ${status.email}` : "You're signed in.";
    show("done");
    return true;
  }
  return false;
}

function setError(message) {
  $("#error").textContent = message || "";
  $("#error").hidden = !message;
}

$("#googleBtn").addEventListener("click", () => {
  location.href = `${siteUrl}/login.html?from=ext`;
});

$("#skipBtn").addEventListener("click", () => show("local"));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[STATUS_KEY]) showStatus(changes[STATUS_KEY].newValue);
});

sendCloud({ type: "cloudState" }).then((res) => {
  if (res.error || !res.configured) return show("local");
  if (res.siteUrl) siteUrl = res.siteUrl;
  if (showStatus(res.status)) return;
  show("signIn");
  // e.g. "Session expired — sign in again to resume syncing."
  if (res.status?.message) setError(res.status.message);
});
