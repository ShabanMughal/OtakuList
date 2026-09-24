// OtakuList — site-wide sign-in (Google only) and the header's account menu.
//
// Every page loads this right after the shared Supabase client (see
// src/components/AuthBootstrap.astro). Page scripts use it through:
//   OtakuAuth.login()        start Google sign-in, coming back to this page
//   OtakuAuth.logout()
//   OtakuAuth.onChange(fn)   fn(state) once ready and on every change
//
// The extension handoff
// ─────────────────────
// Logging in here also logs the OtakuList extension in, when it is installed
// and signed out. It can't simply be handed this page's session: Supabase
// rotates refresh tokens, so two clients sharing one session would invalidate
// each other on their next refresh (and reuse detection then revokes both). So
// the extension gets a session of its own: the tab goes through Google once
// more — an instant bounce, since you have only just signed in — and lands on
// ext-connect.html, which passes those tokens to the extension's content
// script. This page's Supabase client never sees them.
(function () {
  const sb = window.sb || null;
  const cfg = window.OL_AUTH_CONFIG || { base: "/", supabaseUrl: "" };
  const $ = (id) => document.getElementById(id);

  // sessionStorage, so the flags survive the OAuth redirects in this tab only.
  const CONNECT_KEY = "otakulist-connect-ext"; // "1" → hand off after the next sign-in
  const NEXT_KEY = "otakulist-ext-next"; // where ext-connect.html sends you afterwards
  const ss = {
    get: (k) => { try { return sessionStorage.getItem(k); } catch (_) { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (_) {} },
    del: (k) => { try { sessionStorage.removeItem(k); } catch (_) {} },
  };

  // ext: null until the extension answers — and it never does when it isn't
  // installed (or is an older build without the auth bridge).
  const state = { ready: false, configured: !!sb, user: null, ext: null };
  const listeners = [];

  function emit() {
    render();
    if (!state.ready) return;
    for (const fn of listeners) {
      try { fn(state); } catch (err) { console.error(err); }
    }
  }

  // ── account details ─────────────────────────────────────────────────
  const meta = (u) => (u && u.user_metadata) || {};
  const displayName = (u) =>
    meta(u).full_name || meta(u).name || ((u && u.email) || "").split("@")[0] || "You";

  // Only Google's photo CDN — the same allowlist showcase.js applies.
  function avatarOf(u) {
    const raw = String(meta(u).avatar_url || meta(u).picture || "").trim();
    try {
      const url = new URL(raw);
      return url.protocol === "https:" && /(^|\.)googleusercontent\.com$/.test(url.hostname) ? url.href : "";
    } catch (_) {
      return "";
    }
  }

  const norm = (u) => String(u || "").trim().replace(/\/+$/, "").toLowerCase();
  // The extension must be signed out and pointed at the same Supabase project,
  // or the tokens would be useless to it.
  const canConnectExt = () =>
    !!(state.user && state.ext && state.ext.configured && !state.ext.signedIn &&
      norm(state.ext.supabaseUrl) === norm(cfg.supabaseUrl));

  // ── actions ─────────────────────────────────────────────────────────
  async function login(opts) {
    if (!sb) return;
    ss.set(CONNECT_KEY, "1");
    const { error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: (opts && opts.redirectTo) || location.href.split("#")[0] },
    });
    if (error) {
      ss.del(CONNECT_KEY);
      throw error;
    }
  }

  async function logout() {
    if (sb) await sb.auth.signOut();
  }

  let connecting = false;
  function connectExtension(next) {
    if (!cfg.supabaseUrl || connecting) return;
    connecting = true;
    ss.del(CONNECT_KEY);
    ss.set(NEXT_KEY, next || location.pathname + location.search);
    const url = new URL(cfg.supabaseUrl.replace(/\/+$/, "") + "/auth/v1/authorize");
    url.searchParams.set("provider", "google");
    url.searchParams.set("redirect_to", new URL(cfg.base + "ext-connect.html", location.origin).href);
    // Google skips the account picker when this matches a signed-in account.
    if (state.user && state.user.email) url.searchParams.set("login_hint", state.user.email);
    location.assign(url.href);
  }

  // After a sign-in started on this site, hand off to the extension once it has
  // said it is here and signed out. Give it a few seconds to answer; if it
  // never does (not installed), drop the request.
  let giveUpTimer = null;
  function maybeConnect() {
    if (ss.get(CONNECT_KEY) !== "1" || !state.user) return;
    if (!state.ext) {
      if (!giveUpTimer) giveUpTimer = setTimeout(() => ss.del(CONNECT_KEY), 4000);
      return;
    }
    ss.del(CONNECT_KEY);
    if (canConnectExt()) connectExtension();
  }

  // ── header widget ───────────────────────────────────────────────────
  function setMenu(open) {
    const menu = $("ol-menu");
    const btn = $("ol-avatar-btn");
    if (!menu || !btn) return;
    menu.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
  }

  function render() {
    const loginBtn = $("ol-login");
    const avBtn = $("ol-avatar-btn");
    if (!loginBtn || !avBtn) return; // a page without the header
    const u = state.user;
    // Nothing until the session is known, so a signed-in visitor never sees
    // "Log in" flash first.
    loginBtn.hidden = !state.configured || !state.ready || !!u;
    avBtn.hidden = !u;
    if (!u) return setMenu(false);

    const name = displayName(u);
    const pic = avatarOf(u);
    const img = $("ol-avatar");
    const initial = $("ol-initial");
    initial.textContent = (name[0] || "?").toUpperCase();
    img.onerror = () => {
      img.hidden = true;
      initial.hidden = false;
    };
    if (pic) {
      if (img.getAttribute("src") !== pic) img.src = pic;
      img.hidden = false;
      initial.hidden = true;
    } else {
      img.hidden = true;
      initial.hidden = false;
    }
    avBtn.title = name;
    avBtn.setAttribute("aria-label", `Account menu for ${name}`);
    $("ol-name").textContent = name;
    $("ol-email").textContent = u.email || "";

    const ext = state.ext;
    const extLine = $("ol-ext");
    extLine.hidden = !(ext && ext.configured && ext.signedIn);
    if (!extLine.hidden) {
      extLine.textContent =
        ext.email && ext.email !== u.email ? `Extension signed in as ${ext.email}` : "✓ Extension connected";
    }
    $("ol-connect").hidden = !canConnectExt();
  }

  function wireHeader() {
    const avBtn = $("ol-avatar-btn");
    if (!avBtn) return;
    $("ol-login").addEventListener("click", () => login().catch((err) => console.error(err)));
    avBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      setMenu($("ol-menu").hidden);
    });
    document.addEventListener("click", (e) => {
      if (!$("ol-account").contains(e.target)) setMenu(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !$("ol-menu").hidden) {
        setMenu(false);
        avBtn.focus();
      }
    });
    $("ol-logout").addEventListener("click", () => {
      setMenu(false);
      logout();
    });
    $("ol-connect").addEventListener("click", () => connectExtension());
  }

  // ── extension bridge (see otakulistBridge in the extension's content.js) ──
  const requestExt = () =>
    window.postMessage({ source: "otakulist-web", type: "request-auth" }, location.origin);

  window.addEventListener("message", (e) => {
    if (e.source !== window || e.origin !== location.origin) return;
    const d = e.data;
    if (!d || d.source !== "otakulist-ext") return;
    if (d.type === "hello") requestExt();
    else if (d.type === "auth") {
      state.ext = {
        configured: !!d.configured,
        signedIn: !!d.signedIn,
        email: String(d.email || ""),
        supabaseUrl: String(d.supabaseUrl || ""),
      };
      emit();
      maybeConnect();
    }
  });

  // ── init ────────────────────────────────────────────────────────────
  window.OtakuAuth = {
    login,
    logout,
    connectExtension,
    canConnectExtension: canConnectExt,
    get state() {
      return state;
    },
    onChange(fn) {
      listeners.push(fn);
      if (state.ready) fn(state);
    },
  };

  wireHeader();
  if (sb) {
    // Fires INITIAL_SESSION straight away, then SIGNED_IN / SIGNED_OUT / etc.
    sb.auth.onAuthStateChange((_event, session) => {
      state.user = session ? session.user : null;
      state.ready = true;
      emit();
      maybeConnect();
    });
  } else {
    state.ready = true;
    emit();
  }
  requestExt();
})();
