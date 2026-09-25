// sitemap.xml, generated at build time.
//
// It used to be hand-written in public/, which meant its `lastmod` dates were
// whenever someone last remembered to edit them (September 3) and the profile
// pages that now exist were not in it at all.
//
// Profiles are listed only when their owner opted into search indexing
// (`profiles.searchable`). That is the same flag that decides whether the
// generated page carries <meta name="robots" content="noindex">, and both come
// from the choice in the showcase editor — see
// supabase/migrations/20260919000000_profile_searchable.sql. Listing a noindex
// page would be asking a crawler to fetch something it has been told to ignore.
//
// Like everything else that reads Supabase at build time, this degrades to
// "just the static pages" rather than failing the build.
import { fetchProfiles } from '../lib/profiles.mjs';

const SITE = import.meta.env.SITE.replace(/\/$/, '');

// The pages that exist regardless of what is in the database. `loc` is relative
// to the site base; `lastmod` for these is the build date, which is honest —
// they change when the site is rebuilt and deployed.
const STATIC_PAGES = [
  { loc: '', changefreq: 'monthly', priority: '1.0' },
  { loc: 'animelist.html', changefreq: 'monthly', priority: '0.7' },
  { loc: 'mangalist.html', changefreq: 'monthly', priority: '0.7' },
  { loc: 'import.html', changefreq: 'monthly', priority: '0.7' },
  { loc: 'showcase.html', changefreq: 'daily', priority: '0.6' },
  { loc: 'privacy-policy.html', changefreq: 'yearly', priority: '0.4' },
  { loc: 'contact.html', changefreq: 'yearly', priority: '0.4' },
];

const xmlEscape = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

const day = (value) => {
  const d = value ? new Date(value) : new Date();
  return (Number.isNaN(d.getTime()) ? new Date() : d).toISOString().slice(0, 10);
};

function urlEntry({ loc, lastmod, changefreq, priority }) {
  return [
    '  <url>',
    `    <loc>${xmlEscape(loc)}</loc>`,
    `    <lastmod>${lastmod}</lastmod>`,
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    '  </url>',
  ].join('\n');
}

export async function GET() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '') + '/';
  const today = day();

  const entries = STATIC_PAGES.map((p) =>
    urlEntry({ loc: SITE + base + p.loc, lastmod: today, changefreq: p.changefreq, priority: p.priority })
  );

  const profiles = await fetchProfiles();
  const listed = profiles.filter((p) => p.searchable);
  for (const p of listed) {
    entries.push(
      urlEntry({
        loc: `${SITE}${base}u/${encodeURIComponent(p.username)}.html`,
        lastmod: day(p.updated_at),
        changefreq: 'weekly',
        priority: '0.5',
      })
    );
  }
  console.log(
    `[sitemap] ${entries.length} url(s): ${STATIC_PAGES.length} static, ` +
      `${listed.length} of ${profiles.length} profile(s) opted into indexing.`
  );

  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    entries.join('\n') +
    '\n</urlset>\n';

  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
