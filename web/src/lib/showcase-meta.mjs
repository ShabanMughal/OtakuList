// Shared showcase vocabulary — game presets, roster lookups, UID regions and
// the link-preview strings.
//
// Two very different things render a profile without the page's JavaScript:
//   • the Astro build-time route (src/pages/u/[username].astro), which emits a
//     real HTML file per profile for GitHub Pages;
//   • functions/[[path]].js, the Cloudflare Pages Function kept as the upgrade
//     path if this ever moves to a custom domain.
// Both import from here so the same profile never unfurls two different ways.
//
// web/public/js/showcase.js carries its own copies of these helpers because it
// is a plain browser script, not a module. If you change a format here, change
// it there too.

export const MAX_DESC = 200;

// Full presets: `name` and `rank` label the game, `mono`/`g1`/`g2` draw its
// card. GAME_NAMES is the display-name-only view the preview strings need.
export const GAMES = {
  wuwa: { name: 'Wuthering Waves', rank: 'Union Level', g1: '#12c2c9', g2: '#0a6e86', mono: 'WW' },
  hsr: { name: 'Honkai: Star Rail', rank: 'Trailblaze Level', g1: '#8b5cf6', g2: '#f2b950', mono: 'HSR' },
  zzz: { name: 'Zenless Zone Zero', rank: 'Inter-Knot Level', g1: '#f5e003', g2: '#1a1a1a', mono: 'ZZZ' },
  pgr: { name: 'Punishing: Gray Raven', rank: 'Commandant Level', g1: '#e4002b', g2: '#1a1a1a', mono: 'PGR' },
  genshin: { name: 'Genshin Impact', rank: 'Adventure Rank', g1: '#48c2b6', g2: '#e0b451', mono: 'GI' },
  custom: { name: 'Game', rank: 'Level', g1: '#8b5cf6', g2: '#6366f1', mono: '★' },
};

export const GAME_NAMES = {
  genshin: 'Genshin Impact',
  hsr: 'Honkai: Star Rail',
  zzz: 'Zenless Zone Zero',
  wuwa: 'Wuthering Waves',
  pgr: 'Punishing: Gray Raven',
};

export const splitChars = (s) =>
  String(s || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

export const initials = (name) => (String(name == null ? '' : name).trim()[0] || '?').toUpperCase();

// Entries with an unknown game key never reach a renderer: a row written before
// the payload constraints landed, or by anything other than the page itself.
export const isKnownGame = (g) => !!g && typeof g === 'object' && !!GAMES[g.game];
export const sanitizeGames = (arr) => (Array.isArray(arr) ? arr.filter(isKnownGame) : []);

export const gameName = (g) =>
  g.game === 'custom' ? g.customName || 'Custom' : (GAMES[g.game] || {}).name || 'Game';
export const gameShort = (g) =>
  g.game === 'custom'
    ? ((g.customName || '?').trim()[0] || '?').toUpperCase()
    : (GAMES[g.game] || {}).mono || 'GG';
export const gameRankLabel = (g) =>
  g.game === 'custom' ? 'Level' : (GAMES[g.game] || {}).rank || 'Level';

// Only these four ship a logo under assets/games/.
export const LOGO_GAMES = { genshin: 1, hsr: 1, zzz: 1, wuwa: 1 };

// Full-body card art (WuWa, PGR, ZZZ) reads best cropped from the top so the
// character's head stays in frame; the square GI/HSR icons look best centered.
export const FULLBODY = { wuwa: 1, pgr: 1, zzz: 1 };
export const coverPos = (game) => (FULLBODY[game] ? 'top' : 'center');

// ── roster lookups ────────────────────────────────────────────────────
// `roster` is public/data/characters.json: { game: [{ name, img, r }] }.
export function charInfo(roster, game, name) {
  const list = (roster || {})[game];
  if (!Array.isArray(list)) return null;
  const want = String(name == null ? '' : name).toLowerCase();
  return list.find((c) => String(c.name).toLowerCase() === want) || null;
}
export const charImg = (roster, game, name) => (charInfo(roster, game, name) || {}).img || '';
export const charRank = (roster, game, name) => (charInfo(roster, game, name) || {}).r || 5;

// ── avatars ───────────────────────────────────────────────────────────
// RLS controls WHO writes a row, not WHAT they write, so avatar_url arrives as
// an arbitrary owner-chosen string. Rendered on a public page that means any
// profile owner could log the IP and user-agent of everyone who opens it.
// Allow only the hosts we actually produce. Mirrors safeAvatarUrl() in
// web/public/js/showcase.js and the DB constraint in
// supabase/migrations/20260910000000_avatar_url_allowlist.sql.
export const AVATAR_HOSTS = [
  /^lh[0-9]+\.googleusercontent\.com$/,
  /^[a-z0-9-]+\.googleusercontent\.com$/,
  /^[a-z0-9-]+\.supabase\.co$/,
];

export function safeAvatarUrl(raw) {
  const value = String(raw == null ? '' : raw).trim();
  if (!value) return '';
  let u;
  try {
    u = new URL(value);
  } catch (_) {
    return '';
  }
  if (u.protocol !== 'https:') return ''; // blocks javascript:, data:, http:
  if (!AVATAR_HOSTS.some((re) => re.test(u.hostname))) return '';
  if (/\.supabase\.co$/.test(u.hostname) && !u.pathname.startsWith('/storage/v1/object/public/'))
    return '';
  return u.href;
}

// A real photo only when its owner opted in; otherwise their first cover
// character, then the rarest character they list. Initials are the last resort.
export function profileAvatarUrl(profile, roster) {
  const photo = safeAvatarUrl(profile && profile.avatar_url);
  if (photo) return photo;
  const games = sanitizeGames(profile && profile.games);
  let pick = Array.isArray(profile && profile.featured) ? profile.featured[0] : null;
  if (!pick) {
    const flat = [];
    games.forEach((g) =>
      splitChars(g.chars).forEach((cn) =>
        flat.push({ game: g.game, name: cn, r: charRank(roster, g.game, cn) })
      )
    );
    flat.sort((a, b) => b.r - a.r);
    pick = flat[0];
  }
  return pick ? safeImage(charImg(roster, pick.game, pick.name)) : '';
}

// ── deterministic palettes (per username) ─────────────────────────────
export const hashStr = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};
export const BANNERS = [
  'linear-gradient(120deg,#1e1b4b,#6b4be0 55%,#6fa8dc)',
  'linear-gradient(120deg,#450a0a,#be123c 60%,#f59e0b)',
  'linear-gradient(120deg,#0f172a,#1e40af 60%,#a855f7)',
  'linear-gradient(120deg,#134e4a,#0d9488 60%,#facc15)',
  'linear-gradient(120deg,#3b0764,#a855f7 55%,#d9647f)',
  'linear-gradient(120deg,#1e3a8a,#5b8fc9 60%,#93c5fd)',
];
export const AVATARS = [
  'linear-gradient(140deg,#5b8fc9,#7d5cf5)',
  'linear-gradient(140deg,#d9647f,#f59e0b)',
  'linear-gradient(140deg,#6fa8dc,#7d5cf5)',
  'linear-gradient(140deg,#2dd4bf,#facc15)',
  'linear-gradient(140deg,#a855f7,#d9647f)',
  'linear-gradient(140deg,#6fa8dc,#b9a8ff)',
];
export const bannerFor = (u) => BANNERS[hashStr(String(u || '')) % BANNERS.length];
export const avatarFor = (u) => AVATARS[hashStr(String(u || '') + 'a') % AVATARS.length];

// ── UID → server region ───────────────────────────────────────────────
// Genshin only, deliberately — see the note in web/public/js/showcase.js.
export const GAMES_WITH_REGION = new Set(['genshin']);
export const REGIONS = { cn: 'China', na: 'America', eu: 'Europe', asia: 'Asia', tw: 'TW/HK/MO' };

export function uidRegion(game, uid) {
  if (!GAMES_WITH_REGION.has(game)) return null;
  const digits = String(uid || '').replace(/\D/g, '');
  if (digits.length === 10) return digits.startsWith('18') ? 'na' : null;
  if (digits.length !== 9) return null;
  const first = digits[0];
  if (first >= '1' && first <= '5') return 'cn';
  return { 6: 'na', 7: 'eu', 8: 'asia', 9: 'tw' }[first] || null;
}

// ── link preview ──────────────────────────────────────────────────────
// Only ever render an image URL over https — the same rule the page applies to
// avatars, applied to whatever the roster hands back.
export function safeImage(url) {
  try {
    const u = new URL(String(url || ''));
    if (u.protocol !== 'https:') return '';
    return u.href;
  } catch (_) {
    return '';
  }
}

export function profileTitle(profile) {
  const name = profile.display_name || '@' + (profile.username || '');
  return name + ' — Gacha Showcase';
}

// "Genshin Impact · Honkai: Star Rail — 42 characters · 7 likes"
export function profileDescription(profile) {
  const games = sanitizeGames(profile.games);
  const gameLabels = games.map(gameName).filter(Boolean);
  const charCount = games.reduce((n, g) => n + splitChars(g.chars).length, 0);

  const bits = [];
  if (gameLabels.length) bits.push(gameLabels.join(' · '));
  const tail = [];
  if (charCount) tail.push(charCount + ' character' + (charCount === 1 ? '' : 's'));
  if (profile.likes_count)
    tail.push(profile.likes_count + ' like' + (profile.likes_count === 1 ? '' : 's'));
  if (tail.length) bits.push(tail.join(' · '));
  return (bits.join(' — ') || 'A gacha showcase on OtakuList.').slice(0, MAX_DESC);
}

// The preview image: the first cover character's portrait, else the site card.
export function previewImage(profile, roster, fallbackImage) {
  const featured = Array.isArray(profile.featured) ? profile.featured : [];
  const pick = featured[0];
  const hit = pick ? charImg(roster, pick.game, pick.name) : '';
  return safeImage(hit) || fallbackImage;
}

export function buildMeta(profile, roster, pageUrl, fallbackImage) {
  return {
    title: profileTitle(profile),
    description: profileDescription(profile),
    image: previewImage(profile, roster, fallbackImage),
    url: pageUrl,
  };
}
