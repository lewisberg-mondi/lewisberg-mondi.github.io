/**
 * Kanairoex Study Hub — SRS review, streaks, pins, alerts, backup, diagnose,
 * lesson packs, simple explain, contradictions, command help index.
 */
const StudyHub = (() => {
  const STREAK_KEY = "localmind_streak_v1";
  const PINS_KEY = "localmind_chat_pins_v1";
  const ALERTS_KEY = "localmind_price_alerts_v1";
  const LESSON_PROGRESS = "localmind_lesson_progress_v1";

  /* ---------- Streak ---------- */
  function todayUTC() {
    return new Date().toISOString().slice(0, 10);
  }

  function loadStreak() {
    try {
      return JSON.parse(localStorage.getItem(STREAK_KEY) || "{}") || {};
    } catch (_) {
      return {};
    }
  }

  function touchStreak(kind) {
    const s = loadStreak();
    const t = todayUTC();
    if (s.lastDay !== t) {
      const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      s.count = s.lastDay === y ? (s.count || 0) + 1 : 1;
      s.lastDay = t;
      s.today = { teach: 0, review: 0, quiz: 0, ask: 0 };
    }
    s.today = s.today || { teach: 0, review: 0, quiz: 0, ask: 0 };
    if (kind && s.today[kind] != null) s.today[kind]++;
    try { localStorage.setItem(STREAK_KEY, JSON.stringify(s)); } catch (_) {}
    return s;
  }

  function streakSummary() {
    const s = touchStreak();
    const t = s.today || {};
    return (
      "**Daily progress**\n\n" +
      "• Streak: **" + (s.count || 0) + "** day(s)\n" +
      "• Today — taught: " + (t.teach || 0) +
      " · reviewed: " + (t.review || 0) +
      " · quiz: " + (t.quiz || 0) +
      " · asks: " + (t.ask || 0) +
      "\n\nKeep going: `review` · `quiz me` · `Remember that …`"
    );
  }

  /* ---------- Chat pins ---------- */
  function loadPins() {
    try {
      return JSON.parse(localStorage.getItem(PINS_KEY) || "[]") || [];
    } catch (_) {
      return [];
    }
  }

  function savePins(arr) {
    try {
      localStorage.setItem(PINS_KEY, JSON.stringify(arr.slice(-50)));
    } catch (_) {}
  }

  function pinText(text, label) {
    const pins = loadPins();
    pins.push({
      id: "pin-" + Date.now(),
      label: String(label || "").slice(0, 60),
      text: String(text || "").slice(0, 4000),
      at: Date.now()
    });
    savePins(pins);
    return pins[pins.length - 1];
  }

  function listPins() {
    return loadPins().slice().reverse();
  }

  function clearPins() {
    savePins([]);
  }

  /* ---------- SRS ---------- */
  function intervals(box) {
    // Leitner-ish days
    const map = [0, 1, 3, 7, 14, 30, 60];
    return map[Math.min(box, map.length - 1)] || 1;
  }

  async function addCard(front, back, tag) {
    const card = {
      front: String(front || "").slice(0, 500),
      back: String(back || "").slice(0, 2000),
      tag: String(tag || "general").slice(0, 40),
      box: 0,
      due: Date.now(),
      reviews: 0,
      created: Date.now()
    };
    if (typeof IDBStore !== "undefined" && IDBStore.srsPut) {
      await IDBStore.srsPut(card);
      return card;
    }
    // localStorage fallback
    const key = "localmind_srs_fallback_v1";
    let all = [];
    try { all = JSON.parse(localStorage.getItem(key) || "[]"); } catch (_) {}
    card.id = Date.now();
    all.push(card);
    try { localStorage.setItem(key, JSON.stringify(all.slice(-500))); } catch (_) {}
    return card;
  }

  async function allCards() {
    if (typeof IDBStore !== "undefined" && IDBStore.srsGetAll) {
      try {
        return (await IDBStore.srsGetAll()) || [];
      } catch (_) {}
    }
    try {
      return JSON.parse(localStorage.getItem("localmind_srs_fallback_v1") || "[]");
    } catch (_) {
      return [];
    }
  }

  async function dueCards() {
    const now = Date.now();
    const all = await allCards();
    return all.filter(function (c) { return (c.due || 0) <= now; })
      .sort(function (a, b) { return (a.due || 0) - (b.due || 0); });
  }

  async function gradeCard(id, grade) {
    // grade: again | hard | good | easy
    const all = await allCards();
    const card = all.find(function (c) { return String(c.id) === String(id); });
    if (!card) throw new Error("Card not found");
    let box = card.box || 0;
    if (grade === "again") box = 0;
    else if (grade === "hard") box = Math.max(0, box - 1);
    else if (grade === "good") box = Math.min(6, box + 1);
    else if (grade === "easy") box = Math.min(6, box + 2);
    card.box = box;
    card.reviews = (card.reviews || 0) + 1;
    card.due = Date.now() + intervals(box) * 86400000;
    if (typeof IDBStore !== "undefined" && IDBStore.srsPut) {
      await IDBStore.srsPut(card);
    } else {
      try {
        localStorage.setItem("localmind_srs_fallback_v1", JSON.stringify(all));
      } catch (_) {}
    }
    touchStreak("review");
    return card;
  }

  async function cardsFromKnowledge(limit) {
    limit = limit || 20;
    if (typeof Knowledge === "undefined" || !Knowledge.getAll) return 0;
    const facts = Knowledge.getAll().slice(-limit);
    let n = 0;
    for (const f of facts) {
      await addCard(
        "What about: " + (f.subject || "?"),
        f.content || "",
        f.category || "knowledge"
      );
      n++;
    }
    return n;
  }

  let _currentReview = null;

  async function startReview() {
    const due = await dueCards();
    if (!due.length) {
      return { reply: "No cards due. Add with `add card Front | Back` or `cards from knowledge`." };
    }
    _currentReview = due[0];
    touchStreak("review");
    return {
      reply:
        "**Review** (" + due.length + " due)\n\n" +
        "**Q:** " + _currentReview.front +
        "\n\nReveal: `show answer` · Grade: `again` / `hard` / `good` / `easy`"
    };
  }

  async function showAnswer() {
    if (!_currentReview) return { reply: "No active card. Type `review`." };
    return {
      reply:
        "**A:** " + _currentReview.back +
        "\n\nGrade: `again` · `hard` · `good` · `easy`"
    };
  }

  async function applyGrade(grade) {
    if (!_currentReview) return { reply: "No active card. Type `review`." };
    const id = _currentReview.id;
    await gradeCard(id, grade);
    _currentReview = null;
    const next = await startReview();
    return {
      reply: "Graded **" + grade + "**.\n\n" + (next.reply || "")
    };
  }

  /* ---------- Price alerts ---------- */
  function loadAlerts() {
    try {
      return JSON.parse(localStorage.getItem(ALERTS_KEY) || "[]") || [];
    } catch (_) {
      return [];
    }
  }

  function saveAlerts(a) {
    try { localStorage.setItem(ALERTS_KEY, JSON.stringify(a.slice(-30))); } catch (_) {}
  }

  function setAlert(symbol, dir, price) {
    const a = loadAlerts();
    a.push({
      symbol: String(symbol || "LMT").toUpperCase(),
      dir: dir === "below" ? "below" : "above",
      price: Number(price),
      created: Date.now()
    });
    saveAlerts(a);
    return a[a.length - 1];
  }

  function checkAlerts() {
    const a = loadAlerts();
    if (!a.length || typeof LMTWallet === "undefined") return [];
    const fired = [];
    const remain = [];
    for (const al of a) {
      let px = 0;
      try {
        if (al.symbol === "LMT") px = LMTWallet.priceUsdPerLmt();
        else if (LMTWallet.priceUsdPerToken) px = LMTWallet.priceUsdPerToken(al.symbol);
      } catch (_) {}
      const hit =
        (al.dir === "above" && px >= al.price) ||
        (al.dir === "below" && px <= al.price);
      if (hit) fired.push(Object.assign({}, al, { current: px }));
      else remain.push(al);
    }
    saveAlerts(remain);
    return fired;
  }

  /* ---------- Lesson packs ---------- */
  function defaultLessonPacks() {
    return [
      {
        id: "kenya-basics",
        title: "Kenya basics",
        items: [
          { q: "Capital of Kenya?", a: "Nairobi" },
          { q: "Currency of Kenya?", a: "Kenyan Shilling (KES)" },
          { q: "Ocean bordering Kenya?", a: "Indian Ocean" }
        ]
      },
      {
        id: "study-habits",
        title: "Study habits",
        items: [
          { q: "What is spaced repetition?", a: "Reviewing material at increasing intervals to improve long-term memory." },
          { q: "What does BODMAS stand for?", a: "Brackets, Orders, Division, Multiplication, Addition, Subtraction" }
        ]
      }
    ];
  }

  function listLessons() {
    return defaultLessonPacks().map(function (p) {
      return "• **" + p.id + "** — " + p.title + " (" + p.items.length + " cards)";
    }).join("\n");
  }

  async function loadLesson(id) {
    const pack = defaultLessonPacks().find(function (p) {
      return p.id === id || p.title.toLowerCase() === String(id || "").toLowerCase();
    });
    if (!pack) throw new Error("Unknown lesson. Try `lessons`.");
    for (const it of pack.items) {
      await addCard(it.q, it.a, pack.id);
    }
    try {
      const prog = JSON.parse(localStorage.getItem(LESSON_PROGRESS) || "{}");
      prog[pack.id] = Date.now();
      localStorage.setItem(LESSON_PROGRESS, JSON.stringify(prog));
    } catch (_) {}
    return pack;
  }

  /* ---------- Backup / diagnose ---------- */
  async function fullBackupObject() {
    const out = {
      app: "Kanairoex",
      exportedAt: new Date().toISOString(),
      profile: null,
      streak: loadStreak(),
      pins: loadPins(),
      alerts: loadAlerts(),
      knowledge: null,
      walletNote: "Use export wallet with Sudoku password for full wallet backup"
    };
    try {
      if (typeof Profile !== "undefined" && Profile.snapshot) {
        out.profile = await Profile.snapshot(true);
      }
    } catch (_) {}
    try {
      if (typeof Knowledge !== "undefined" && Knowledge.getAll) {
        out.knowledge = Knowledge.getAll().slice(-500);
      }
    } catch (_) {}
    try {
      if (typeof LMUpgrade !== "undefined" && LMUpgrade.fullExport) {
        out.lmUpgrade = LMUpgrade.fullExport();
      }
    } catch (_) {}
    return out;
  }

  function diagnoseText() {
    const lines = ["**System diagnose**\n"];
    const row = function (name, ok, detail) {
      lines.push((ok ? "✓ " : "✗ ") + "**" + name + "**" + (detail ? " — " + detail : ""));
    };
    row("localStorage", typeof localStorage !== "undefined", "");
    row("IndexedDB", typeof indexedDB !== "undefined", "");
    row("WebRTC", typeof RTCPeerConnection !== "undefined", "");
    row("ServiceWorker", "serviceWorker" in navigator, "");
    row("Online", typeof navigator !== "undefined" ? navigator.onLine : false, "");
    row("Knowledge", typeof Knowledge !== "undefined", typeof Knowledge !== "undefined" && Knowledge.getAll ? Knowledge.getAll().length + " facts" : "");
    row("Wallet", typeof LMTWallet !== "undefined", typeof LMTWallet !== "undefined" && LMTWallet.getAddress ? LMTWallet.getAddress() : "");
    row("Profile", typeof Profile !== "undefined", typeof Profile !== "undefined" ? Profile.getName() || "(no name)" : "");
    row("WebRTCPeer", typeof WebRTCPeer !== "undefined", typeof WebRTCPeer !== "undefined" && WebRTCPeer.channelState ? "channel " + WebRTCPeer.channelState() : "");
    row("IDBStore", typeof IDBStore !== "undefined", "");
    row("StudyHub", true, "SRS + streak + pins");
    try {
      if (navigator.storage && navigator.storage.estimate) {
        // async not awaited here — best effort sync message
        lines.push("_Run `storage quota` for detailed disk use._");
      }
    } catch (_) {}
    return lines.join("\n");
  }

  async function storageQuotaText() {
    if (!navigator.storage || !navigator.storage.estimate) {
      return "Storage estimate API not available in this browser.";
    }
    const e = await navigator.storage.estimate();
    const used = e.usage || 0;
    const quota = e.quota || 0;
    return (
      "**Storage quota**\n\n• Used: **" + Math.round(used / 1024) + " KB**\n" +
      "• Quota: **" + Math.round(quota / (1024 * 1024)) + " MB**\n" +
      "• Free-ish: **" + Math.round((quota - used) / (1024 * 1024)) + " MB**"
    );
  }

  /* ---------- Contradictions ---------- */
  function contradictionReport() {
    if (typeof Verify === "undefined" || !Verify.analyze) {
      // simple heuristic on knowledge
      if (typeof Knowledge === "undefined" || !Knowledge.getAll) {
        return "Verify/Knowledge not loaded.";
      }
      const facts = Knowledge.getAll();
      const bySub = {};
      facts.forEach(function (f) {
        const s = (f.subject || "").toLowerCase();
        if (!s) return;
        bySub[s] = bySub[s] || [];
        bySub[s].push(f.content || "");
      });
      const issues = [];
      Object.keys(bySub).forEach(function (s) {
        if (bySub[s].length > 1) {
          const uniq = Array.from(new Set(bySub[s].map(function (x) { return x.slice(0, 80); })));
          if (uniq.length > 1) {
            issues.push("• **" + s + "**: " + uniq.length + " different statements");
          }
        }
      });
      if (!issues.length) return "No obvious subject conflicts in knowledge.";
      return "**Possible contradictions**\n\n" + issues.slice(0, 15).join("\n");
    }
    try {
      const a = Verify.analyze("");
      return a.message || JSON.stringify(a);
    } catch (e) {
      return "Verify failed: " + (e.message || e);
    }
  }

  /* ---------- Explain simple ---------- */
  function simplifyText(text) {
    let t = String(text || "");
    // light heuristic rewrite
    t = t.replace(/\butilize\b/gi, "use")
      .replace(/\bapproximately\b/gi, "about")
      .replace(/\btherefore\b/gi, "so")
      .replace(/\bhowever\b/gi, "but")
      .replace(/\badditional\b/gi, "more")
      .replace(/\bdemonstrate\b/gi, "show")
      .replace(/\brequirement\b/gi, "need")
      .replace(/\*\*/g, "");
    const sentences = t.split(/(?<=[.!?])\s+/).slice(0, 6);
    return (
      "**Simple version**\n\n" +
      sentences.join(" ") +
      "\n\n_Tip: teach short facts with `Remember that …` for clearer later answers._"
    );
  }

  /* ---------- Command index ---------- */
  function commandHelp(filter) {
    const groups = [
      ["Profile", "My name is … · profile · set photo · set video · set bio … · share profile · peer profiles"],
      ["Study", "review · show answer · again/hard/good/easy · add card Q | A · cards from knowledge · lessons · lesson kenya-basics · streak · quiz me"],
      ["Pins", "pin this: … · pins · clear pins"],
      ["Wallet", "balance · pay · p2p pay · outbox · create token · swap · markets"],
      ["P2P", "p2p setup · p2p offer · p2p answer · p2p status · p2p file · share profile"],
      ["System", "diagnose · backup · export profile · import profile · storage quota · guide"],
      ["Alerts", "alert LMT above 0.002 · alerts · clear alerts"]
    ];
    const f = String(filter || "").toLowerCase();
    const lines = ["**Command palette**\n"];
    groups.forEach(function (g) {
      if (!f || g[0].toLowerCase().includes(f) || g[1].toLowerCase().includes(f)) {
        lines.push("**" + g[0] + "**\n" + g[1] + "\n");
      }
    });
    return lines.join("\n");
  }

  /* ---------- Router ---------- */
  async function handle(text) {
    const raw = String(text || "").trim();
    const t = raw.toLowerCase();

    if (t === "streak" || t === "daily" || t === "progress today") {
      return { reply: streakSummary() };
    }

    if (t === "commands" || t === "command palette" || t === "help commands" || t === "palette") {
      return { reply: commandHelp() };
    }
    if (/^commands\s+/i.test(raw)) {
      return { reply: commandHelp(raw.replace(/^commands\s+/i, "")) };
    }

    if (t === "diagnose" || t === "doctor" || t === "system diagnose") {
      return { reply: diagnoseText() };
    }
    if (t === "storage quota" || t === "quota") {
      return { reply: await storageQuotaText() };
    }

    if (t === "contradictions" || t === "conflicts" || t === "memory conflicts") {
      return { reply: contradictionReport() };
    }

    if (t === "lessons" || t === "lesson packs") {
      return { reply: "**Lesson packs**\n\n" + listLessons() + "\n\nLoad: `lesson kenya-basics`" };
    }
    if (/^lesson\s+/i.test(raw)) {
      const id = raw.replace(/^lesson\s+/i, "").trim();
      try {
        const pack = await loadLesson(id);
        return { reply: "Loaded **" + pack.title + "** (" + pack.items.length + " cards). Type `review`." };
      } catch (e) {
        return { reply: e.message || String(e) };
      }
    }

    if (t === "review" || t === "srs" || t === "study") {
      return await startReview();
    }
    if (t === "show answer" || t === "reveal" || t === "answer") {
      return await showAnswer();
    }
    if (t === "again" || t === "hard" || t === "good" || t === "easy") {
      return await applyGrade(t);
    }
    if (/^add card\s+/i.test(raw)) {
      const body = raw.replace(/^add card\s+/i, "");
      const parts = body.split("|");
      if (parts.length < 2) return { reply: "Usage: `add card Front | Back`" };
      await addCard(parts[0].trim(), parts.slice(1).join("|").trim(), "manual");
      return { reply: "Card added. `review` when ready." };
    }
    if (t === "cards from knowledge" || t === "import knowledge cards") {
      const n = await cardsFromKnowledge(30);
      return { reply: "Added **" + n + "** cards from knowledge. `review`" };
    }

    if (/^pin this\s*[:\-]?\s*/i.test(raw)) {
      const body = raw.replace(/^pin this\s*[:\-]?\s*/i, "").trim();
      if (!body) return { reply: "Usage: `pin this: your text`" };
      const p = pinText(body);
      return { reply: "Pinned `" + p.id + "`. See `pins`." };
    }
    if (t === "pins" || t === "bookmarks") {
      const pins = listPins();
      if (!pins.length) return { reply: "No pins. Use `pin this: …`" };
      return {
        reply: "**Pins**\n\n" + pins.slice(0, 20).map(function (p) {
          return "• `" + p.id + "` " + (p.text || "").slice(0, 120);
        }).join("\n")
      };
    }
    if (t === "clear pins") {
      clearPins();
      return { reply: "Pins cleared." };
    }

    if (/^alert\s+/i.test(raw)) {
      const m = raw.match(/^alert\s+([A-Za-z]{2,8})\s+(above|below)\s+([\d.]+)/i);
      if (!m) return { reply: "Usage: `alert LMT above 0.002` or `alert MYT below 0.01`" };
      setAlert(m[1], m[2].toLowerCase(), m[3]);
      return { reply: "Alert set: **" + m[1].toUpperCase() + "** " + m[2].toLowerCase() + " " + m[3] };
    }
    if (t === "alerts") {
      const a = loadAlerts();
      if (!a.length) return { reply: "No price alerts." };
      return {
        reply: a.map(function (x) {
          return "• " + x.symbol + " " + x.dir + " " + x.price;
        }).join("\n")
      };
    }
    if (t === "clear alerts") {
      saveAlerts([]);
      return { reply: "Alerts cleared." };
    }
    if (t === "check alerts") {
      const fired = checkAlerts();
      if (!fired.length) return { reply: "No alerts triggered." };
      return {
        reply: "**Alerts fired**\n\n" + fired.map(function (f) {
          return "• " + f.symbol + " is " + f.current + " (" + f.dir + " " + f.price + ")";
        }).join("\n")
      };
    }

    if (t === "backup" || t === "backup center" || t === "full backup") {
      const data = await fullBackupObject();
      return {
        reply: "**Backup ready** (JSON). Use the download if offered, or copy from export tools.\n\nAlso: `export wallet …` · `export profile`",
        _downloadJSON: { filename: "localmind-backup.json", data: data }
      };
    }

    if (t === "export profile") {
      if (typeof Profile === "undefined") return { reply: "Profile not loaded." };
      const snap = await Profile.snapshot(true);
      return {
        reply: "**Profile export** — JSON download.\n\nImport later: `import profile` then paste/upload.",
        _downloadJSON: { filename: "localmind-profile.json", data: snap }
      };
    }

    if (/^import profile\s+/i.test(raw) || t === "import profile") {
      return {
        reply: "Paste profile JSON after the command, or use: `import profile { ... }`",
        // actual JSON body handled below if present
      };
    }

    if (/^import profile\s*\{/i.test(raw) || /^import profile\s*\[/i.test(raw)) {
      try {
        const jsonStr = raw.replace(/^import profile\s*/i, "");
        const obj = JSON.parse(jsonStr);
        if (typeof Profile !== "undefined") {
          if (obj.name) Profile.setName(obj.name);
          if (obj.bio) Profile.setBio(obj.bio);
          if (obj.avatarDataUrl && Profile.setAvatarFromFile) {
            // store via meta path
            try {
              localStorage.setItem("localmind_profile_avatar_fallback", obj.avatarDataUrl);
              const m = Profile.loadMeta();
              m.hasAvatar = true;
              m.name = obj.name || m.name;
              m.bio = obj.bio || m.bio;
              // loadMeta/save via setName side effects — use setBio/setName
              Profile.setName(obj.name || Profile.getName());
              if (obj.bio) Profile.setBio(obj.bio);
            } catch (_) {}
          }
        }
        return { reply: "Profile import applied (name/bio/photo when present)." };
      } catch (e) {
        return { reply: "Import failed: " + (e.message || e) };
      }
    }

    if (/^explain simple\s*[:\-]?/i.test(raw) || /^eli12\s*/i.test(raw) || /^simplify\s*[:\-]?/i.test(raw)) {
      const body = raw.replace(/^(explain simple|eli12|simplify)\s*[:\-]?\s*/i, "").trim();
      if (!body) return { reply: "Usage: `explain simple: <text>`" };
      return { reply: simplifyText(body) };
    }

    if (t === "onboard checklist" || t === "checklist") {
      const name = typeof Profile !== "undefined" ? Profile.getName() : "";
      const meta = typeof Profile !== "undefined" ? Profile.loadMeta() : {};
      let hasFacts = false;
      try {
        hasFacts = typeof Knowledge !== "undefined" && Knowledge.getAll && Knowledge.getAll().length > 0;
      } catch (_) {}
      let hasBal = false;
      try {
        hasBal = typeof LMTWallet !== "undefined" && LMTWallet.info && LMTWallet.info().balance >= 0;
      } catch (_) {}
      const lines = [
        "**Onboarding checklist**\n",
        (name ? "✅" : "☐") + " Name (`My name is …`)",
        (meta && meta.hasAvatar ? "✅" : "☐") + " Photo (`set photo`)",
        (meta && meta.bio ? "✅" : "☐") + " Bio (`set bio …`)",
        (hasFacts ? "✅" : "☐") + " First fact (`Remember that …`)",
        (hasBal ? "✅" : "☐") + " Wallet (`balance`)",
        "☐ P2P demo (`p2p setup`)",
        "☐ First review (`lesson kenya-basics` then `review`)"
      ];
      return { reply: lines.join("\n") };
    }

    return null;
  }

  function isStudyCommand(text) {
    const t = String(text || "").trim().toLowerCase();
    if (!t) return false;
    if (/^(again|hard|good|easy|show answer|reveal|answer)$/i.test(t)) {
      return !!_currentReview;
    }
    return /^(streak|daily|progress today|commands|command palette|help commands|palette|diagnose|doctor|system diagnose|storage quota|quota|contradictions|conflicts|memory conflicts|lessons|lesson packs|review|srs|study|cards from knowledge|import knowledge cards|pins|bookmarks|clear pins|alerts|clear alerts|check alerts|backup|backup center|full backup|export profile|import profile|onboard checklist|checklist)(\s|$)/i.test(t) ||
      /^lesson\s+/i.test(t) ||
      /^add card\s+/i.test(t) ||
      /^pin this/i.test(t) ||
      /^alert\s+/i.test(t) ||
      /^commands\s+/i.test(t) ||
      /^import profile\s*\{/i.test(t) ||
      /^(explain simple|eli12|simplify)\b/i.test(t);
  }

  return {
    handle,
    isStudyCommand,
    touchStreak,
    checkAlerts,
    pinText,
    commandHelp,
    diagnoseText
  };
})();

if (typeof window !== "undefined") window.StudyHub = StudyHub;
