// Fallback Supabase config for the OPTIONAL cloud sync.
//
// KEEP THIS FILE EMPTY unless you want the values committed: git tracks it.
// Your own project's values belong in cloud-config.local.json, which
// .gitignore keeps out of the repo and the extension prefers over this file:
//
//   node scripts/sync-ext-config.mjs                # from .env / web/.env
//   node scripts/sync-ext-config.mjs --from-source  # move values out of here
//   node scripts/sync-ext-config.mjs --clear        # back to local-only
//
// Chrome loads these files as-is, so nothing can substitute a .env at runtime —
// the values have to be in one of the two files. With both empty the extension
// simply stays local-only and nothing ever leaves the browser.
//
// Filling this in is still fine for a build you intend to ship with sync baked
// in: the anon key is public by design (it ships in the website's JS too) and
// your data is protected by the RLS policies in supabase/migrations. Never put
// the service_role key in either file — it bypasses RLS.

export const SUPABASE_URL = "";
export const SUPABASE_ANON_KEY = "";
