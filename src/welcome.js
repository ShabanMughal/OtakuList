// OtakuList welcome / login page.
//   src/welcome.html        — opened once on first install (see background.js)
//   src/welcome.html#login  — opened by the popup's log-in button
// Like the popup, it only forwards the button press — the service worker does
// the Google sign-in and writes the result to storage.

// Mirrors STATUS_KEY in src/cloud.js (this is a classic script, not a module).
const STATUS_KEY = "otakuSyncStatus";

const $ = (sel) => document.querySelector(sel);
const loginMode = location.hash === "#login";

const sendCloud = (msg) =>
  new Promise((resolve) =>
    chrome.runtime.sendMessage(msg, (res) =>
      resolve(chrome.runtime.lastError ? { error: chrome.runtime.lastError.message } : res || {})
    )
  );

if (loginMode) {
  document.title = "Log in · OtakuList";
  $("#heading").textContent = "Log in to OtakuList";
  $("#lead").textContent = "Sync your watchlist across browsers and the website.";
  $("#steps").hidden = true;
  $("#skipBtn").hidden = true;
}

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

$("#googleBtn").addEventListener("click", async () => {
  const btn = $("#googleBtn");
  btn.disabled = true;
  setError("");
  const res = await sendCloud({ type: "cloudSignInGoogle" });
  btn.disabled = false;
  if (res.error) setError(res.error);
  // Success is picked up by the storage listener below.
});

$("#skipBtn").addEventListener("click", () => show("local"));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[STATUS_KEY]) showStatus(changes[STATUS_KEY].newValue);
});

sendCloud({ type: "cloudState" }).then((res) => {
  if (res.error || !res.configured) return show("local");
  if (showStatus(res.status)) return;
  show("signIn");
  // e.g. "Session expired — sign in again to resume syncing."
  if (res.status?.message) setError(res.status.message);
});
