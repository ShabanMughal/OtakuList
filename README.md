<p align="center">
  <img src="icons/icon128.png" width="112" height="112" alt="OtakuList logo" />
</p>

<h1 align="center">OtakuList</h1>

<p align="center">
  <b>Your anime watchlist, kept safe locally — even when a site gets blocked.</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Chrome%20%7C%20Edge%20%7C%20Brave-8b5cf6" alt="platform" />
  <img src="https://img.shields.io/badge/manifest-v3-8b5cf6" alt="manifest v3" />
  <img src="https://img.shields.io/badge/price-free-8b5cf6" alt="free" />
  <img src="https://img.shields.io/badge/data-100%25%20local-8b5cf6" alt="local" />
</p>

---

## 📖 What is it?

**OtakuList** is a browser extension for anime watchers who hop between streaming/mirror
sites. It **automatically detects the anime you're watching**, reads the title and
episode, and saves it to a watchlist that lives **inside your browser**.

The problem it solves: pirate/mirror sites get blocked or disappear all the time, and
when they do, you lose track of *what you were watching* and *what's next*. OtakuList
keeps that list with you — not on the site — so it never disappears with the site.

- 🔒 **100% local & private** — no account, no server, nothing is ever uploaded.
- 🤖 **Auto-detects** the anime, episode, and cover art as you watch.
- ♻️ **Survives blocks** — your list is tied to *you*, not any website.
- ⚡ **Zero effort** — episodes update themselves while you binge.

---

## ✨ Features

| | |
|---|---|
| 🎯 **Auto-detection** | Open an episode and a card slides in with the detected title + episode — one tap to save. |
| 🗂️ **Clean lists** | Sorted into **Watching · Plan to Watch · Completed · On Hold** with a search box. |
| 🔢 **Episode tracking** | Bumps your episode count automatically as you move through a series — silently. |
| 📌 **Toolbar badge** | A live count of how many anime you're currently watching. |
| ✍️ **Manual add** | Missed by detection? Add any title, status, and episode by hand. |
| 🎨 **Clean UI** | Poppins font, dark theme, no clutter. |

---

## 🚀 Install (unpacked)

1. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`).
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this `extention` folder.
4. Pin the **OtakuList** icon to your toolbar — done! 🎉

> Works on Chrome, Edge, Brave, and other Chromium browsers.

---

## 🕹️ How to use it

**1. Just watch.**
Open any anime episode on any site. OtakuList notices you're on a watch page and a
small card appears at the bottom-right with the detected **title + episode**.

**2. Save it once.**
Tap **▶ Watching** or **＋ Plan to watch**. You can fix the title first if the
detection got it slightly wrong.

**3. It tracks itself.**
Once an anime is in **Watching**, moving to the next episode updates your progress
automatically — you'll see a tiny *"Updated to Episode X"* toast, no interruptions.

**4. Manage your list.**
Click the toolbar icon to open the dashboard:
- Switch between **Watching / Plan / Completed / On Hold** tabs
- Use **− / +** to adjust the episode number
- Change an anime's **status** from the dropdown
- **Search** your list, open the source site, or **delete** an entry
- Hit **＋** to add something manually

---

## ⚠️ Good to know

- **Detection is a smart guess.** Every site is built differently, so OtakuList reads
  the page's title, URL, and `og:` metadata. It catches most sites, and the save card
  always lets you correct the title. Anything it misses, add manually with **＋**.
- **It stays out of the way.** It ignores search engines and general sites — only real
  anime *watch* and *detail* pages trigger it. Searching "anime" on Google won't pop
  anything up.
- **Data is local only.** Your list lives in this browser profile. Uninstalling the
  extension or wiping the browser clears it.

---

## 📁 Project structure

```
extention/
├── manifest.json          Extension config (Manifest V3)
├── src/
│   ├── background.js       Toolbar badge = # currently watching
│   ├── content.js          Auto-detection + in-page save card & toast
│   └── popup.html/css/js    The dashboard UI
├── icons/                  App icons + logo
├── fonts/                  Poppins (bundled locally)
└── landing/                Marketing landing page (standalone website)
```

---

<p align="center"><sub>Made for anime fans. Your list, kept safe locally. 🍥</sub></p>
