# Contributing to OtakuList

First off — thanks for taking the time to contribute! 🎉

OtakuList is a free, open-source anime watchlist extension (Chrome / Edge / Brave)
that auto-detects what you're watching and keeps your list safe **100% locally**.
It also ships a marketing site (Astro + Tailwind on GitHub Pages) and a gacha
showcase directory (Supabase auth). Contributions of every size are welcome —
bug reports, docs, new site detectors, UI polish, or whole features.

## 📁 Project structure

| Path | What it is |
|------|------------|
| `manifest.json` | Extension manifest (Manifest V3) |
| `src/` | Extension source — popup, content scripts, background |
| `icons/`, `fonts/` | Extension assets |
| `web/` | Marketing site + tools (**Astro + Tailwind**) |
| `web/src/pages/` | Site pages (`index.astro`, `import.astro`, `showcase.astro`) |
| `web/src/layouts/` | Shared layouts (`SiteLayout.astro`, `BaseLayout.astro`) |
| `web/public/` | Static assets and classic JS (`import.js`, `showcase.js`) |
| `supabase/migrations/` | SQL migrations for the showcase auth/profiles |
| `.github/workflows/` | GitHub Actions (deploys `web/` to GitHub Pages) |

## 🐛 Reporting bugs

Open an issue and include:

- What you did and what you expected to happen.
- What actually happened (screenshots help a lot).
- Your browser + version, and the streaming site (if it's a detection bug).
- Any errors from the extension's DevTools console.

## 💡 Suggesting features

Open an issue describing the idea and the problem it solves. Detection support
for a new streaming site is always welcome — tell us the site and how episodes
are shown in the page.

## 🔧 Local development

### The extension

1. Clone the repo.
2. Go to `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the repo root (the folder with `manifest.json`).
4. Edit files in `src/`, then hit the reload icon on the extension card to test.

### The website (`web/`)

```bash
cd web
npm install
npm run dev      # local preview at /OtakuList/
npm run build    # production build into dist/
```

If you touch the **showcase** (Supabase) features, copy `web/.env.example`
to `web/.env` and add your own Supabase project's `PUBLIC_SUPABASE_URL` and
`PUBLIC_SUPABASE_ANON_KEY`. These are public-by-design (protected by Row Level
Security). **Never** commit a `service_role` key or a database connection string.

## 🔀 Pull request process

1. Fork the repo and create a branch from `main`
   (e.g. `feat/add-crunchyroll-detector` or `fix/popup-overflow`).
2. Keep changes focused — one logical change per PR.
3. Match the existing code style (naming, formatting, comment density).
4. Test the extension locally (load unpacked) and, if the site changed,
   run `npm run build` in `web/` to confirm it builds cleanly.
5. Write a clear PR description: what changed, why, and how you tested it.
6. Link any related issue (e.g. `Closes #12`).

## 🎨 Code style

- **Extension:** vanilla JS, no build step — keep it dependency-light.
- **Website:** Astro components + Tailwind; reuse the shared layouts and the
  design tokens in `web/src/styles/redesign.css` instead of hardcoding colors.
- Keep user data local and private — the extension stores everything in
  `chrome.storage.local` and must never send watch history to a server.

## 📜 License

By contributing, you agree that your contributions will be licensed under the
[MIT License](LICENSE) that covers this project.

Happy hacking, and thanks for helping fellow anime fans keep their lists safe! 🌸
