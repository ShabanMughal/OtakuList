// OtakuList — installable app (PWA) support.
//
// 1. Registers the service worker (public/sw.js) so the installed app opens
//    offline.
// 2. Shows a one-time "install the app" tip — on PHONES ONLY. Desktop visitors
//    never see it, and neither does anyone already using the installed app.
//      • Android: a real Install button (Chrome's beforeinstallprompt), or the
//        menu steps when the browser doesn't offer that event.
//      • iPhone/iPad: there is no install prompt on iOS, so the tip spells out
//        Share → Add to Home Screen for the browser you're in.
(function () {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }

  const ua = navigator.userAgent || "";
  // iPadOS reports itself as a Mac; the touch screen gives it away.
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  if (!isIOS && !isAndroid) return; // desktop: no tip, ever

  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  if (standalone) return; // already running as the installed app

  const DISMISS_KEY = "otakulist-install-dismissed";
  const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000; // ask again after a month
  const store = {
    get() {
      try {
        return Number(localStorage.getItem(DISMISS_KEY)) || 0;
      } catch {
        return 0;
      }
    },
    set() {
      try {
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
      } catch {
        // private mode — the tip simply returns next visit
      }
    },
  };
  if (Date.now() - store.get() < SNOOZE_MS) return;

  // Don't cover the page the moment it opens.
  const SHOW_DELAY_MS = 2500;

  // SVGs for the steps, so "the Share icon" is unambiguous.
  const SHARE_ICON =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-label="Share"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';
  const DOTS_ICON = '<b aria-label="menu">⋮</b>';

  function iosSteps() {
    // iOS < 16.4 only lets Safari add web apps to the home screen.
    const m = ua.match(/OS (\d+)_(\d+)/);
    const major = m ? +m[1] : 99;
    const minor = m ? +m[2] : 99;
    const modern = major > 16 || (major === 16 && minor >= 4);
    if (/CriOS/.test(ua)) {
      return modern
        ? `Tap ${SHARE_ICON} in the address bar, then <b>Add to Home Screen</b>.`
        : `Open this page in <b>Safari</b>, tap ${SHARE_ICON}, then <b>Add to Home Screen</b>.`;
    }
    if (/FxiOS|EdgiOS|OPiOS/.test(ua)) {
      return modern
        ? `Open the browser menu, tap <b>Share</b> ${SHARE_ICON}, then <b>Add to Home Screen</b>.`
        : `Open this page in <b>Safari</b>, tap ${SHARE_ICON}, then <b>Add to Home Screen</b>.`;
    }
    return `Tap ${SHARE_ICON} at the bottom of Safari, then <b>Add to Home Screen</b>.`;
  }

  function injectStyles() {
    if (document.getElementById("ol-install-css")) return;
    const s = document.createElement("style");
    s.id = "ol-install-css";
    // Self-contained: the home page doesn't load global.css.
    s.textContent = `
      .ol-install{position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:120;
        display:flex;gap:12px;align-items:flex-start;padding:14px;border-radius:18px;
        background:#1a1630;border:1px solid rgba(255,255,255,.12);box-shadow:0 18px 48px rgba(0,0,0,.6);
        color:#f4f2f8;font:14px/1.4 'Poppins',system-ui,sans-serif;animation:ol-install-in .25s ease-out;}
      @keyframes ol-install-in{from{opacity:0;transform:translateY(16px)}}
      .ol-install img{width:46px;height:46px;border-radius:12px;flex:none;}
      .ol-install-body{flex:1;min-width:0;}
      .ol-install-title{font-weight:700;font-size:15px;margin:0 0 3px;}
      .ol-install-text{margin:0;color:rgba(244,242,248,.72);font-size:13px;}
      .ol-install-text svg{vertical-align:-2px;color:#a78bfa;}
      .ol-install-text b{color:#f4f2f8;}
      .ol-install-actions{display:flex;gap:8px;margin-top:10px;}
      .ol-install-btn{border:0;border-radius:999px;padding:9px 18px;font:700 13px 'Poppins',system-ui,sans-serif;
        background:#7d5cf5;color:#fff;cursor:pointer;}
      .ol-install-x{position:absolute;top:8px;right:10px;border:0;background:none;color:rgba(244,242,248,.5);
        font-size:20px;line-height:1;padding:4px;cursor:pointer;}
    `;
    document.head.appendChild(s);
  }

  let shown = null;
  function show({ text, onInstall }) {
    if (shown) shown.remove();
    injectStyles();
    const el = document.createElement("div");
    el.className = "ol-install";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "Install OtakuList");
    el.innerHTML = `
      <img src="/icons/icon-192.png" alt="">
      <div class="ol-install-body">
        <p class="ol-install-title">Get the OtakuList app</p>
        <p class="ol-install-text">${text}</p>
        ${onInstall ? '<div class="ol-install-actions"><button type="button" class="ol-install-btn">Install app</button></div>' : ""}
      </div>
      <button type="button" class="ol-install-x" aria-label="Not now">×</button>`;
    el.querySelector(".ol-install-x").addEventListener("click", () => {
      store.set();
      el.remove();
    });
    if (onInstall) el.querySelector(".ol-install-btn").addEventListener("click", onInstall);
    document.body.appendChild(el);
    shown = el;
  }

  if (isIOS) {
    setTimeout(
      () =>
        show({
          text: `Add it to your home screen for a full-screen app that works offline. ${iosSteps()} Then log in to bring your list along.`,
        }),
      SHOW_DELAY_MS
    );
    return;
  }

  // Android. Chrome, Edge and Samsung Internet fire beforeinstallprompt when
  // the site is installable; hold on to it and offer our own button instead
  // of the browser's mini-infobar.
  let deferred = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
  });
  window.addEventListener("appinstalled", () => {
    store.set();
    if (shown) shown.remove();
  });

  setTimeout(() => {
    if (deferred) {
      show({
        text: "Install it for a full-screen app that works offline — and share any episode or chapter straight to your list.",
        onInstall: async () => {
          const prompt = deferred;
          deferred = null;
          prompt.prompt();
          const { outcome } = await prompt.userChoice.catch(() => ({ outcome: "dismissed" }));
          if (outcome === "accepted") store.set();
          if (shown) shown.remove();
        },
      });
    } else {
      // Firefox and friends: no install event, but their menu can do it.
      show({
        text: `Tap ${DOTS_ICON} in the browser menu, then <b>Install app</b> or <b>Add to Home screen</b>.`,
      });
    }
  }, SHOW_DELAY_MS);
})();
