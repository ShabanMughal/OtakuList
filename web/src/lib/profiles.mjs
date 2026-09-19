// Build-time read of the public `profiles` table.
//
// Used by src/pages/u/[username].astro (one static page per profile) and by
// src/pages/sitemap.xml.js. Both run inside the same `astro build`, so the
// result is memoised and Supabase is hit once per build.
//
// THE RULE HERE: this must never fail a build. Missing env vars, a Supabase
// outage, a 500, a malformed body — every one of them logs a warning and
// returns an empty list, so the landing page and the anime list still deploy.
// A profile page that is one build stale is a nuisance; a deploy that cannot
// run because a third party is down is an outage.

import { readFileSync } from 'node:fs';

// Newest first, so hitting the cap drops the profiles least likely to be
// linked. Raising it costs build time linearly — 2000 pages is already a few
// seconds of rendering.
export const MAX_PROFILES = 2000;

// Everything the page renders, and nothing else.
const COLUMNS = 'username,display_name,avatar_url,games,featured,likes_count,updated_at';

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

let cached = null;

function warn(message) {
  console.warn('[profiles] ' + message);
}

async function get(url, key) {
  return fetch(url, {
    headers: { apikey: key, Authorization: 'Bearer ' + key, Accept: 'application/json' },
  });
}

/**
 * Every profile that should get a static page, newest first.
 * Returns `[]` rather than throwing, always.
 */
export async function fetchProfiles() {
  if (cached) return cached;

  const base = String(process.env.PUBLIC_SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL || '')
    .replace(/\/+$/, '');
  const key = String(process.env.PUBLIC_SUPABASE_ANON_KEY || import.meta.env.PUBLIC_SUPABASE_ANON_KEY || '');
  if (!base || !key) {
    warn('PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY are not set — no per-profile pages will be generated. The rest of the site builds normally.');
    return (cached = []);
  }

  const query = (columns) =>
    base +
    '/rest/v1/profiles?select=' +
    columns +
    '&order=updated_at.desc&limit=' +
    MAX_PROFILES;

  let rows = null;
  // `searchable` arrived with 20260919000000_profile_searchable.sql. If that
  // migration hasn't been applied yet PostgREST rejects the whole select, so
  // fall back to the columns that have always existed and treat every profile
  // as not-opted-in rather than generating nothing at all.
  let hasSearchable = true;
  try {
    let res = await get(query(COLUMNS + ',searchable'), key);
    if (!res.ok && res.status === 400) {
      warn('the `searchable` column is missing — run supabase/migrations/20260919000000_profile_searchable.sql. Building profile pages as noindex for now.');
      hasSearchable = false;
      res = await get(query(COLUMNS), key);
    }
    if (!res.ok) {
      warn('Supabase returned ' + res.status + ' ' + res.statusText + ' — no per-profile pages this build.');
      return (cached = []);
    }
    rows = await res.json();
  } catch (err) {
    warn('could not reach Supabase (' + (err && err.message ? err.message : err) + ') — no per-profile pages this build.');
    return (cached = []);
  }

  if (!Array.isArray(rows)) {
    warn('Supabase returned something that is not an array — no per-profile pages this build.');
    return (cached = []);
  }

  if (rows.length >= MAX_PROFILES) {
    warn('hit the ' + MAX_PROFILES + '-profile cap. Profiles older than the newest ' + MAX_PROFILES + ' have no static page; raise MAX_PROFILES in src/lib/profiles.mjs if that is no longer the right trade.');
  }

  // A username is a filename here, so anything that isn't the shape the DB
  // constraint promises gets dropped rather than trusted.
  const clean = rows
    .filter((r) => r && USERNAME_RE.test(String(r.username || '')))
    .map((r) => ({
      username: r.username,
      display_name: r.display_name || '',
      avatar_url: r.avatar_url || '',
      games: Array.isArray(r.games) ? r.games : [],
      featured: Array.isArray(r.featured) ? r.featured : [],
      likes_count: Number(r.likes_count) || 0,
      updated_at: r.updated_at || '',
      searchable: hasSearchable ? r.searchable === true : false,
    }));

  if (clean.length !== rows.length) {
    warn('skipped ' + (rows.length - clean.length) + ' row(s) with a malformed username.');
  }
  console.log('[profiles] generating ' + clean.length + ' per-profile page(s).');
  return (cached = clean);
}

let roster = null;

/** public/data/characters.json, read from disk — no network at build time. */
export function loadRoster() {
  if (roster) return roster;
  try {
    roster = JSON.parse(
      readFileSync(new URL('../../public/data/characters.json', import.meta.url), 'utf8')
    );
  } catch (err) {
    warn('could not read public/data/characters.json — profile pages fall back to initials.');
    roster = {};
  }
  return roster;
}
