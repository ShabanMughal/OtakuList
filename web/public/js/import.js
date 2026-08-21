// OtakuList import tool, parse a rough pasted watchlist into a clean,
// importable file. Output matches the extension's Export/Import format.
(function () {
  const STATUS_LABELS = {
    watching: "Watching",
    plan: "Plan to Watch",
    completed: "Completed",
    onhold: "On Hold",
  };

  const $ = (id) => document.getElementById(id);
  const rawBox = $("raw");
  const previewEl = $("preview");
  const rowsEl = $("pv-rows");
  const countEl = $("pv-count");
  const noteEl = $("tool-note");

  let rows = []; // [{ key, title, status, currentEpisode, totalEpisodes, rating }]
  let keySeq = 1;

  // ── "Generate with ChatGPT", prefill a prompt that outputs our format ──
  const GPT_PROMPT = [
    "You are helping me build my anime watchlist for the OtakuList browser extension.",
    "",
    "I'll tell you which anime I'm watching, plan to watch, have completed, or put on hold (with my episode number or rating when I mention them).",
    "For EACH title, research accurate data (use web search if it's available to you) and fill in:",
    "the correct TOTAL number of episodes for that season, the real title, and a working cover image URL.",
    "",
    "Reply with ONLY a JSON array inside a ```json code block. Each item must be exactly:",
    '{ "title": "", "status": "watching", "currentEpisode": 0, "totalEpisodes": 0, "rating": 0, "cover": "https://...jpg" }',
    "",
    "Rules:",
    "- status must be exactly one of: watching, plan, completed, onhold",
    "- totalEpisodes: the REAL episode count for that anime/season, look it up. Use null only if it truly has no fixed count (e.g. long-running ongoing series).",
    "- currentEpisode: the episode I told you; if I said 'completed', set it equal to totalEpisodes; otherwise null.",
    "- rating: a number 0–5 (convert an x/10 score to a 0–5 scale, rounded). Use 0 if I didn't rate it.",
    "- cover: a direct, working image URL ending in .jpg/.jpeg/.png/.webp, preferably from cdn.myanimelist.net. Use null if unsure.",
    "- Output ONLY the JSON code block, no text before it.",
    "",
    "Example:",
    "```json",
    "[",
    '  { "title": "Jujutsu Kaisen", "status": "watching", "currentEpisode": 12, "totalEpisodes": 24, "rating": 0, "cover": "https://cdn.myanimelist.net/images/anime/1171/109222.jpg" },',
    '  { "title": "Frieren", "status": "completed", "currentEpisode": 28, "totalEpisodes": 28, "rating": 5, "cover": "https://cdn.myanimelist.net/images/anime/1015/138006.jpg" }',
    "]",
    "```",
    "",
    "After the code block, remind me to copy the JSON into the OtakuList import tool and click Convert.",
  ].join("\n");

  const gptBtn = $("btn-gpt");
  if (gptBtn) gptBtn.href = "https://chatgpt.com/?q=" + encodeURIComponent(GPT_PROMPT);

  const slug = (t) =>
    t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );

  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  // map any status wording GPT/back­ups might use → our 4 keys
  function normalizeStatus(s) {
    const k = String(s || "").toLowerCase().replace(/[\s_-]/g, "");
    if (/(complete|finish|done|watched|seen)/.test(k)) return "completed";
    if (/(plan|ptw|towatch|wishlist|backlog)/.test(k)) return "plan";
    if (/(onhold|hold|paus|stall)/.test(k)) return "onhold";
    if (/(drop|abandon)/.test(k)) return "onhold";
    return "watching";
  }

  // accept a pasted JSON array / OtakuList backup (e.g. ChatGPT's output)
  function tryParseJson(text) {
    let t = text.trim();
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) t = fence[1].trim();
    if (!(t.startsWith("[") || t.startsWith("{"))) {
      // grab the first {...} or [...] block out of surrounding chatter
      const a = t.indexOf("["), b = t.indexOf("{");
      let i = a < 0 ? b : b < 0 ? a : Math.min(a, b);
      if (i < 0) return null;
      const close = t[i] === "[" ? "]" : "}";
      const j = t.lastIndexOf(close);
      if (j < i) return null;
      t = t.slice(i, j + 1);
    }
    let data;
    try {
      data = JSON.parse(t);
    } catch {
      return null;
    }
    let arr = null;
    if (Array.isArray(data)) arr = data;
    else if (data && data.list && typeof data.list === "object") arr = Object.values(data.list);
    else if (data && typeof data === "object") arr = Object.values(data);
    if (!arr) return null;
    const out = arr
      .filter((a) => a && typeof a === "object" && a.title)
      .map((a) => ({
        key: keySeq++,
        title: String(a.title),
        status: normalizeStatus(a.status),
        currentEpisode: a.currentEpisode ?? null,
        totalEpisodes: a.totalEpisodes ?? null,
        rating: clamp(parseInt(a.rating, 10) || 0, 0, 5),
        cover: a.cover || null,
      }));
    return out.length ? out : null;
  }

  // ── the parser: turn one messy line into a structured entry ────────
  function parseLine(raw) {
    let work = (raw || "").trim();
    if (!work) return null;
    // strip leading bullets / numbering:  "1. ", "- ", "* ", "• "
    work = work.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "");
    if (!work) return null;

    // ── cover image URL (pull it out FIRST, a URL's own /numbers would
    //    otherwise be mistaken for episode counts) ──
    let cover = null;
    const urlM = work.match(/https?:\/\/\S+/i);
    if (urlM) {
      cover = urlM[0].replace(/[)\].,;'"]+$/, ""); // trim trailing punctuation
      work = work.replace(urlM[0], " ");
    }

    // ── status (detect a keyword anywhere, then remove it) ──
    let status = null;
    const statusRules = [
      [/\b(completed|complete|finished|finish|done|watched|seen|rewatched)\b/i, "completed"],
      [/\b(plan(?:ned)?(?:\s*to\s*watch)?|ptw|to\s*watch|want\s*to\s*watch|wishlist|backlog)\b/i, "plan"],
      [/\b(on[\s-]?hold|hold|paused?|stalled)\b/i, "onhold"],
      [/\b(dropped|abandoned)\b/i, "onhold"], // extension has no "Dropped"
      [/\b(watching|currently|current|ongoing|in\s*progress)\b/i, "watching"],
    ];
    for (const [re, val] of statusRules) {
      if (re.test(work)) {
        status = val;
        work = work.replace(re, " ");
        break;
      }
    }

    // ── rating ──
    let rating = 0;
    const starM = work.match(/★+/);
    if (starM) {
      rating = clamp(starM[0].length, 0, 5);
      work = work.replace(/★+/g, " ");
    }
    let rm = work.match(/\b(\d{1,2})\s*\/\s*(10|5)\b/); // 9/10 or 4/5
    if (rm) {
      const num = parseInt(rm[1], 10);
      rating = rm[2] === "10" ? Math.round(num / 2) : num;
      rating = clamp(rating, 0, 5);
      work = work.replace(rm[0], " ");
    } else {
      rm = work.match(/\b(?:rating|score|rated)\s*:?\s*(\d{1,2})\b/i);
      if (rm) {
        let n = parseInt(rm[1], 10);
        rating = clamp(n > 5 ? Math.round(n / 2) : n, 0, 5);
        work = work.replace(rm[0], " ");
      }
    }

    // ── episodes ──
    let currentEpisode = null;
    let totalEpisodes = null;
    let em = work.match(/\b(\d{1,4})\s*\/\s*(\d{1,4})\b/); // 12/24
    if (em) {
      currentEpisode = parseInt(em[1], 10);
      totalEpisodes = parseInt(em[2], 10);
      work = work.replace(em[0], " ");
    } else {
      em = work.match(/\b(?:ep(?:isode)?)\s*\.?\s*#?\s*(\d{1,4})\b/i); // ep 12 / episode 12
      if (!em) em = work.match(/#\s*(\d{1,4})\b/); // #12
      if (!em) em = work.match(/\be(\d{1,4})\b/i); // e12
      if (em) {
        currentEpisode = parseInt(em[1], 10);
        work = work.replace(em[0], " ");
      } else {
        // a bare number only if it trails after a delimiter:  "Naruto - 200"
        const tail = work.match(/[|:\-–, ]\s*(\d{1,4})\s*$/);
        if (tail) {
          currentEpisode = parseInt(tail[1], 10);
          work = work.replace(/[|:\-–, ]\s*\d{1,4}\s*$/, " ");
        }
      }
    }

    // ── whatever's left is the title ──
    let title = work
      .replace(/[|:–, ]+/g, " ")
      .replace(/\s{2,}/g, " ")
      .replace(/^[\s,.\-|]+|[\s,.\-|]+$/g, "")
      .trim();
    if (!title) return null;

    return {
      key: keySeq++,
      title,
      status: status || "watching",
      currentEpisode,
      totalEpisodes,
      rating,
      cover,
    };
  }

  function parseText(text) {
    // if they pasted JSON (ChatGPT's structured reply or a backup), use it
    const json = tryParseJson(text);
    if (json) return json;

    let lines = text.split(/\r?\n/);
    // single line of comma-separated titles → split on commas
    const nonEmpty = lines.filter((l) => l.trim());
    if (nonEmpty.length === 1 && nonEmpty[0].includes(",")) {
      lines = nonEmpty[0].split(",");
    }
    const out = [];
    const seen = new Map(); // slug → index in out (merge duplicates)
    for (const line of lines) {
      const item = parseLine(line);
      if (!item) continue;
      const s = slug(item.title);
      if (seen.has(s)) {
        out[seen.get(s)] = item; // later line wins
      } else {
        seen.set(s, out.length);
        out.push(item);
      }
    }
    return out;
  }

  // ── render the editable preview ────────────────────────────────────
  function statusOptions(sel) {
    return Object.entries(STATUS_LABELS)
      .map(([v, l]) => `<option value="${v}" ${v === sel ? "selected" : ""}>${l}</option>`)
      .join("");
  }
  function ratingOptions(sel) {
    let o = `<option value="0" ${sel ? "" : "selected"}>, </option>`;
    for (let i = 1; i <= 5; i++) {
      o += `<option value="${i}" ${i === sel ? "selected" : ""}>${"★".repeat(i)}</option>`;
    }
    return o;
  }

  function render() {
    countEl.textContent = `${rows.length} title${rows.length === 1 ? "" : "s"}`;
    rowsEl.innerHTML = rows
      .map((r) => {
        const coverInner = r.cover
          ? `<img src="${esc(r.cover)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'ph',textContent:'🎬'}))">`
          : `<span class="ph">🎬</span>`;
        const coverCell = `<span class="pv-cover" ${r.cover ? 'data-cover title="Click to remove cover"' : ""}>${coverInner}</span>`;
        return `
      <div class="pv-row" data-key="${r.key}">
        <div class="pv-titlecell">
          ${coverCell}
          <input class="pv-in pv-title" data-field="title" value="${esc(r.title)}" />
        </div>
        <select class="pv-in pv-status" data-field="status">${statusOptions(r.status)}</select>
        <input class="pv-in pv-num" data-field="currentEpisode" type="number" min="0"
          value="${r.currentEpisode ?? ""}" placeholder="0" />
        <input class="pv-in pv-num" data-field="totalEpisodes" type="number" min="0"
          value="${r.totalEpisodes ?? ""}" placeholder="?" />
        <select class="pv-in pv-rating" data-field="rating">${ratingOptions(r.rating)}</select>
        <button class="pv-del" data-del="${r.key}" title="Remove" type="button">✕</button>
      </div>`;
      })
      .join("");
    previewEl.hidden = rows.length === 0 && !previewShown;
  }

  let previewShown = false;
  function showPreview() {
    previewShown = true;
    previewEl.hidden = false;
    noteEl.hidden = false;
    render();
    previewEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ── events ─────────────────────────────────────────────────────────
  $("btn-convert").addEventListener("click", () => {
    const parsed = parseText(rawBox.value);
    if (!parsed.length) {
      alert("Couldn't find any anime in that text. Try one title per line.");
      return;
    }
    rows = parsed;
    showPreview();
  });

  $("btn-example").addEventListener("click", () => {
    rawBox.value = [
      "Jujutsu Kaisen - watching - ep 12",
      "One Piece  1088",
      "Frieren: Beyond Journey's End   completed   28/28   9/10",
      "Solo Leveling | plan to watch",
      "Vinland Saga  on hold  ep 5",
      "Steins;Gate  finished  ★★★★★",
      "Chainsaw Man  dropped  ep 3",
    ].join("\n");
    rawBox.focus();
  });

  // edit a field in the preview
  rowsEl.addEventListener("input", (e) => {
    const el = e.target.closest("[data-field]");
    if (!el) return;
    const key = +el.closest(".pv-row").dataset.key;
    const row = rows.find((r) => r.key === key);
    if (!row) return;
    const f = el.dataset.field;
    if (f === "currentEpisode" || f === "totalEpisodes") {
      row[f] = el.value === "" ? null : parseInt(el.value, 10);
    } else if (f === "rating") {
      row.rating = parseInt(el.value, 10) || 0;
    } else {
      row[f] = el.value;
    }
  });

  rowsEl.addEventListener("click", (e) => {
    // click a cover thumbnail to clear it (handy for broken links)
    const cov = e.target.closest(".pv-cover[data-cover]");
    if (cov) {
      const key = +cov.closest(".pv-row").dataset.key;
      const row = rows.find((r) => r.key === key);
      if (row) {
        row.cover = null;
        render();
      }
      return;
    }
    // remove a row
    const btn = e.target.closest("[data-del]");
    if (!btn) return;
    rows = rows.filter((r) => r.key !== +btn.dataset.del);
    render();
  });

  // add a blank row
  $("btn-addrow").addEventListener("click", () => {
    rows.push({
      key: keySeq++,
      title: "",
      status: "watching",
      currentEpisode: null,
      totalEpisodes: null,
      rating: 0,
      cover: null,
    });
    render();
    const last = rowsEl.querySelector(".pv-row:last-child .pv-title");
    if (last) last.focus();
  });

  // clear everything
  $("btn-clear").addEventListener("click", () => {
    if (rows.length && !confirm("Clear all rows?")) return;
    rows = [];
    render();
  });

  // upload an existing backup to edit
  $("file-backup").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const list = parsed && parsed.list ? parsed.list : parsed;
      if (!list || typeof list !== "object") throw new Error("bad");
      rows = Object.values(list)
        .filter((a) => a && a.title)
        .map((a) => ({
          key: keySeq++,
          title: a.title,
          status: STATUS_LABELS[a.status] ? a.status : "onhold",
          currentEpisode: a.currentEpisode ?? null,
          totalEpisodes: a.totalEpisodes ?? null,
          rating: a.rating || 0,
          cover: a.cover || null,
        }));
      if (!rows.length) throw new Error("empty");
      showPreview();
    } catch (err) {
      alert("That doesn't look like an OtakuList backup file.");
    }
    e.target.value = "";
  });

  // build + download the import file
  $("btn-download").addEventListener("click", () => {
    const clean = rows.filter((r) => r.title.trim());
    if (!clean.length) {
      alert("Add at least one title first.");
      return;
    }
    const now = Date.now();
    const list = {};
    for (const r of clean) {
      let id = slug(r.title);
      if (!id) continue;
      // avoid clobbering duplicate slugs
      let unique = id, n = 2;
      while (list[unique]) unique = `${id}-${n++}`;
      list[unique] = {
        id: unique,
        title: r.title.trim(),
        status: r.status,
        currentEpisode: r.currentEpisode,
        totalEpisodes: r.totalEpisodes,
        rating: r.rating || 0,
        cover: r.cover || null,
        site: "imported list",
        url: "",
        note: "",
        addedAt: now,
        updatedAt: now,
      };
    }
    const payload = {
      app: "OtakuList",
      version: 1,
      exportedAt: new Date().toISOString(),
      list,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().slice(0, 10);
    const a = document.createElement("a");
    a.href = url;
    a.download = `otakulist-import-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
})();
