// Supabase config — SAFE to commit. The anon key is a public key; your data is
// protected by Row-Level Security policies, not by hiding this value.
// Fill these two in from Supabase → Project Settings → API.
const SUPABASE_URL = "";
const SUPABASE_ANON_KEY = "";

// Create the client only if real keys are present and the CDN lib loaded.
// Until then the showcase runs in local-only mode (localStorage + link sharing).
let sb = null;
try {
  const configured =
    typeof supabase !== "undefined" &&
    SUPABASE_URL.startsWith("https://") &&
    !SUPABASE_URL.includes("YOURPROJECT") &&
    !SUPABASE_ANON_KEY.includes("YOUR_ANON");
  if (configured) {
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
} catch (e) {
  console.warn("Supabase not configured yet:", e);
  sb = null;
}
