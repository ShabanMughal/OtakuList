<div align="center">

# 🍥 OtakuList

**Your anime watchlist, kept safe locally — even when a site gets blocked.**

[![Platform](https://img.shields.io/badge/Platform-Chrome%20%7C%20Edge%20%7C%20Brave-8b5cf6?style=for-the-badge&logo=googlechrome&logoColor=white)](https://shabanmughal.github.io/OtakuList/)
[![Manifest V3](https://img.shields.io/badge/Manifest-v3-8b5cf6?style=for-the-badge&logo=codefactor&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![License](https://img.shields.io/badge/Price-Free-8b5cf6?style=for-the-badge)](https://shabanmughal.github.io/OtakuList/)
[![Privacy](https://img.shields.io/badge/ Watchlist-100%25%20Local-8b5cf6?style=for-the-badge&logo=shield&logoColor=white)](#-privacy--data)

[**Website**](https://shabanmughal.github.io/OtakuList/) • [**Installation**](#-installation) • [**How It Works**](#-how-it-works) • [**Gacha Showcase**](#-gacha-showcase-companion-app)

---

<a href="https://shabanmughal.github.io/OtakuList/">
  <img src="screenshots/landing-hero.png" width="880" alt="OtakuList Interface Preview" style="border-radius: 8px;" />
</a>

</div>

---

## 📖 Overview

**OtakuList** is a zero-effort browser extension designed for anime watchers who navigate between streaming and mirror platforms. It **automatically detects the show and episode you are watching** and updates a unified watchlist stored directly within your browser.

> **Why OtakuList?**  
> Streaming mirror sites frequently change domains or shut down without warning, taking your watch history with them. OtakuList decouples your history from any individual site, ensuring your watch progress remains intact regardless of domain changes.

### Key Highlights
* 🔒 **100% Local & Private:** Your watchlist never leaves your local browser storage.
* 🤖 **Smart Auto-Detection:** Automatically extracts title, current episode, and metadata on playback.
* 🖼️ **Canonical Artwork:** Fetches high-quality posters via the public [AniList API](https://anilist.co), replacing missing or stretched site banners.
* 🔗 **Cross-Site Deduplication:** Tracks a single entry per show across multiple streaming sources using unique AniList IDs.
* ⚡ **Seamless Tracking:** Updates episode counts silently in the background while you binge.

---

## ✨ Features Breakdown

| Feature | Description |
| :--- | :--- |
| **🎯 Auto-Detection** | Detects active video pages and presents a non-intrusive card to confirm and save tracking. |
| **🖼️ AniList Integration** | Pulls official cover art and metadata directly from AniList's public endpoints. |
| **🔗 Smart Deduplication** | Unifies watch history under a single entry even if you switch domains midway through a series. |
| **🗂️ Categorized Dashboard** | Organize entries into **Watching**, **Plan to Watch**, **Completed**, and **On Hold** with instant search. |
| **🔢 Silent Episode Increment** | Automatically increments episode counters upon continuing a series without interruption. |
| **📌 Dynamic Badge Counter** | Displays an active count of currently watched shows directly on your browser extension icon. |
| **✍️ Manual Entry System** | Allows full manual control to add, edit, or adjust titles, statuses, and episode counts. |
| **🌐 Web Sync Bridge** | Securely syncs local extension data with the official web dashboard on authorized origins. |

---

## 🚀 Installation

### Unpacked Extension (Developer Mode)

1. **Download/Clone** this repository to your local machine.
2. Open your browser's extension management page:
   * **Chrome:** `chrome://extensions`
   * **Edge:** `edge://extensions`
   * **Brave:** `brave://extensions`
3. Enable **Developer mode** using the toggle switch (top-right corner).
4. Click **Load unpacked** and select the target `extention/` directory.
5. **Pin** the OtakuList icon to your browser toolbar for easy access.

---

## 🕹️ How It Works