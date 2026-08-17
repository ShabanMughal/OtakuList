// OtakuList background service worker.
// Keeps the toolbar badge showing how many anime are currently "watching".

const KEY = "animeList";

async function refreshBadge() {
  const data = await chrome.storage.local.get(KEY);
  const list = data[KEY] || {};
  const watching = Object.values(list).filter((a) => a.status === "watching").length;
  await chrome.action.setBadgeBackgroundColor({ color: "#8b5cf6" });
  await chrome.action.setBadgeText({ text: watching ? String(watching) : "" });
}

chrome.runtime.onInstalled.addListener(refreshBadge);
chrome.runtime.onStartup.addListener(refreshBadge);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[KEY]) refreshBadge();
});
