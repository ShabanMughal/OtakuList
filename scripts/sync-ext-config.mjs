// Writes your Supabase values into cloud-config.local.json, which the extension
// reads at runtime and .gitignore keeps out of the repo.
//
//   node scripts/sync-ext-config.mjs                 # take them from .env / web/.env
//   node scripts/sync-ext-config.mjs --from-source   # take them from src/cloud-config.js
//   node scripts/sync-ext-config.mjs --clear         # delete the local file again
//
// Why a file and not an env var: Chrome loads the extension's files exactly as
// they sit on disk — there is no build step that could substitute one in. The
// values are read with fetch(), so when this file is absent the extension just
// runs local-only instead of failing to start.
//
// Note that the anon key is public either way: it ships in the website's JS and
// inside any packaged build of this extension. Row-level security is what
// protects the data — not keeping this value out of sight.
import { readFile, writeFile, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = resolve(root, "cloud-config.local.json");
const SOURCE_FILE = resolve(root, "src/cloud-config.js");
// First file that exists wins, so a root .env can override the website's.
const ENV_FILES = [resolve(root, ".env"), resolve(root, "web/.env"), resolve(root, "web/.env.local")];

const clear = process.argv.includes("--clear");
const fromSource = process.argv.includes("--from-source");
const rel = (p) => relative(root, p).replace(/\\/g, "/");

const fail = (msg) => {
  console.error(`✖ ${msg}`);
  process.exit(1);
};

function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    if (line.trim().startsWith("#")) continue;
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

async function readEnv() {
  for (const file of ENV_FILES) {
    try {
      return { file, env: parseEnv(await readFile(file, "utf8")) };
    } catch {
      // try the next candidate
    }
  }
  return null;
}

// Pull the values back out of src/cloud-config.js — for moving keys that are
// already sitting in that (tracked) file into the ignored one.
async function readSource() {
  const text = await readFile(SOURCE_FILE, "utf8").catch(() => fail(`Cannot read ${rel(SOURCE_FILE)}.`));
  const grab = (name) => (text.match(new RegExp(`^export const ${name}\\s*=\\s*["'](.*)["'];`, "m")) || [])[1] || "";
  return { file: SOURCE_FILE, url: grab("SUPABASE_URL"), key: grab("SUPABASE_ANON_KEY") };
}

// Blank the two constants in the tracked file, leaving its comments alone, so
// nothing sensitive is left behind in a file git is watching.
async function blankSourceFile() {
  let text = await readFile(SOURCE_FILE, "utf8");
  const before = text;
  for (const name of ["SUPABASE_URL", "SUPABASE_ANON_KEY"]) {
    text = text.replace(new RegExp(`^export const ${name}\\s*=.*$`, "m"), `export const ${name} = "";`);
  }
  if (text !== before) {
    await writeFile(SOURCE_FILE, text);
    console.log(`  Cleared the values out of ${rel(SOURCE_FILE)} (git tracks that one).`);
  }
}

if (clear) {
  await unlink(TARGET).catch(() => {});
  await blankSourceFile();
  console.log(`✓ Removed ${rel(TARGET)} — the extension is local-only again.`);
  process.exit(0);
}

let url = "";
let key = "";
let from = "";

if (fromSource) {
  const src = await readSource();
  ({ url, key } = src);
  from = rel(src.file);
  if (!url || !key) fail(`${from} has no values to move. Fill it in, or use a .env.`);
} else {
  const found = await readEnv();
  if (!found) fail(`No .env found. Looked in:\n  ${ENV_FILES.map(rel).join("\n  ")}\n(or use --from-source)`);
  url = found.env.PUBLIC_SUPABASE_URL || found.env.SUPABASE_URL || "";
  key = found.env.PUBLIC_SUPABASE_ANON_KEY || found.env.SUPABASE_ANON_KEY || "";
  from = rel(found.file);
  if (!url || !key) fail(`${from} is missing PUBLIC_SUPABASE_URL and/or PUBLIC_SUPABASE_ANON_KEY.`);
}

if (!/^https:\/\//.test(url)) fail(`The Supabase URL should start with https:// (got "${url}").`);

await writeFile(TARGET, `${JSON.stringify({ url, anonKey: key }, null, 2)}\n`);
console.log(`Read ${from}`);
console.log(`✓ Wrote ${rel(TARGET)} — git ignores this file.`);

// Moving keys out of the tracked file is the whole point, so tidy it up.
await blankSourceFile();

const host = new URL(url).host;
if (!host.endsWith(".supabase.co")) {
  console.log(`! ${host} is not a *.supabase.co host — add it to "host_permissions" in manifest.json.`);
}
console.log("  Now reload the extension at chrome://extensions.");
