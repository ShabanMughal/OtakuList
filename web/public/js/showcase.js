// Gacha showcase — public directory + email/password accounts with usernames.
//   • showcase.html            → public gallery of everyone (+ your editor if logged in)
//   • showcase.html?u=username → one person's public showcase (no login needed)
(function () {
  const $ = (id) => document.getElementById(id);
  const CLOUD = typeof sb !== "undefined" && !!sb;

  const GAMES = {
    wuwa: { name: "Wuthering Waves", rank: "Union Level", g1: "#12c2c9", g2: "#0a6e86", mono: "WW" },
    hsr: { name: "Honkai: Star Rail", rank: "Trailblaze Level", g1: "#8b5cf6", g2: "#f2b950", mono: "HSR" },
    zzz: { name: "Zenless Zone Zero", rank: "Inter-Knot Level", g1: "#f5e003", g2: "#1a1a1a", mono: "ZZZ" },
    genshin: { name: "Genshin Impact", rank: "Adventure Rank", g1: "#48c2b6", g2: "#e0b451", mono: "GI" },
    custom: { name: "Game", rank: "Level", g1: "#8b5cf6", g2: "#6366f1", mono: "★" },
  };

  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  const enc = encodeURIComponent;

  let mode = "home"; // "home" | "profile"
  let user = null;
  let username = null;
  let profile = { name: "", games: [] };
  let seq = 1;
  let editingId = null;

  const cardsEl = $("gs-cards");
  const emptyEl = $("gs-empty");
  const withIds = (arr) => (arr || []).map((x) => ({ ...x, id: seq++ }));
  const gamesForDb = () => profile.games.map(({ id, ...rest }) => rest);
  const publicUrl = (name) => `${location.origin + location.pathname}?u=${enc(name)}`;

  // ═══════════════════════════ card rendering ═══════════════════════════
  function monoChip(g) {
    const p = GAMES[g.game] || GAMES.custom;
    const mono = g.game === "custom" ? (((g.customName || "?").trim()[0] || "?").toUpperCase()) : p.mono;
    return `<span class="gmono" style="background:linear-gradient(135deg,${p.g1},${p.g2})">${esc(mono)}</span>`;
  }

  function cardHtml(gme) {
    const preset = GAMES[gme.game] || GAMES.custom;
    const name = gme.game === "custom" ? gme.customName || "Game" : preset.name;
    const rankLabel = gme.game === "custom" ? "Level" : preset.rank;
    const mono = gme.game === "custom" ? (((name.trim()[0]) || "★").toUpperCase()) : preset.mono;

    const rank = gme.rank ? `<div class="gs-rank"><b>${esc(rankLabel)}</b> ${esc(gme.rank)}</div>` : "";
    const meta = [];
    if (gme.ign) meta.push(`<span><i>IGN</i> ${esc(gme.ign)}</span>`);
    if (gme.uid) meta.push(`<span><i>UID</i> ${esc(gme.uid)}</span>`);
    const metaHtml = meta.length ? `<div class="gs-meta">${meta.join("")}</div>` : "";
    const chars = (gme.chars || "").split(",").map((c) => c.trim()).filter(Boolean);
    const charsHtml = chars.length
      ? `<div class="gs-chars">${chars.map((c) => `<span class="gs-chip">${esc(c)}</span>`).join("")}</div>`
      : "";
    const note = gme.note ? `<div class="gs-note">“${esc(gme.note)}”</div>` : "";
    const actions =
      mode === "profile"
        ? ""
        : `<div class="gs-card-actions">
             <button class="gs-iconbtn" data-edit="${gme.id}" title="Edit" type="button">✎</button>
             <button class="gs-iconbtn" data-del="${gme.id}" title="Remove" type="button">✕</button>
           </div>`;

    return `
    <article class="gs-card" style="--g1:${preset.g1};--g2:${preset.g2}">
      <div class="gs-banner"><span class="gs-mono">${esc(mono)}</span>${actions}</div>
      <div class="gs-body">
        <div class="gs-game">${esc(name)}</div>${rank}${metaHtml}${charsHtml}${note}
      </div>
    </article>`;
  }

  function renderCards() {
    if (profile.games.length) {
      cardsEl.innerHTML = profile.games.map(cardHtml).join("");
      emptyEl.hidden = true;
    } else {
      cardsEl.innerHTML = "";
      emptyEl.hidden = false;
      emptyEl.textContent =
        mode === "profile" ? "This showcase is empty." : "No games yet — add your first one above.";
    }
  }

  // ═══════════════════════════ view state ═══════════════════════════
  function renderView() {
    const loggedIn = !!user && !!username;
    if (mode === "profile") {
      $("gs-heading").textContent = profile.name ? `${profile.name}'s Showcase` : "Showcase";
      $("gs-sub").hidden = true;
      $("gs-editor").hidden = true;
      $("gs-loginprompt").hidden = true;
      $("gallery-wrap").hidden = true;
      $("gs-sharedbar").hidden = false;
      renderCards();
      return;
    }
    // home
    $("gs-heading").textContent = "Gacha Showcases";
    $("gs-sub").hidden = false;
    $("gs-sharedbar").hidden = true;
    $("gs-editor").hidden = !loggedIn;
    $("gs-loginprompt").hidden = loggedIn || !CLOUD;
    $("gallery-wrap").hidden = false;
    if (loggedIn) {
      renderCards();
      const link = publicUrl(username);
      const a = $("gs-yourlink");
      a.hidden = false;
      a.href = link;
      a.textContent = "· your link ↗";
    } else {
      cardsEl.innerHTML = "";
      emptyEl.hidden = true;
    }
  }

  function updateNav() {
    if (!CLOUD) {
      $("nav-login").hidden = true;
      $("nav-account").hidden = true;
      return;
    }
    const loggedIn = !!user;
    $("nav-login").hidden = loggedIn;
    $("nav-account").hidden = !loggedIn;
    if (loggedIn) {
      const label = username ? "@" + username : user.email;
      $("nav-mylink").textContent = label;
      $("nav-mylink").href = username ? publicUrl(username) : "#";
    }
  }

  // ═══════════════════════════ persist (games) ═══════════════════════════
  let saveTimer = null;
  function persist() {
    if (!(CLOUD && user && username)) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(cloudSave, 700);
  }
  async function cloudSave() {
    authMsg("Saving…");
    const { error } = await sb
      .from("profiles")
      .update({ games: gamesForDb(), display_name: profile.name, updated_at: new Date().toISOString() })
      .eq("id", user.id);
    authMsg(error ? "Couldn't save — try again." : "Saved ✓", !error);
  }

  // ═══════════════════════════ editor form ═══════════════════════════
  const form = $("gs-form");
  const gameSel = $("gs-game");
  const customIn = $("gs-custom");
  gameSel.addEventListener("change", () => (customIn.hidden = gameSel.value !== "custom"));

  function resetForm() {
    const keepName = $("gs-name").value;
    form.reset();
    $("gs-name").value = keepName;
    customIn.hidden = true;
    editingId = null;
    $("gs-add").textContent = "＋ Add to showcase";
    $("gs-cancel").hidden = true;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    profile.name = $("gs-name").value.trim();
    const entry = {
      game: gameSel.value,
      customName: customIn.value.trim(),
      rank: $("gs-rank").value.trim(),
      ign: $("gs-ign").value.trim(),
      uid: $("gs-uid").value.trim(),
      chars: $("gs-chars").value.trim(),
      note: $("gs-note").value.trim(),
    };
    if (editingId != null) {
      const g = profile.games.find((x) => x.id === editingId);
      if (g) Object.assign(g, entry);
    } else {
      profile.games.push({ id: seq++, ...entry });
    }
    persist();
    renderCards();
    resetForm();
  });
  $("gs-cancel").addEventListener("click", resetForm);

  cardsEl.addEventListener("click", (e) => {
    const ed = e.target.closest("[data-edit]");
    const del = e.target.closest("[data-del]");
    if (ed) {
      const g = profile.games.find((x) => x.id === +ed.dataset.edit);
      if (!g) return;
      gameSel.value = g.game;
      customIn.hidden = g.game !== "custom";
      customIn.value = g.customName || "";
      $("gs-rank").value = g.rank || "";
      $("gs-ign").value = g.ign || "";
      $("gs-uid").value = g.uid || "";
      $("gs-chars").value = g.chars || "";
      $("gs-note").value = g.note || "";
      editingId = g.id;
      $("gs-add").textContent = "Save changes";
      $("gs-cancel").hidden = false;
      $("gs-editor").scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (del) {
      profile.games = profile.games.filter((x) => x.id !== +del.dataset.del);
      persist();
      renderCards();
    }
  });

  $("gs-name").addEventListener("input", () => {
    profile.name = $("gs-name").value.trim();
    persist();
  });

  // ═══════════════════════════ messages ═══════════════════════════
  function authMsg(text, ok) {
    const el = $("auth-msg");
    if (!text) return (el.hidden = true);
    el.hidden = false;
    el.textContent = text;
    el.classList.toggle("ok", !!ok);
  }

  // ═══════════════════════════ AUTH MODAL ═══════════════════════════
  let authMode = "login"; // "login" | "signup"
  const modal = $("auth-modal");

  function openAuth(m) {
    modal.hidden = false;
    setAuthMode(m || "login");
    $("am-email").focus();
  }
  function closeAuth() {
    modal.hidden = true;
    $("am-err").hidden = true;
  }
  function setAuthMode(m) {
    authMode = m;
    const signup = m === "signup";
    $("am-title").textContent = signup ? "Create your account" : "Welcome back!";
    $("am-uwrap").hidden = !signup;
    $("am-username").required = signup;
    $("am-loginrow").hidden = signup;
    $("am-pass").autocomplete = signup ? "new-password" : "current-password";
    $("am-submit").textContent = signup ? "Create account" : "Login";
    $("am-switch-text").textContent = signup ? "Already have an account?" : "Don't have an account?";
    $("am-toggle").textContent = signup ? "Log in" : "Register";
    $("am-err").hidden = true;
    $("am-ustatus").hidden = true;
  }
  function authErr(msg, ok) {
    const el = $("am-err");
    if (!msg) return (el.hidden = true);
    el.hidden = false;
    el.textContent = msg;
    el.classList.toggle("ok", !!ok);
  }

  $("nav-login").addEventListener("click", () => openAuth("login"));
  $("prompt-login").addEventListener("click", () => openAuth("login"));
  $("am-close").addEventListener("click", closeAuth);
  $("am-toggle").addEventListener("click", () => setAuthMode(authMode === "signup" ? "login" : "signup"));
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeAuth();
  });

  // forgot password → email a reset link
  $("am-forgot").addEventListener("click", async () => {
    const email = $("am-email").value.trim();
    if (!email) return authErr("Enter your email above, then click Forgot password.");
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: location.origin + location.pathname,
    });
    authErr(error ? error.message : "✉️ Password reset link sent — check your email.", !error);
  });

  // live username availability (signup)
  let uCheck = null;
  $("am-username").addEventListener("input", (e) => {
    const v = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "");
    e.target.value = v;
    const status = $("am-ustatus");
    clearTimeout(uCheck);
    if (!v) return (status.hidden = true);
    if (!/^[a-z0-9_]{3,20}$/.test(v)) {
      status.hidden = false;
      status.className = "gs-uname-status dim";
      status.textContent = "3–20 chars: a–z, 0–9, _";
      return;
    }
    status.hidden = false;
    status.className = "gs-uname-status dim";
    status.textContent = "Checking…";
    uCheck = setTimeout(async () => {
      const { data } = await sb.from("profiles").select("username").eq("username", v).maybeSingle();
      if ($("am-username").value.trim().toLowerCase() !== v) return;
      status.hidden = false;
      status.className = data ? "gs-uname-status taken" : "gs-uname-status ok";
      status.textContent = data ? "✗ Taken — try another" : "✓ Available";
    }, 400);
  });

  $("auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("am-email").value.trim();
    const pass = $("am-pass").value;
    $("am-submit").disabled = true;
    try {
      if (authMode === "login") {
        const { error } = await sb.auth.signInWithPassword({ email, password: pass });
        if (error) return authErr(error.message);
        closeAuth();
      } else {
        const uname = $("am-username").value.trim().toLowerCase();
        if (pass.length < 6) return authErr("Password must be at least 6 characters.");
        if (!/^[a-z0-9_]{3,20}$/.test(uname))
          return authErr("Username: 3–20 chars, lowercase letters, numbers or underscore.");
        // pre-check availability for a friendly error
        const { data: taken } = await sb.from("profiles").select("username").eq("username", uname).maybeSingle();
        if (taken) return authErr("That username is taken — try another.");

        const { data, error } = await sb.auth.signUp({
          email,
          password: pass,
          options: { data: { username: uname }, emailRedirectTo: location.origin + location.pathname },
        });
        if (error) return authErr(error.message);
        if (data.session) {
          closeAuth(); // email confirmation is OFF → logged in immediately
        } else {
          // email confirmation is ON → must verify before logging in
          authErr("");
          closeAuth();
          authMsg("✉️ Account created — check your email to confirm, then log in.", true);
        }
      }
    } finally {
      $("am-submit").disabled = false;
    }
  });

  $("nav-logout").addEventListener("click", async () => {
    await sb.auth.signOut();
  });

  // ═══════════════════════════ auth lifecycle ═══════════════════════════
  async function loadOwnProfile() {
    const { data } = await sb
      .from("profiles")
      .select("username, display_name, games")
      .eq("id", user.id)
      .maybeSingle();
    if (data) {
      username = data.username;
      profile = { name: data.display_name || "", games: withIds(data.games) };
      $("gs-name").value = profile.name;
    } else {
      username = null; // trigger may not have run yet, or account without username
    }
  }

  async function onSignedIn(u) {
    user = u;
    await loadOwnProfile();
    authMsg("");
    updateNav();
    if (mode === "home") renderView();
  }
  function onSignedOut() {
    user = null;
    username = null;
    profile = { name: "", games: [] };
    $("gs-name").value = "";
    updateNav();
    if (mode === "home") renderView();
  }

  async function initAuth() {
    if (!CLOUD) {
      $("auth-noconfig").hidden = false;
      updateNav();
      return;
    }
    updateNav();
    const { data } = await sb.auth.getSession();
    if (data.session) await onSignedIn(data.session.user);
    sb.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) onSignedIn(session.user);
      else if (event === "SIGNED_OUT") onSignedOut();
    });
  }

  // ═══════════════════════════ gallery ═══════════════════════════
  async function loadGallery() {
    if (!CLOUD) return;
    const { data, error } = await sb
      .from("profiles")
      .select("username, display_name, games")
      .order("updated_at", { ascending: false })
      .limit(60);
    const wrap = $("gallery");
    const empty = $("gallery-empty");
    if (error || !data || !data.length) {
      wrap.innerHTML = "";
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    wrap.innerHTML = data
      .map((p) => {
        const games = Array.isArray(p.games) ? p.games : [];
        const monos = games.slice(0, 5).map(monoChip).join("") || `<span class="gmono">★</span>`;
        const name = p.display_name ? esc(p.display_name) : "@" + esc(p.username);
        return `
        <a class="gcard" href="?u=${enc(p.username)}">
          <div class="gcard-monos">${monos}</div>
          <div class="gcard-name">${name}</div>
          <div class="gcard-sub">@${esc(p.username)} · ${games.length} game${games.length === 1 ? "" : "s"}</div>
        </a>`;
      })
      .join("");
  }

  // ═══════════════════════════ single profile view ═══════════════════════════
  async function loadProfile(u) {
    mode = "profile";
    renderView();
    if (!CLOUD) {
      emptyEl.hidden = false;
      emptyEl.textContent = "Cloud accounts aren't configured yet.";
      return;
    }
    const { data, error } = await sb
      .from("profiles")
      .select("username, display_name, games")
      .eq("username", u)
      .maybeSingle();
    if (error || !data) {
      $("gs-heading").textContent = "Showcase not found";
      emptyEl.hidden = false;
      emptyEl.textContent = `No showcase found for “${u}”.`;
      return;
    }
    profile = { name: data.display_name || data.username, games: withIds(data.games) };
    $("gs-sharedtext").textContent = `👀 @${data.username}'s public showcase`;
    renderView();
  }

  // ═══════════════════════════ init ═══════════════════════════
  const params = new URLSearchParams(location.search);
  const viewUser = params.get("u");

  if (viewUser) {
    loadProfile(viewUser);
    if (CLOUD) initAuth(); // still let them log in from a profile page
  } else {
    mode = "home";
    renderView();
    initAuth();
    loadGallery();
  }
})();
