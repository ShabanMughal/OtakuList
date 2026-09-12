<div align="center">

# 🍥 OtakuList

**Your anime watchlist, kept safe locally — even when a site gets blocked.**

[![Platform](https://img.shields.io/badge/Platform-Chrome%20%7C%20Edge%20%7C%20Brave-8b5cf6?style=for-the-badge&logo=googlechrome&logoColor=white)](https://shabanmughal.github.io/OtakuList/)
[![Manifest V3](https://img.shields.io/badge/Manifest-v3-8b5cf6?style=for-the-badge&logo=codefactor&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![License](https://img.shields.io/badge/Price-Free-8b5cf6?style=for-the-badge)](https://shabanmughal.github.io/OtakuList/)
[![Privacy](https://img.shields.io/badge/Watchlist-100%25%20Local-8b5cf6?style=for-the-badge&logo=shield&logoColor=white)](#%EF%B8%8F-good-to-know)

<p align="center">
  <a href="https://shabanmughal.github.io/OtakuList/"><b>Website</b></a> ·
  <a href="#-install-unpacked"><b>Install</b></a> ·
  <a href="#%EF%B8%8F-how-to-use-it"><b>How it works</b></a> ·
  <a href="#-gacha-showcase-companion-web-app"><b>Gacha Showcase</b></a>
</p>

<a href="https://shabanmughal.github.io/OtakuList/">
  <img src="screenshots/landing-hero.png" width="880" alt="OtakuList — your anime list, sealed forever" />
</a>

</div>

---

## 📖 What is it?

**OtakuList** is a browser extension for anime watchers who hop between streaming/mirror sites. It **automatically detects the anime you're watching**, reads the title and episode, and saves it to a watchlist that lives **inside your browser**.

> **The problem it solves:** Pirate and mirror sites get blocked or disappear all the time. When they do, you lose track of *what you were watching* and *what's next*. OtakuList keeps that list with you — not on the site — so it never disappears with the site.

- 🔒 **Local & private watchlist** — your list stays in your browser. Nothing is uploaded unless *you* log in.
- ☁️ **Optional cloud sync** — log in and the same list follows you to your other browsers and the website.
- 🤖 **Auto-detects** the anime, episode, and cover art as you watch.
- 🖼️ **Real cover art** — posters pulled from [AniList](https://anilist.co), not the site's random banner.
- 🔗 **One entry per anime** — the same show on a different site updates your existing entry instead of duplicating it.
- ⚡ **Zero effort** — episodes update themselves while you binge.

There's also an **optional companion web app** — the [Gacha Showcase](#-gacha-showcase-companion-web-app) — for building a public profile of your gacha-game accounts. It's completely separate from your private watchlist.

---

## ✨ Features

### 🧩 The Extension (Anime Watchlist)

| Feature | Description |
| :--- | :--- |
| 🎯 **Auto-detection** | Open an episode and a card slides in with the detected title + episode — one tap to save. |
| 🖼️ **AniList cover art** | Fetches the anime's real poster from AniList's public API, so covers are correct even when a site has none. |
| 🔗 **Cross-site dedup** | Recognizes the same anime across different sites (via its canonical AniList id) and keeps a single entry. |
| 🗂️ **Clean lists** | Sorted into **Watching · Plan to Watch · Completed · On Hold** with a search box. |
| 🔢 **Episode tracking** | Bumps your episode count automatically as you move through a series — silently. |
| 📌 **Toolbar badge** | A live count of how many anime you're currently watching. |
| ✍️ **Manual add** | Missed by detection? Add any title, status, and episode by hand. |
| ☁️ **Optional cloud sync** | Log in from the popup and your list is mirrored to your private row on the server — same account and same list as the website's *Create list* page. Stay logged out and nothing ever leaves the browser. |
| 🌐 **Web sync bridge** | The official OtakuList site can read your local list (for the *Create list* / *Import* pages) — gated to the official domain + localhost. |

---

## 🚀 Install (unpacked)

1. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`).
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this `extention` folder.
4. Pin the **OtakuList** icon to your toolbar — done! 🎉

> Works on Chrome, Edge, Brave, and other Chromium browsers.

---

## 🕹️ How to use it

1. **Just watch.**  
   Open any anime episode on any site. OtakuList notices you're on a watch page and a small card appears at the bottom-right with the detected **title + episode**.

2. **Save it once.**  
   Tap **▶ Watching** or **＋ Plan to watch**. You can fix the title first if the detection got it slightly wrong.

3. **It tracks itself.**  
   Once an anime is in **Watching**, moving to the next episode updates your progress automatically — you'll see a tiny *"Updated to Episode X"* toast, no interruptions.

4. **Manage your list.**  
   Click the toolbar icon to open the dashboard:
   - Switch between **Watching / Plan / Completed / On Hold** tabs
   - Use **− / +** to adjust the episode number
   - Change an anime's **status** from the dropdown
   - **Search** your list, open the source site, or **delete** an entry
   - Hit **＋** to add something manually

---

## ☁️ Cloud sync (optional)

Logging in is **never required** — the extension works exactly the same without an account, and nothing is uploaded while you're logged out.

**To use it:** click the ☁ button in the popup header → **Log in** (or **Create an account**). It's the same account as the website, so the list you sync here shows up on the [Create list](https://shabanmughal.github.io/OtakuList/animelist.html) page too.

| What happens | When |
| :--- | :--- |
| **Merge** — your local list and your cloud list are combined; if the same anime is in both, the one you touched most recently wins | You log in, the browser starts, or you open the popup |
| **Upload** — your list is saved to the server (deletions included) | ~1.5 s after any change: a save, an episode bump, an edit, a delete |
| **Nothing** | Whenever you're logged out — including after **Log out**, which keeps your list on this device |

If your connection drops, the popup shows *Sync paused* and picks up again on the next change or the next time you open it.

### Setup (maintainers)

Run the [`anime_lists` migration](supabase/migrations/20260907000000_anime_lists.sql), then point the extension at the same Supabase project the website uses:

```bash
node scripts/sync-ext-config.mjs                # take them from .env / web/.env
node scripts/sync-ext-config.mjs --from-source  # move them out of src/cloud-config.js
node scripts/sync-ext-config.mjs --clear        # back to local-only
```

That writes `cloud-config.local.json` next to the manifest, which **`.gitignore` keeps out of the repo** — so your project's values never get pushed. The extension reads it at runtime (with `fetch`, so a missing file just means "not set up" rather than a broken service worker) and falls back to [`src/cloud-config.js`](src/cloud-config.js), which stays empty in git. Reload at `chrome://extensions` after either changes.

Chrome loads the extension's files exactly as they sit on disk, so no `.env` can be substituted at runtime — that's what the script is for. Keep `cloud-config.local.json` when you zip a build for the Web Store; drop it and the extension runs local-only, with the ☁ button explaining that sync isn't set up.

Worth knowing: the anon key isn't a secret in either file. It already ships in the website's JavaScript and inside any packaged build, so anyone can read it. Your list is protected by row-level security, not by hiding the key.

---

## 🎴 Gacha Showcase (companion web app)

A separate, **optional** website for showing off your gacha-game accounts — completely independent of your private anime watchlist.

- 🕹️ **Public profiles** for **Genshin Impact · Honkai: Star Rail · Zenless Zone Zero · Wuthering Waves** — pick your characters, add ranks/UIDs.
- 🔑 **Sign in with Google** (or email/password) — powered by [Supabase](https://supabase.com).
- 🖼️ **Profile picture** pulled automatically from your Google account.
- 🔗 **Your own public link** — pick a username and share `?u=yourname`.
- ❤️ **Likes** and **featured characters** on each profile.
- 🌐 Reads your extension's watchlist (via the web sync bridge) on the *Create list* / *Import* pages.

Built with **Astro + Tailwind CSS + Supabase**.

### Run it locally

```bash
cd web
npm install
cp .env.example .env     # add your Supabase URL + anon key
npm run dev              # http://localhost:4321