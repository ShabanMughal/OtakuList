// Gacha showcase, public directory + email/password accounts with usernames.
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
  let profile = { name: "", games: [], featured: [], avatar: "" };
  let seq = 1;
  let editingId = null;
  let wantEdit = false; // set from a "#edit" deep-link → auto-open the editor once signed in
  let setupDismissed = false; // user closed the "pick username" modal; reopen via Finish setup

  // ── character roster (name → portrait + rarity, per game) ─────────────
  let ROSTER = {}; // { game: [{name,img,r}] }
  let ROSTER_MAP = {}; // { game: { lowername: {img,r} } }
  async function loadRoster() {
    try {
      const url = new URL("data/characters.json", location.href).href;
      ROSTER = await (await fetch(url)).json();
    } catch (e) {
      ROSTER = {};
    }
    ROSTER_MAP = {};
    for (const g in ROSTER) {
      ROSTER_MAP[g] = {};
      for (const c of ROSTER[g]) ROSTER_MAP[g][c.name.toLowerCase()] = { img: c.img, r: c.r || 5 };
    }
  }
  const charInfo = (game, name) => (ROSTER_MAP[game] || {})[String(name).toLowerCase()] || null;
  const charImg = (game, name) => (charInfo(game, name) || {}).img || "";
  const charRank = (game, name) => (charInfo(game, name) || {}).r || 5;
  const initials = (name) => (String(name).trim()[0] || "?").toUpperCase();

  // Profile picture from OAuth metadata (Google returns `avatar_url`/`picture`).
  const oauthAvatar = (u) => {
    const m = (u && u.user_metadata) || {};
    return m.avatar_url || m.picture || "";
  };
  // Round avatar: the real picture if we have one, else an initials medallion.
  // On a broken image url it falls back to the same initials medallion.
  function avatarCircle(url, inits, bg, size, fs, border) {
    const ring = `width:${size}px;height:${size}px;flex:none;border-radius:50%;border:${border}px solid rgba(11,10,22,.9);`;
    const fallStyle = `${ring}background:${bg};display:grid;place-items:center;font-family:var(--font-heading);font-weight:800;font-size:${fs}px;color:#fff`;
    if (!url) return `<div style="${fallStyle}">${inits}</div>`;
    return `<img src="${esc(url)}" alt="${inits}" referrerpolicy="no-referrer" loading="lazy" style="${ring}object-fit:cover;background:${bg}" onerror="this.replaceWith(Object.assign(document.createElement('div'),{style:'${fallStyle}',textContent:'${inits}'}))">`;
  }
  function charThumb(game, name) {
    const img = charImg(game, name);
    return img
      ? `<img class="gs-charimg" src="${esc(img)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'gs-charini',textContent:'${esc(initials(name))}'}))">`
      : `<span class="gs-charini">${esc(initials(name))}</span>`;
  }
  // portrait filling its container (for tiles / cards), initials fallback
  function charCover(game, name) {
    const img = charImg(game, name);
    return img
      ? `<img src="${esc(img)}" alt="${esc(name)}" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">`
      : "";
  }

  // ── modernist palettes (deterministic per username) ───────────────────
  const hashStr = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
  const BANNERS = [
    "linear-gradient(120deg,#1e1b4b,#6b4be0 55%,#6fa8dc)",
    "linear-gradient(120deg,#450a0a,#be123c 60%,#f59e0b)",
    "linear-gradient(120deg,#0f172a,#1e40af 60%,#a855f7)",
    "linear-gradient(120deg,#134e4a,#0d9488 60%,#facc15)",
    "linear-gradient(120deg,#3b0764,#a855f7 55%,#d9647f)",
    "linear-gradient(120deg,#1e3a8a,#5b8fc9 60%,#93c5fd)",
  ];
  const AVATARS = [
    "linear-gradient(140deg,#5b8fc9,#7d5cf5)", "linear-gradient(140deg,#d9647f,#f59e0b)",
    "linear-gradient(140deg,#6fa8dc,#7d5cf5)", "linear-gradient(140deg,#2dd4bf,#facc15)",
    "linear-gradient(140deg,#a855f7,#d9647f)", "linear-gradient(140deg,#6fa8dc,#b9a8ff)",
  ];
  const GAME_ART = {
    genshin: "linear-gradient(140deg,#1e40af,#6fa8dc)",
    hsr: "linear-gradient(140deg,#3b0764,#a855f7)",
    wuwa: "linear-gradient(140deg,#134e4a,#2dd4bf)",
    zzz: "linear-gradient(140deg,#422006,#facc15)",
    custom: "linear-gradient(140deg,#3b0764,#7d5cf5)",
  };
  const bannerFor = (u) => BANNERS[hashStr(u) % BANNERS.length];
  const avatarFor = (u) => AVATARS[hashStr(u + "a") % AVATARS.length];
  const gameName = (g) => (g.game === "custom" ? (g.customName || "Custom") : (GAMES[g.game] || {}).name || "Game");
  const gameShort = (g) => (g.game === "custom" ? ((g.customName || "?").trim()[0] || "?").toUpperCase() : (GAMES[g.game] || {}).mono || "GG");
  const splitChars = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);
  const ASSET = (p) => new URL(p, location.href).href;
  const LOGO_GAMES = { genshin: 1, hsr: 1, zzz: 1, wuwa: 1 };
  const gameLogo = (g) => (LOGO_GAMES[g.game] ? ASSET(`assets/games/${g.game}.png`) : "");

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
      ? `<div class="gs-chars">${chars
          .map((c) => `<span class="gs-chip">${charThumb(gme.game, c)}<span>${esc(c)}</span></span>`)
          .join("")}</div>`
      : "";
    const note = gme.note ? `<div class="gs-note">“${esc(gme.note)}”</div>` : "";
    const actions =
      mode === "profile"
        ? ""
        : `<div class="gs-card-actions">
             <button class="gs-iconbtn" data-edit="${gme.id}" title="Edit" type="button">✎</button>
             <button class="gs-iconbtn" data-del="${gme.id}" title="Remove" type="button">✕</button>
           </div>`;

    const logo = gameLogo(gme);
    const badge = logo
      ? `<img class="gs-cardlogo" src="${esc(logo)}" alt="${esc(name)}" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'gs-mono',textContent:'${esc(mono)}'}))">`
      : `<span class="gs-mono">${esc(mono)}</span>`;
    return `
    <article class="gs-card" style="--g1:${preset.g1};--g2:${preset.g2}">
      <div class="gs-banner">${badge}${actions}</div>
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
        mode === "profile" ? "This showcase is empty." : "No games yet, add your first one above.";
    }
    renderCover();
  }

  // ═══════════════════════════ cover (featured) picker ═══════════════════════════
  const coverKey = (game, name) => game + "|" + String(name).toLowerCase();

  function coverSlot(f) {
    const gold = charRank(f.game, f.name) >= 5;
    const col = gold ? "#fbbf24" : "#b9a8ff";
    const bd = gold ? "rgba(251,191,36,.55)" : "rgba(167,139,250,.4)";
    return `<div style="position:relative;aspect-ratio:3/4;border-radius:14px;overflow:hidden;border:1px solid ${bd};background:linear-gradient(160deg,#2a2444,#171226);display:flex;align-items:flex-end">
      ${charCover(f.game, f.name)}
      <div style="position:absolute;inset:0;background:linear-gradient(180deg,transparent 42%,rgba(11,10,22,.92))"></div>
      <span style="position:absolute;top:5px;left:7px;font-size:10px;letter-spacing:.5px;color:${col};text-shadow:0 0 8px currentColor">${gold ? "5★" : "4★"}</span>
      <button type="button" data-coverdel="${esc(coverKey(f.game, f.name))}" title="Remove from cover" style="position:absolute;top:5px;right:5px;width:21px;height:21px;border-radius:50%;border:none;background:rgba(0,0,0,.6);color:#fff;cursor:pointer;font-size:11px;line-height:1;display:grid;place-items:center">✕</button>
      <img src="${esc(gameLogo({ game: f.game }) || "")}" alt="" style="position:absolute;bottom:6px;right:6px;width:18px;height:18px;object-fit:contain;border-radius:5px;box-shadow:0 1px 4px rgba(0,0,0,.5)" onerror="this.remove()">
      <span style="position:relative;width:100%;padding:7px 8px;font-family:var(--font-heading);font-weight:800;font-size:11px;line-height:1.15;color:#fff;text-shadow:0 1px 4px rgba(0,0,0,.6)">${esc(f.name)}</span>
    </div>`;
  }
  const emptySlot = () =>
    `<div style="aspect-ratio:3/4;border-radius:14px;border:1.5px dashed rgba(255,255,255,.18);display:grid;place-items:center;color:rgba(244,242,248,.3);font-size:24px">+</div>`;

  function renderCover() {
    const host = $("gs-cover");
    if (!host) return;
    const avail = [];
    const seen = new Set();
    profile.games.forEach((g) =>
      splitChars(g.chars).forEach((cn) => {
        const k = coverKey(g.game, cn);
        if (seen.has(k)) return;
        seen.add(k);
        avail.push({ game: g.game, name: cn });
      })
    );
    // drop featured picks whose character no longer exists
    profile.featured = (profile.featured || []).filter((f) => seen.has(coverKey(f.game, f.name)));
    const isSel = (a) => profile.featured.some((f) => coverKey(f.game, f.name) === coverKey(a.game, a.name));
    const count = profile.featured.length;
    const full = count >= 4;

    const heading = `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px"><span style="font-family:var(--font-heading);font-weight:800;font-size:16px">Cover characters</span><span style="font-size:12.5px;color:rgba(244,242,248,.5)">Shown on your card, pick up to 4 from any game <b style="color:#a78bfa">(${count}/4)</b></span></div>`;

    if (!avail.length) {
      host.innerHTML = heading + `<p style="margin:0;font-size:13px;color:rgba(244,242,248,.5)">Add characters to your games above, then pick up to 4 here.</p>`;
      return;
    }

    const slots = profile.featured.slice(0, 4).map(coverSlot);
    while (slots.length < 4) slots.push(emptySlot());
    const preview = `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;max-width:380px;margin-bottom:18px">${slots.join("")}</div>`;

    const grid =
      `<div style="font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:rgba(244,242,248,.4);margin-bottom:9px">${full ? "Cover is full, remove one to swap" : "Tap a character to add"}</div>` +
      `<div style="display:flex;flex-wrap:wrap;gap:8px">` +
      avail
        .map((a) => {
          const sel = isSel(a);
          const dim = full && !sel;
          return `<button type="button" data-cover="${esc(coverKey(a.game, a.name))}" ${dim ? "data-dim=1" : ""} style="display:inline-flex;align-items:center;gap:7px;padding:4px 12px 4px 4px;border-radius:999px;font:inherit;font-size:12.5px;color:var(--text);cursor:${dim ? "default" : "pointer"};opacity:${dim ? ".4" : "1"};border:1px solid ${sel ? "rgba(125,92,245,.8)" : "var(--panel-brd)"};background:${sel ? "rgba(139,92,246,.22)" : "rgba(255,255,255,.02)"}">${charThumb(a.game, a.name)}<span>${esc(a.name)}</span>${sel ? '<span style="color:#a78bfa;font-weight:700">✓</span>' : ""}</button>`;
        })
        .join("") +
      `</div>`;

    host.innerHTML = heading + preview + grid;
  }

  $("gs-cover").addEventListener("click", (e) => {
    const del = e.target.closest("[data-coverdel]");
    if (del) {
      const key = del.dataset.coverdel;
      const idx = profile.featured.findIndex((f) => coverKey(f.game, f.name) === key);
      if (idx >= 0) {
        profile.featured.splice(idx, 1);
        persist();
        renderCover();
      }
      return;
    }
    const b = e.target.closest("[data-cover]");
    if (!b || b.hasAttribute("data-dim")) return;
    const key = b.dataset.cover;
    const idx = profile.featured.findIndex((f) => coverKey(f.game, f.name) === key);
    if (idx >= 0) {
      profile.featured.splice(idx, 1);
    } else {
      if (profile.featured.length >= 4) return;
      const game = key.slice(0, key.indexOf("|"));
      let name = null;
      profile.games.some((g) =>
        splitChars(g.chars).some((cn) => {
          if (coverKey(g.game, cn) === key) { name = cn; return true; }
          return false;
        })
      );
      if (!name) return;
      profile.featured.push({ game, name });
    }
    persist();
    renderCover();
  });

  // ═══════════════════════════ view state ═══════════════════════════
  let editorOpen = false;
  function renderView() {
    const loggedIn = !!user && !!username;
    const needsName = !!user && !username; // logged in but hasn't claimed a username
    if (mode === "profile") {
      $("view-explore").hidden = true;
      $("view-profile").hidden = false;
      $("gs-editor").hidden = true;
      $("gs-setupname").hidden = true;
      return;
    }
    // home / explore
    $("view-profile").hidden = true;
    $("view-explore").hidden = false;
    $("gs-setupname").hidden = !(needsName && !setupDismissed);
    $("gs-editor").hidden = !(loggedIn && editorOpen);
    $("hero-create").textContent = loggedIn ? "Edit your showcase" : user ? "Finish setup" : "Create your profile";
    if (loggedIn) {
      renderCards();
      const a = $("gs-yourlink");
      a.hidden = false;
      a.href = publicUrl(username);
      a.textContent = "· your link ↗";
    }
  }

  $("hero-create").addEventListener("click", () => {
    if (!user) return openAuth("login");
    if (!username) {
      setupDismissed = false;
      $("gs-setupname").hidden = false;
      $("gs-setup-uname").focus();
      return;
    }
    editorOpen = true;
    renderView();
    $("gs-editor").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  // Close the username modal (they can reopen it via "Finish setup").
  const dismissSetup = () => {
    setupDismissed = true;
    $("gs-setupname").hidden = true;
  };
  $("gs-setup-close").addEventListener("click", dismissSetup);
  $("gs-setupname").addEventListener("click", (e) => {
    if (e.target === $("gs-setupname")) dismissSetup(); // click on backdrop
  });

  $("gs-editclose").addEventListener("click", () => {
    editorOpen = false;
    renderView();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  $("view-profile").addEventListener("click", async (e) => {
    if (e.target.closest("[data-back]")) {
      location.href = location.pathname;
      return;
    }
    if (e.target.closest("[data-editprofile]")) {
      location.href = location.pathname + "#edit";
      return;
    }
    const likeEl = e.target.closest("[data-like]");
    if (likeEl) {
      if (!CLOUD) return;
      if (!user) return openAuth("login");
      const pid = likeEl.getAttribute("data-like");
      const wasLiked = likeEl.getAttribute("data-liked") === "1";
      likeEl.style.pointerEvents = "none";
      try {
        if (wasLiked) {
          await sb.from("profile_likes").delete().eq("profile_id", pid).eq("liker_id", user.id);
        } else {
          await sb.from("profile_likes").insert({ profile_id: pid, liker_id: user.id });
        }
      } catch (_) {}
      const now = !wasLiked;
      if (PROFILE_DATA && PROFILE_DATA.id === pid) {
        PROFILE_DATA.likes_count = Math.max(0, (PROFILE_DATA.likes_count || 0) + (now ? 1 : -1));
        PROFILE_DATA.__liked = now;
        likeEl.outerHTML = likeBtn(pid, now, PROFILE_DATA.likes_count);
      }
      return;
    }
    const cp = e.target.closest("[data-copy]");
    if (cp) {
      const val = cp.getAttribute("data-copy");
      try {
        await navigator.clipboard.writeText(val);
      } catch (_) {
        const t = document.createElement("textarea");
        t.value = val;
        document.body.appendChild(t);
        t.select();
        try { document.execCommand("copy"); } catch (_) {}
        t.remove();
      }
      const old = cp.innerHTML;
      cp.innerHTML = "✓ Copied";
      setTimeout(() => { cp.innerHTML = old; }, 1400);
    }
  });

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
      const av = $("nav-avatar");
      const url = profile.avatar || oauthAvatar(user);
      if (url) {
        av.src = url;
        av.hidden = false;
      } else {
        av.hidden = true;
      }
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
      .update({ games: gamesForDb(), display_name: profile.name, featured: profile.featured || [], updated_at: new Date().toISOString() })
      .eq("id", user.id);
    authMsg(error ? "Couldn't save, try again." : "Saved ✓", !error);
  }

  // explicit Save button (in addition to the debounced auto-save)
  $("gs-save").addEventListener("click", async () => {
    if (!(CLOUD && user && username)) return;
    const btn = $("gs-save");
    const st = $("gs-savestatus");
    clearTimeout(saveTimer); // cancel any pending debounced save
    btn.disabled = true;
    st.style.color = "rgba(244,242,248,.55)";
    st.textContent = "Saving…";
    const { error } = await sb
      .from("profiles")
      .update({ games: gamesForDb(), display_name: profile.name, featured: profile.featured || [], updated_at: new Date().toISOString() })
      .eq("id", user.id);
    if (error) {
      btn.disabled = false;
      st.style.color = "#ff8095";
      st.textContent = "Couldn't save, try again.";
      return;
    }
    st.style.color = "#6ee7b7";
    st.textContent = "Saved ✓ opening your profile…";
    // go to the public profile page
    location.href = publicUrl(username);
  });

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
    selChars = [];
    renderChips();
    closeMenu();
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
      chars: selChars.join(", "),
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
      selChars = (g.chars || "").split(",").map((s) => s.trim()).filter(Boolean);
      renderChips();
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

  // ═══════════════════════════ character picker ═══════════════════════════
  let selChars = []; // names chosen for the entry being edited
  const charchips = $("gs-charchips");
  const charinput = $("gs-charinput");
  const charmenu = $("gs-charmenu");
  const curGame = () => gameSel.value;

  function renderChips() {
    const game = curGame();
    charchips.innerHTML = selChars
      .map(
        (n, i) =>
          `<span class="gs-charchip">${charThumb(game, n)}<span class="gs-charname">${esc(n)}</span>` +
          `<button type="button" class="gs-charx" data-ci="${i}" title="Remove">✕</button></span>`
      )
      .join("");
    $("gs-chars").value = selChars.join(", ");
  }
  function addChar(name) {
    name = String(name).trim();
    if (!name) return;
    if (selChars.some((x) => x.toLowerCase() === name.toLowerCase())) return;
    selChars.push(name);
    renderChips();
  }
  function closeMenu() {
    charmenu.hidden = true;
    charmenu.innerHTML = "";
  }
  function openMenu(q) {
    const game = curGame();
    const ql = String(q).toLowerCase().trim();
    const pool = (ROSTER[game] || []).filter(
      (c) => !selChars.some((s) => s.toLowerCase() === c.name.toLowerCase())
    );
    const matches = (ql ? pool.filter((c) => c.name.toLowerCase().includes(ql)) : pool).slice(0, 30);
    let html = matches
      .map(
        (c) =>
          `<button type="button" class="gs-charopt" data-name="${esc(c.name)}">${charThumb(
            game,
            c.name
          )}<span>${esc(c.name)}</span></button>`
      )
      .join("");
    const dup = pool.some((c) => c.name.toLowerCase() === ql) ||
      selChars.some((s) => s.toLowerCase() === ql);
    if (ql && !dup) {
      html += `<button type="button" class="gs-charopt gs-charadd" data-name="${esc(q.trim())}">` +
        `<span class="gs-charini">+</span><span>Add “${esc(q.trim())}”</span></button>`;
    }
    charmenu.innerHTML = html || `<div class="gs-charempty">No matches</div>`;
    charmenu.hidden = false;
  }

  charinput.addEventListener("input", () => openMenu(charinput.value));
  charinput.addEventListener("focus", () => openMenu(charinput.value));
  charinput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const v = charinput.value.trim();
      if (v) {
        addChar(v);
        charinput.value = "";
        openMenu("");
      }
    } else if (e.key === "Escape") {
      closeMenu();
    }
  });
  charmenu.addEventListener("mousedown", (e) => {
    const opt = e.target.closest("[data-name]");
    if (!opt) return;
    e.preventDefault(); // beat the input blur
    addChar(opt.dataset.name);
    charinput.value = "";
    openMenu("");
  });
  charchips.addEventListener("click", (e) => {
    const x = e.target.closest("[data-ci]");
    if (!x) return;
    selChars.splice(+x.dataset.ci, 1);
    renderChips();
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".gs-charpick")) closeMenu();
  });
  gameSel.addEventListener("change", () => {
    renderChips(); // portraits depend on the game
    if (!charmenu.hidden) openMenu(charinput.value);
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
    authErr(error ? error.message : "✉️ Password reset link sent, check your email.", !error);
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
      status.textContent = data ? "✗ Taken, try another" : "✓ Available";
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
        if (taken) return authErr("That username is taken, try another.");

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
          authMsg("✉️ Account created, check your email to confirm, then log in.", true);
        }
      }
    } finally {
      $("am-submit").disabled = false;
    }
  });

  // Continue with Google → OAuth redirect; the session is picked up on return.
  $("am-google").addEventListener("click", async () => {
    authErr("");
    const { error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: location.origin + location.pathname },
    });
    if (error) authErr(error.message);
  });

  $("nav-logout").addEventListener("click", async () => {
    await sb.auth.signOut();
  });

  // ═══════════════════════════ claim username (logged in, none yet) ═══════════════════════════
  function setupStatus(text, cls) {
    const el = $("gs-setup-status");
    if (!text) return (el.hidden = true);
    el.hidden = false;
    el.className = "gs-uname-status " + (cls || "dim");
    el.textContent = text;
  }

  let setupCheck = null;
  $("gs-setup-uname").addEventListener("input", (e) => {
    const v = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "");
    e.target.value = v;
    clearTimeout(setupCheck);
    if (!v) return setupStatus("");
    if (!/^[a-z0-9_]{3,20}$/.test(v)) return setupStatus("3–20 chars: a–z, 0–9, _", "dim");
    setupStatus("Checking…", "dim");
    setupCheck = setTimeout(async () => {
      const { data } = await sb.from("profiles").select("username").eq("username", v).maybeSingle();
      if ($("gs-setup-uname").value.trim().toLowerCase() !== v) return;
      setupStatus(data ? "✗ Taken, try another" : "✓ Available", data ? "taken" : "ok");
    }, 400);
  });

  $("gs-setupform").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!user) return;
    const v = $("gs-setup-uname").value.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(v))
      return setupStatus("Username: 3–20 chars, a–z, 0–9 or _", "taken");
    $("gs-setup-save").disabled = true;
    try {
      const { data: taken } = await sb
        .from("profiles").select("username").eq("username", v).maybeSingle();
      if (taken) return setupStatus("✗ Taken, try another", "taken");
      // create-or-update this user's profile row with the chosen username
      const avatar = oauthAvatar(user);
      const { error } = await sb.from("profiles").upsert({
        id: user.id,
        username: v,
        display_name: profile.name || "",
        avatar_url: avatar || null,
        games: gamesForDb(),
        updated_at: new Date().toISOString(),
      });
      if (error) return setupStatus(error.message, "taken");
      username = v;
      profile.avatar = avatar || "";
      setupStatus("");
      $("gs-setup-uname").value = "";
      updateNav();
      renderView();
      authMsg("Username set ✓, build your showcase below.", true);
    } finally {
      $("gs-setup-save").disabled = false;
    }
  });

  // ═══════════════════════════ auth lifecycle ═══════════════════════════
  async function loadOwnProfile() {
    const { data } = await sb
      .from("profiles")
      .select("username, display_name, games, featured, avatar_url")
      .eq("id", user.id)
      .maybeSingle();
    if (data) {
      username = data.username;
      // Keep the stored avatar in sync with the current Google picture.
      const ga = oauthAvatar(user);
      let avatar = data.avatar_url || "";
      if (ga && ga !== avatar) {
        avatar = ga;
        sb.from("profiles").update({ avatar_url: ga }).eq("id", user.id); // fire-and-forget
      }
      profile = {
        name: data.display_name || "",
        games: withIds(data.games),
        featured: Array.isArray(data.featured) ? data.featured : [],
        avatar,
      };
      $("gs-name").value = profile.name;
    } else {
      username = null; // trigger may not have run yet, or account without username
      // New OAuth user with no profile row yet — seed friendly defaults from
      // their Google account so setup is one click, not a blank form.
      const m = (user && user.user_metadata) || {};
      profile = {
        name: m.full_name || m.name || profile.name || "",
        games: [],
        featured: [],
        avatar: oauthAvatar(user),
      };
      $("gs-name").value = profile.name;
    }
  }

  // Turn a Google name/email into a valid username suggestion, then find the
  // first free variant (base, base2, base3…) and pre-fill the setup box.
  async function suggestUsername() {
    const input = $("gs-setup-uname");
    if (!input || input.value.trim()) return; // never clobber what the user typed
    const m = (user && user.user_metadata) || {};
    const raw = m.full_name || m.name || (user.email || "").split("@")[0] || "";
    let base = raw.toLowerCase().replace(/[^a-z0-9_]+/g, "").slice(0, 20);
    if (base.length < 3) base = (base + "otaku").slice(0, 20); // pad short/empty
    let candidate = base;
    for (let i = 0; i < 12; i++) {
      const { data } = await sb.from("profiles").select("username").eq("username", candidate).maybeSingle();
      if (!data) break; // free
      const suffix = String(i + 2);
      candidate = base.slice(0, 20 - suffix.length) + suffix;
    }
    if (input.value.trim()) return; // user started typing while we were checking
    input.value = candidate;
    setupStatus("✓ Available", "ok");
  }

  async function onSignedIn(u) {
    user = u;
    await loadOwnProfile();
    authMsg("");
    updateNav();
    if (!username) suggestUsername(); // pre-fill a friendly username to claim
    if (mode === "home") {
      renderView();
      if (!username && !setupDismissed) setTimeout(() => $("gs-setup-uname").focus(), 60);
      if (wantEdit && username) {
        wantEdit = false;
        editorOpen = true;
        renderView();
        setTimeout(() => $("gs-editor").scrollIntoView({ behavior: "smooth", block: "start" }), 60);
      }
    } else if (mode === "profile" && PROFILE_DATA) {
      renderProfileView();
    }
  }
  function onSignedOut() {
    user = null;
    username = null;
    editorOpen = false;
    profile = { name: "", games: [], featured: [], avatar: "" };
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

  // ═══════════════════════════ explore gallery ═══════════════════════════
  let GALLERY = [];
  let PROFILE_DATA = null; // last-loaded single profile (for re-render after roster loads)
  let filterGame = "all";
  let filterQuery = "";

  function profileCardHtml(p) {
    const games = Array.isArray(p.games) ? p.games : [];
    const uname = p.username || "";
    const name = p.display_name ? esc(p.display_name) : "@" + esc(uname);
    const inits = esc(initials(p.display_name || uname));
    let feat;
    if (Array.isArray(p.featured) && p.featured.length) {
      feat = p.featured.slice(0, 4).map((f) => ({ game: f.game, name: f.name, r: charRank(f.game, f.name) }));
    } else {
      const flat = [];
      games.forEach((g) => splitChars(g.chars).forEach((cn) => flat.push({ game: g.game, name: cn, r: charRank(g.game, cn) })));
      feat = flat.sort((a, b) => b.r - a.r).slice(0, 4);
    }
    const tiles = feat
      .map((c) => {
        const gold = c.r >= 5;
        const col = gold ? "#fbbf24" : "#b9a8ff";
        const bd = gold ? "rgba(251,191,36,.55)" : "rgba(167,139,250,.4)";
        const img = charImg(c.game, c.name);
        const fill = img
          ? `<img src="${esc(img)}" alt="${esc(c.name)}" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">`
          : `<span style="position:relative;font-family:var(--font-heading);font-weight:800;font-size:16px;color:#fff">${esc(initials(c.name))}</span>`;
        return `<div style="position:relative;flex:1;aspect-ratio:3/4;border-radius:12px;overflow:hidden;background:linear-gradient(160deg,#2a2444,#171226);display:flex;align-items:center;justify-content:center;border:1px solid ${bd}" title="${esc(c.name)}">${fill}<span style="position:absolute;bottom:2px;right:3px;font-size:9px;color:${col}">${gold ? "5★" : "4★"}</span></div>`;
      })
      .join("");
    const tags = games
      .map((g) => {
        const l = gameLogo(g);
        const ic = l ? `<img src="${esc(l)}" alt="" style="width:15px;height:15px;object-fit:contain;border-radius:4px" onerror="this.remove()">` : "";
        return `<span style="display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;letter-spacing:.05em;padding:5px 11px;border-radius:999px;border:1px solid rgba(125,92,245,.4);background:rgba(125,92,245,.13);color:#b9a8ff">${ic}${esc(gameName(g))}</span>`;
      })
      .join("");
    const rankLine = games.map((g) => `${gameShort(g)} ${esc(g.rank || "")}`.trim()).join(" · ");
    return `
    <a href="?u=${enc(uname)}" class="gs-profcard" style="display:block;text-decoration:none;color:inherit;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.08);border-radius:24px;overflow:hidden;transition:border-color .2s,transform .2s">
      <div style="height:74px;background:${bannerFor(uname)};position:relative"><div style="position:absolute;inset:0;background:linear-gradient(180deg,transparent,rgba(11,10,22,.65))"></div></div>
      <div style="padding:0 18px 18px;margin-top:-26px;position:relative">
        <div style="display:flex;align-items:flex-end;gap:12px;margin-bottom:14px">
          ${avatarCircle(p.avatar_url, inits, avatarFor(uname), 56, 18, 2)}
          <div style="padding-bottom:3px;min-width:0">
            <div style="font-family:var(--font-heading);font-weight:800;font-size:16.5px;letter-spacing:-.02em">${name}</div>
            <div style="font-size:12px;color:rgba(244,242,248,.5)">@${esc(uname)} · ${games.length} game${games.length === 1 ? "" : "s"}</div>
          </div>
        </div>
        ${tags ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">${tags}</div>` : ""}
        ${tiles ? `<div style="display:flex;gap:8px;margin-bottom:12px">${tiles}</div>` : ""}
        <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid rgba(255,255,255,.075);padding-top:11px;font-size:12px">
          <span style="display:inline-flex;align-items:center;gap:5px;color:rgba(255,157,176,.9)">❤ ${p.likes_count || 0}</span>
          <span style="font-weight:600;color:#b9a8ff">View profile →</span>
        </div>
      </div>
    </a>`;
  }

  function renderTabs() {
    const defs = [{ k: "all", label: "All games" }, { k: "wuwa" }, { k: "hsr" }, { k: "zzz" }, { k: "genshin" }];
    $("gs-tabs").innerHTML = defs
      .map((d) => {
        const active = filterGame === d.k;
        const label = d.label || GAMES[d.k].name;
        return `<button type="button" data-game="${d.k}" style="font-family:var(--font-heading);font-weight:800;font-size:13px;letter-spacing:.02em;padding:11px 17px;border-radius:999px;white-space:nowrap;cursor:pointer;border:1px solid ${active ? "rgba(125,92,245,.55)" : "transparent"};background:${active ? "rgba(125,92,245,.22)" : "rgba(255,255,255,.03)"};color:${active ? "#efe9ff" : "rgba(244,242,248,.6)"}">${esc(label)}</button>`;
      })
      .join("");
  }

  function renderGallery() {
    const wrap = $("gallery");
    const empty = $("gallery-empty");
    const q = filterQuery.trim().toLowerCase();
    const list = GALLERY.filter((p) => {
      const games = Array.isArray(p.games) ? p.games : [];
      if (filterGame !== "all" && !games.some((g) => g.game === filterGame)) return false;
      if (!q) return true;
      return (
        (p.username || "").toLowerCase().includes(q) ||
        (p.display_name || "").toLowerCase().includes(q) ||
        games.some((g) => gameName(g).toLowerCase().includes(q) || String(g.chars || "").toLowerCase().includes(q))
      );
    });
    if (!list.length) {
      wrap.innerHTML = "";
      empty.hidden = false;
      empty.querySelector("h3").textContent = GALLERY.length ? "No profiles match that" : "No profiles yet";
      empty.querySelector("p").textContent = GALLERY.length
        ? "Try another game filter, or a different name."
        : "Be the first, log in and build your showcase.";
      return;
    }
    empty.hidden = true;
    wrap.innerHTML = list.map(profileCardHtml).join("");
  }

  $("gs-tabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-game]");
    if (!b) return;
    filterGame = b.dataset.game;
    renderTabs();
    renderGallery();
  });
  $("gs-search").addEventListener("input", (e) => {
    filterQuery = e.target.value;
    renderGallery();
  });

  async function loadGallery() {
    renderTabs();
    if (!CLOUD) {
      $("hero-stats").textContent = "Cloud not configured";
      renderGallery();
      return;
    }
    const { data, error } = await sb
      .from("profiles")
      .select("username, display_name, games, likes_count, featured, avatar_url")
      .order("updated_at", { ascending: false })
      .limit(60);
    GALLERY = error || !data ? [] : data;
    $("hero-stats").textContent = `${GALLERY.length} profile${GALLERY.length === 1 ? "" : "s"} · 4 games supported`;
    renderGallery();
  }

  // ═══════════════════════════ single profile view ═══════════════════════════
  const stat = (v, l) =>
    `<div><div style="font-family:var(--font-heading);font-weight:800;font-size:24px">${esc(String(v))}</div><div style="font-size:11px;letter-spacing:.11em;text-transform:uppercase;color:rgba(244,242,248,.5)">${esc(l)}</div></div>`;

  function charCardHtml(game, name) {
    const gold = charRank(game, name) >= 5;
    const starColor = gold ? "#fbbf24" : "#b9a8ff";
    const stars = gold ? "★★★★★" : "★★★★";
    const bd = gold ? "rgba(251,191,36,.45)" : "rgba(167,139,250,.35)";
    return `
    <div style="background:rgba(255,255,255,.045);border-radius:20px;overflow:hidden;border:1px solid ${bd}">
      <div style="position:relative;aspect-ratio:3/4;overflow:hidden;display:flex;flex-direction:column;background:linear-gradient(160deg,#2a2444,#171226)">
        ${charCover(game, name)}
        <div style="position:absolute;inset:0;background:linear-gradient(180deg,transparent 40%,rgba(11,10,22,.9))"></div>
        <span style="position:absolute;top:8px;left:9px;font-size:11px;letter-spacing:1px;color:${starColor};text-shadow:0 0 10px currentColor">${stars}</span>
        <span style="position:relative;margin-top:auto;width:100%;font-family:var(--font-heading);font-weight:800;font-size:15px;letter-spacing:-.02em;line-height:1.15;padding:10px;color:#fff">${esc(name)}</span>
      </div>
    </div>`;
  }

  function gameSectionHtml(g) {
    const chars = splitChars(g.chars);
    const cards = chars.map((cn) => charCardHtml(g.game, cn)).join("") ||
      `<div style="color:rgba(244,242,248,.4);font-size:13px">No characters listed.</div>`;
    const logo = gameLogo(g);
    const badge = logo
      ? `<img src="${esc(logo)}" alt="" style="width:60px;height:60px;object-fit:contain;border-radius:16px;flex:none" onerror="this.replaceWith(Object.assign(document.createElement('div'),{textContent:'${esc(gameShort(g))}',className:'gs-gamebadge-fb'}))">`
      : `<div class="gs-gamebadge-fb">${esc(gameShort(g))}</div>`;
    const uidPart = g.uid
      ? `<span style="display:inline-flex;align-items:center;gap:7px">UID <b style="color:var(--color-text);font-weight:600">${esc(g.uid)}</b>` +
        `<button type="button" data-copy="${esc(g.uid)}" title="Copy UID for friend requests" style="display:inline-flex;align-items:center;gap:5px;font:inherit;font-size:11px;font-weight:700;padding:4px 10px;border-radius:999px;border:1px solid rgba(125,92,245,.5);background:rgba(125,92,245,.14);color:#b9a8ff;cursor:pointer">⧉ Copy</button></span>`
      : "";
    const ignPart = g.ign ? `<span>${esc(g.ign)}</span>` : "";
    const subHtml =
      uidPart || ignPart
        ? `<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:12.5px;color:rgba(244,242,248,.55);margin-top:6px">${uidPart}${ignPart}</div>`
        : "";
    return `
    <section style="padding:44px 0;border-bottom:1px solid rgba(255,255,255,.075)">
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:26px">
        ${badge}
        <div>
          <h2 style="font-family:var(--font-heading);font-weight:800;font-size:25px;letter-spacing:-.025em;margin:0">${esc(gameName(g))}</h2>
          ${subHtml}
        </div>
        ${g.rank ? `<div style="margin-left:auto"><span style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:7px 13px;border-radius:999px;border:1px solid rgba(125,92,245,.5);background:rgba(125,92,245,.14);color:#b9a8ff">${esc(g.rank)}</span></div>` : ""}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:16px">${cards}</div>
    </section>`;
  }

  function likeBtn(pid, liked, count) {
    return `<button type="button" data-like="${esc(pid)}" data-liked="${liked ? 1 : 0}" style="display:inline-flex;align-items:center;gap:8px;font-family:var(--font-heading);font-weight:800;font-size:14px;padding:11px 20px;border-radius:999px;cursor:pointer;transition:transform .12s;border:1px solid ${liked ? "rgba(217,100,127,.7)" : "var(--color-divider)"};background:${liked ? "rgba(217,100,127,.18)" : "transparent"};color:${liked ? "#ff9db0" : "var(--color-text)"}"><span style="font-size:15px">${liked ? "❤" : "🤍"}</span><span data-likecount>${count || 0}</span></button>`;
  }
  const likePill = (count) =>
    `<span style="display:inline-flex;align-items:center;gap:8px;font-family:var(--font-heading);font-weight:800;font-size:14px;padding:11px 20px;border-radius:999px;border:1px solid var(--color-divider);color:rgba(244,242,248,.7)"><span style="font-size:15px">❤</span>${count || 0} like${(count || 0) === 1 ? "" : "s"}</span>`;

  function profileViewHtml(p) {
    const uname = p.username || "";
    const name = p.display_name || "@" + uname;
    const games = Array.isArray(p.games) ? p.games : [];
    const inits = esc(initials(p.display_name || uname));
    const editBtn = `<button type="button" data-editprofile="1" style="display:inline-flex;align-items:center;gap:8px;font-family:var(--font-heading);font-weight:800;font-size:14px;padding:11px 20px;border-radius:999px;cursor:pointer;border:none;background:#7d5cf5;color:#fff">✎ Edit showcase</button>`;
    const likeControl = p.__own ? `${likePill(p.likes_count)}${editBtn}` : likeBtn(p.id, p.__liked, p.likes_count);
    const fiveCount = games.reduce((n, g) => n + splitChars(g.chars).filter((cn) => charRank(g.game, cn) >= 5).length, 0);
    const charCount = games.reduce((n, g) => n + splitChars(g.chars).length, 0);
    const bio = games.map((g) => g.note).filter(Boolean)[0] || "";
    const gamesHtml = games.map(gameSectionHtml).join("") ||
      `<div style="padding:60px 0;text-align:center;color:rgba(244,242,248,.5)">This showcase is empty.</div>`;
    return `
    <section style="position:relative;border-bottom:1px solid rgba(255,255,255,.075)">
      <div style="height:230px;background:${bannerFor(uname)};position:relative">
        <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(11,10,22,.25),rgba(11,10,22,.95))"></div>
        <div style="position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px);background-size:60px 60px"></div>
        <div style="position:relative;max-width:1320px;margin:0 auto;padding:20px 28px">
          <button data-back="1" style="font-family:var(--font-heading);font-size:13px;font-weight:700;background:rgba(11,10,22,.6);border:1px solid rgba(255,255,255,.12);border-radius:999px;color:var(--color-text);padding:9px 16px;cursor:pointer;backdrop-filter:blur(8px)">← All profiles</button>
        </div>
      </div>
      <div style="max-width:1320px;margin:0 auto;padding:0 28px 34px">
        <div style="position:relative;z-index:1;display:flex;gap:22px;align-items:flex-end;margin-top:-58px;flex-wrap:wrap">
          ${avatarCircle(p.avatar_url, inits, avatarFor(uname), 118, 38, 3)}
          <div style="flex:1;min-width:260px;padding-bottom:6px">
            <h1 style="font-family:var(--font-heading);font-weight:800;font-size:clamp(28px,3.4vw,40px);letter-spacing:-.035em;margin:0 0 8px">${esc(name)}</h1>
            <p style="margin:0;font-size:15px;color:rgba(244,242,248,.62);max-width:60ch">${bio ? esc(bio) : "@" + esc(uname)}</p>
          </div>
          <div style="display:flex;gap:10px;padding-bottom:8px">${likeControl}</div>
        </div>
        <div style="display:flex;gap:34px;margin-top:26px;padding-top:20px;border-top:1px solid rgba(255,255,255,.075);flex-wrap:wrap">
          ${stat(games.length, "Games")}${stat(fiveCount, "5★ owned")}${stat(charCount, "Characters")}${stat("@" + uname, "Handle")}
        </div>
      </div>
    </section>
    <div style="max-width:1320px;margin:0 auto;padding:10px 28px 80px">${gamesHtml}</div>`;
  }

  const notFoundHtml = (msg) =>
    `<div style="max-width:1320px;margin:0 auto;padding:80px 28px;text-align:center">
      <h1 style="font-family:var(--font-heading);font-weight:800;font-size:26px;margin:0 0 10px">Showcase not found</h1>
      <p style="color:rgba(244,242,248,.55);margin:0 0 20px">${msg}</p>
      <a href="${location.pathname}" style="color:#b9a8ff;font-weight:600">← All profiles</a></div>`;

  // resolve the current viewer's liked-state, then render the profile
  async function renderProfileView() {
    const host = $("view-profile");
    const d = PROFILE_DATA;
    if (!d) return;
    d.__own = !!(user && d.id && user.id === d.id);
    d.__liked = false;
    if (CLOUD && user && d.id && !d.__own) {
      const { data: mine } = await sb
        .from("profile_likes")
        .select("liker_id")
        .eq("profile_id", d.id)
        .eq("liker_id", user.id)
        .maybeSingle();
      d.__liked = !!mine;
    }
    host.innerHTML = profileViewHtml(d);
  }

  async function loadProfile(u) {
    mode = "profile";
    renderView();
    const host = $("view-profile");
    if (!CLOUD) return (host.innerHTML = notFoundHtml("Cloud accounts aren't configured yet."));
    const { data, error } = await sb
      .from("profiles")
      .select("id, username, display_name, games, likes_count, avatar_url")
      .eq("username", u)
      .maybeSingle();
    if (error || !data) return (host.innerHTML = notFoundHtml(`No showcase found for “${esc(u)}”.`));
    PROFILE_DATA = data;
    renderProfileView();
  }

  // ═══════════════════════════ init ═══════════════════════════
  const params = new URLSearchParams(location.search);
  const viewUser = params.get("u");
  wantEdit = location.hash === "#edit";

  // characters render with initials first, then swap to portraits once loaded
  loadRoster().then(() => {
    renderChips();
    renderCards();
    if (GALLERY.length) renderGallery();
    if (mode === "profile" && PROFILE_DATA) renderProfileView();
  });

  // dev helper — load sample entries into YOUR logged-in showcase for testing.
  // In the console:  gsLoadSample()   or   gsLoadSample(1)  for another sample.
  window.gsLoadSample = async (i = 0) => {
    if (!(user && username)) return console.warn("Log in and pick a username first.");
    const url = new URL("data/sample-showcases.json", location.href).href;
    const { profiles } = await (await fetch(url)).json();
    const p = profiles[i] || profiles[0];
    profile.games = withIds(p.games);
    renderCards();
    persist();
    console.log(`Loaded ${p.games.length} entries from "${p.username}", saving to your profile…`);
  };

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
