# Contributing to OtakuList

First off — thanks for taking the time to contribute! 🎉

OtakuList is a free, open-source anime watchlist extension (Chrome / Edge / Brave)
that auto-detects what you're watching and keeps your list safe **100% locally**.
It also ships a marketing site (Astro + Tailwind on GitHub Pages) and a gacha
showcase directory (Supabase auth). Contributions of every size are welcome —
bug reports, docs, new site detectors, UI polish, or whole features.

> **The workflow in one line:** don't push to `main`. **Create a new branch,
> commit your work there, and open a pull request** so it can be reviewed. See
> [Pull request process](#-pull-request-process) below.

## 🙌 Ways you can help right now

These are the things we'd most love a hand with — pick one, branch off, and open a PR:

### 1. Add character images for the gacha games 🖼️

The showcase uses per-game character rosters in
[`web/public/data/characters.json`](web/public/data/characters.json). Genshin, HSR
and most of ZZZ already pull real portraits, but **Wuthering Waves** and a handful of
ZZZ agents currently fall back to plain initials because we couldn't find a reliable
free image source.

To add portraits:

- Drop square PNGs (ideally **256×256**) into the matching folder:
  - `web/public/assets/chars/wuwa/<name>.png`
  - `web/public/assets/chars/zzz/<name>.png`
- Use the **exact filenames** listed in each folder's `README.md`
  (e.g. `jinhsi.png`, `xiangli-yao.png`). Missing files just show initials, so any
  amount helps.
- Please use official / wiki art and keep files reasonably small.

### 2. Add more popular games 🎮

Want to see another gacha (or non-gacha) game supported? You can:

- Add the game to the `GAMES` map and game filter tabs in
  [`web/public/js/showcase.js`](web/public/js/showcase.js), give it a logo in
  `web/public/assets/games/<key>.png`, and add its character roster to
  `characters.json` (name + image + `r` rarity per character).
- Open an issue first if it's a big roster so we can agree on the data source.

### 3. Build a new feature ✨

Have an idea for the extension, the import tool, or the showcase? Go for it —
just **open an issue to discuss it first** (so effort isn't wasted), then build it
on its own branch and send a PR.

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

**Never commit directly to `main` — always work on a new branch and open a pull
request.** That's how every change gets in.

1. **Fork** the repo (or, if you're a collaborator, work in the repo directly).
2. **Create a new branch** from `main` with a descriptive name:
   ```bash
   git checkout main
   git pull
   git checkout -b feat/add-wuwa-portraits      # or fix/…, chore/…, docs/…
   ```
3. Make your change and **commit** it to that branch:
   ```bash
   git add .
   git commit -m "feat: add Wuthering Waves character portraits"
   git push -u origin feat/add-wuwa-portraits
   ```
4. **Open a pull request** against `main` on GitHub (the push output prints a link,
   or use `gh pr create`). Keep it focused — one logical change per PR.
5. Match the existing code style (naming, formatting, comment density).
6. Test the extension locally (load unpacked) and, if the site changed,
   run `npm run build` in `web/` to confirm it builds cleanly.
7. Write a clear PR description: what changed, why, and how you tested it, and
   **link any related issue** (e.g. `Closes #12`).

A maintainer will review and merge — thanks for going through the branch + PR flow!

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
