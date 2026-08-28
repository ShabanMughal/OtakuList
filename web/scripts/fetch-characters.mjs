// Regenerates web/public/data/characters.json from public sources.
//   genshin / hsr : yatta.moe (Project Amber) API — same CDN the icons already use
//   zzz / wuwa    : Zenless / Wuthering Waves Fandom wikis (playable roster + rarity)
//   pgr           : Punishing: Gray Raven Fandom wiki (Constructs + S/A/B rank)
//
// Images are hotlinked, not downloaded — this only refreshes names, rarity (r)
// and image URLs. Run: `node web/scripts/fetch-characters.mjs`
// A game whose fetch fails or returns nothing keeps its previous entries, so a
// transient outage can never wipe the roster.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../public/data/characters.json");
const UA = "OtakuList-character-sync/1.0 (+https://github.com/ShabanMughal/OtakuList)";

const byName = (a, b) => a.name.localeCompare(b.name);
const stripRevision = (url) => (url ? url.split("/revision/")[0] : url);

// yatta's internal element names → the names players actually use.
const GI_ELEM = { Fire: "Pyro", Water: "Hydro", Wind: "Anemo", Ice: "Cryo", Rock: "Geo", Electric: "Electro", Grass: "Dendro" };
const HSR_ELEM = { Thunder: "Lightning" };

// Some units (Traveler, Trailblazer) share one name across every element AND
// both twins. Disambiguate in two levels: append the element when a name
// repeats, then append the twin's name (Aether/Lumine, Caelus/Stelle) if that
// still collides — so both variants survive as distinct, labelled entries.
// Also de-dupes any remaining exact collisions and sorts every game.
function finalize(list) {
  const nameCount = {};
  for (const c of list) nameCount[c.name] = (nameCount[c.name] || 0) + 1;
  const labeled = list.map((c) => ({
    ...c,
    label: nameCount[c.name] > 1 && c._elem ? `${c.name} (${c._elem})` : c.name,
  }));
  const labelCount = {};
  for (const c of labeled) labelCount[c.label] = (labelCount[c.label] || 0) + 1;
  const seen = new Set();
  const out = [];
  for (const c of labeled) {
    const name = labelCount[c.label] > 1 && c._variant ? `${c.label} · ${c._variant}` : c.label;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, img: c.img, r: c.r });
  }
  return out.sort(byName);
}

async function fetchJson(url, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === tries) throw e;
      await new Promise((r) => setTimeout(r, 800 * i));
    }
  }
}

// ── MediaWiki (Fandom) helper: runs a query and follows `continue` tokens,
// merging generator pages (by pageid) and accumulating list results. ──────
async function mwQueryAll(apiBase, params) {
  const pages = {};
  const list = [];
  let cont = {};
  for (;;) {
    const url = new URL(apiBase);
    for (const [k, v] of Object.entries({ format: "json", ...params, ...cont })) url.searchParams.set(k, v);
    const data = await fetchJson(url);
    const q = data.query || {};
    if (q.pages) for (const [pid, pg] of Object.entries(q.pages)) pages[pid] = Object.assign(pages[pid] || {}, pg);
    if (q.categorymembers) list.push(...q.categorymembers);
    if (data.continue) cont = data.continue;
    else break;
  }
  return { pages: Object.values(pages), list };
}

const categoryTitles = async (api, category) =>
  new Set(
    (await mwQueryAll(api, {
      action: "query",
      list: "categorymembers",
      cmtitle: `Category:${category}`,
      cmlimit: "500",
      cmnamespace: "0",
    })).list.map((m) => m.title)
  );

// Every page in a category + its lead image (the character's portrait/art).
const categoryPagesWithImages = (api, category) =>
  mwQueryAll(api, {
    action: "query",
    generator: "categorymembers",
    gcmtitle: `Category:${category}`,
    gcmlimit: "500",
    gcmnamespace: "0",
    prop: "pageimages",
    piprop: "original",
    pilimit: "500",
  }).then((r) => r.pages);

// ── per-game fetchers ─────────────────────────────────────────────────────
async function genshin() {
  const now = Math.floor(Date.now() / 1000);
  const d = await fetchJson("https://gi.yatta.moe/api/v2/en/avatar");
  return Object.values(d.data.items)
    .filter((c) => !c.release || c.release <= now) // exclude unreleased/beta
    .map((c) => ({
      name: c.name,
      img: `https://gi.yatta.moe/assets/UI/${c.icon}.png`,
      r: c.rank,
      _elem: GI_ELEM[c.element] || c.element,
      _variant: /Girl/.test(c.icon) ? "Lumine" : /Boy/.test(c.icon) ? "Aether" : undefined,
    }));
}

async function hsr() {
  const now = Math.floor(Date.now() / 1000);
  const d = await fetchJson("https://sr.yatta.moe/api/v2/en/avatar");
  return Object.values(d.data.items)
    .filter((c) => !c.release || c.release <= now)
    .map((c) => ({
      name: c.name,
      img: `https://sr.yatta.moe/hsr/assets/UI/avatar/${c.icon}.png`,
      r: c.rank,
      _elem: HSR_ELEM[c.types?.combatType] || c.types?.combatType,
      // MC only: odd id = Caelus, even id = Stelle — verified visually.
      _variant: c.name === "Trailblazer" ? (c.id % 2 === 0 ? "Stelle" : "Caelus") : undefined,
    }));
}

async function zzz() {
  const api = "https://zenless-zone-zero.fandom.com/api.php";
  const [pages, sRank] = await Promise.all([
    categoryPagesWithImages(api, "Playable Agents"),
    categoryTitles(api, "S-Rank Agents"),
  ]);
  return pages
    .map((p) => ({
      name: p.title,
      img: stripRevision(p.original?.source) || null,
      r: sRank.has(p.title) ? 5 : 4,
    }))
    .sort(byName);
}

async function wuwa() {
  const api = "https://wutheringwaves.fandom.com/api.php";
  const [pages, fiveStar] = await Promise.all([
    categoryPagesWithImages(api, "Playable Resonators"),
    categoryTitles(api, "5-Star Resonators"),
  ]);
  const list = pages
    // Drop the wiki's merged "Rover" page (a dark two-figure placeholder) and
    // its element sub-pages; we add proper male/female Rover entries below.
    .filter((p) => p.title !== "Rover" && !p.title.startsWith("Rover-"))
    .map((p) => ({
      name: p.title,
      img: stripRevision(p.original?.source) || null,
      r: fiveStar.has(p.title) ? 5 : 4,
    }));
  // Rover is the player character with distinct male/female designs — split it
  // in two using the full-body model art (same style as the other cards).
  const WW = "https://static.wikia.nocookie.net/wutheringwaves/images";
  list.push(
    { name: "Rover · Male", img: `${WW}/0/05/Male_Rover_Model.png`, r: 5 },
    { name: "Rover · Female", img: `${WW}/a/ad/Female_Rover_Model.png`, r: 5 }
  );
  return list.sort(byName);
}

async function pgr() {
  const api = "https://punishing-gray-raven.fandom.com/api.php";
  const [pages, sRank, aRank] = await Promise.all([
    categoryPagesWithImages(api, "Constructs"),
    categoryTitles(api, "S-rank"),
    categoryTitles(api, "A-rank"),
  ]);
  return pages
    .map((p) => ({
      name: p.title,
      img: stripRevision(p.original?.source) || null,
      r: sRank.has(p.title) ? 5 : aRank.has(p.title) ? 4 : 3,
    }))
    .sort(byName);
}

// ── orchestrate ───────────────────────────────────────────────────────────
const GAMES = { genshin, hsr, zzz, wuwa, pgr }; // also defines output key order

async function main() {
  const existing = JSON.parse(await readFile(OUT, "utf8"));
  const out = {};
  let failures = 0;

  for (const [game, fetcher] of Object.entries(GAMES)) {
    try {
      const list = await fetcher();
      const noImg = list.filter((c) => !c.img).length;
      const withImg = finalize(list.filter((c) => c.img));
      if (!withImg.length) throw new Error("no characters returned");
      out[game] = withImg;
      console.log(`${game}: ${withImg.length} characters${noImg ? ` (${noImg} skipped: no image)` : ""}`);
    } catch (e) {
      failures++;
      out[game] = existing[game] || [];
      console.warn(`${game}: FETCH FAILED (${e.message}) — keeping ${out[game].length} existing entries`);
    }
  }

  // Preserve any games present in the file that we don't manage here.
  for (const g of Object.keys(existing)) if (!(g in out)) out[g] = existing[g];

  await writeFile(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log(`\nWrote ${OUT}`);
  if (failures) {
    console.error(`${failures} game(s) failed — kept previous data for those.`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
