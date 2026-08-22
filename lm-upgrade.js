/**
 * Kanairoex v9.4 upgrades — polish, long-doc study, online quality, speech bridge, unified backup helpers
 */
const LMUpgrade = (() => {
  const ONBOARD_KEY = "localmind_onboarded_v94";
  const PIN_KEY = "localmind_pinned_facts";

  function getPinned() {
    try { return JSON.parse(localStorage.getItem(PIN_KEY) || "[]"); } catch { return []; }
  }
  function setPinned(ids) {
    localStorage.setItem(PIN_KEY, JSON.stringify(ids.slice(-200)));
  }

  function pinFact(id) {
    const ids = getPinned();
    if (!ids.includes(id)) ids.push(id);
    setPinned(ids);
    return ids.length;
  }

  function unpinFact(id) {
    setPinned(getPinned().filter((x) => x !== id));
  }

  function isPinned(id) {
    return getPinned().includes(id);
  }

  /** Chunk long text for map-reduce style study */
  function chunkText(text, size = 2200, overlap = 200) {
    const t = String(text || "");
    if (t.length <= size) return [t];
    const chunks = [];
    let i = 0;
    while (i < t.length) {
      chunks.push(t.slice(i, i + size));
      i += size - overlap;
      if (chunks.length > 40) break;
    }
    return chunks;
  }

  function studyLongDocument(name, content, question) {
    const chunks = chunkText(content);
    const partial = [];
    for (let i = 0; i < chunks.length; i++) {
      if (typeof KanairoexThinking !== "undefined") {
        const s = KanairoexThinking.studyText(name + " [part " + (i + 1) + "]", chunks[i], question);
        partial.push({
          part: i + 1,
          keywords: s.keywords || [],
          keyPoints: (s.keyPoints || []).slice(0, 3)
        });
      } else {
        partial.push({
          part: i + 1,
          keywords: [],
          keyPoints: [chunks[i].slice(0, 160)]
        });
      }
    }
    const kwFreq = {};
    partial.forEach((p) => {
      (p.keywords || []).forEach((k) => {
        kwFreq[k] = (kwFreq[k] || 0) + 1;
      });
    });
    const keywords = Object.keys(kwFreq)
      .sort((a, b) => kwFreq[b] - kwFreq[a])
      .slice(0, 15);
    const keyPoints = [];
    partial.forEach((p) => {
      (p.keyPoints || []).forEach((kp) => {
        if (keyPoints.length < 12) keyPoints.push(kp);
      });
    });
    let thinking = "→ Long document: " + chunks.length + " chunks\n→ Map each chunk\n→ Merge keywords & key points\n→ Answer question";
    if (typeof KanairoexThinking !== "undefined") {
      thinking = KanairoexThinking.formatSteps(KanairoexThinking.plan(question || "study document"));
    }
    return {
      thinking,
      name,
      chunks: chunks.length,
      stats: {
        words: String(content).trim().split(/\s+/).filter(Boolean).length,
        chars: String(content).length
      },
      keywords,
      keyPoints,
      reply:
        "**Thinking**\n" +
        thinking +
        "\n\n**Long study: " +
        name +
        "** (" +
        chunks.length +
        " parts)\n" +
        "• ~" +
        String(content).trim().split(/\s+/).filter(Boolean).length +
        " words\n" +
        "• Keywords: " +
        (keywords.join(", ") || "—") +
        "\n\n**Key points (merged)**\n" +
        keyPoints.map((p, i) => i + 1 + ". " + p).join("\n")
    };
  }

  /** Cite knowledge facts used for an answer */
  function citeRelevant(query, limit = 3) {
    if (typeof Knowledge === "undefined" || !Knowledge.findRelevant) return [];
    try {
      return (Knowledge.findRelevant(query, limit) || []).map((f) => ({
        id: f.id,
        subject: f.subject,
        snippet: String(f.content || "").slice(0, 180),
        source: f.source || f.category,
        created: f.created,
        pinned: isPinned(f.id)
      }));
    } catch {
      return [];
    }
  }

  function formatCitations(cites) {
    if (!cites || !cites.length) return "";
    return (
      "\n\n**From memory**\n" +
      cites
        .map(
          (c) =>
            "• **" +
            c.subject +
            "**" +
            (c.source ? " _(" + c.source + ")_" : "") +
            (c.pinned ? " 📌" : "") +
            "\n  " +
            c.snippet +
            (c.snippet.length >= 180 ? "…" : "")
        )
        .join("\n")
    );
  }

  /** Speech: Web Speech API recognition (mic). File audio: metadata only offline. */
  function speechSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  function listenOnce(lang) {
    return new Promise((resolve, reject) => {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) {
        reject(new Error("Speech recognition not supported in this browser."));
        return;
      }
      const r = new SR();
      r.lang = lang || "en-US";
      r.interimResults = false;
      r.maxAlternatives = 1;
      r.onresult = (ev) => {
        const text = ev.results[0][0].transcript;
        resolve(text);
      };
      r.onerror = (e) => reject(new Error(e.error || "speech error"));
      r.onend = () => {};
      try {
        r.start();
      } catch (e) {
        reject(e);
      }
    });
  }

  function onboardNeeded() {
    return !localStorage.getItem(ONBOARD_KEY);
  }

  function markOnboarded() {
    localStorage.setItem(ONBOARD_KEY, String(Date.now()));
  }

  function onboardText() {
    let addr = "(open wallet after load)";
    try {
      if (typeof LMTWallet !== "undefined") addr = LMTWallet.getAddress();
    } catch (e) {}
    return (
      "**Welcome to Kanairoex v9.4**\n\n" +
      "Private offline-first assistant on **this device only**.\n\n" +
      "1. **Teach** — `Remember that …` or Teach panel\n" +
      "2. **Files** — upload/drop text files → study & summary\n" +
      "3. **Online** — `look up Topic` (auto-saves to memory)\n" +
      "4. **Wallet** — address `" +
      addr +
      "`\n" +
      "   `create token MYT Name 1000000 0.01` · `p2p pay …`\n" +
      "5. **Backup** — Settings / backup export\n\n" +
      "_Tokens are educational simulations — not real money._\n" +
      "Type `help` anytime. Type `got it` to dismiss this guide."
    );
  }

  function helpText() {
    return (
      "**Kanairoex help**\n\n" +
      "• Chat / teach facts / upload files\n" +
      "• `look up …` · `wallet` · `create token SYM Name supply price`\n" +
      "• `pay 10 MYT LMT-ADDR` · `p2p pay …` · `flush outbox`\n" +
      "• `evolve status` · `listen` (mic → text, if supported)\n" +
      "• `pin fact <id>` · `unpin fact <id>` · `memory citations <query>`\n" +
      "• Wallet & P2P: balances, outbox, backup\n\n" +
      "_System economy runs on-device + P2P between users. No central cloud ledger._"
    );
  }

  /** Unified export payload including wallet registry & evolution */
  function fullExport() {
    const base = typeof AI !== "undefined" && AI.exportAll ? AI.exportAll() : {};
    base.version = 9.4;
    try {
      if (typeof LMTWallet !== "undefined") {
        base.wallet = {
          info: LMTWallet.info(),
          history: LMTWallet.history(50),
          outbox: LMTWallet.loadOutbox ? LMTWallet.loadOutbox() : []
        };
      }
    } catch (e) {}
    try {
      if (typeof SelfEvolution !== "undefined") {
        base.evolution = SelfEvolution.status();
      }
    } catch (e) {}
    base.pinned = getPinned();
    return base;
  }

  function handleCommand(text) {
    const t = (text || "").trim();
    const lower = t.toLowerCase();
    if (lower === "help" || lower === "commands") return { reply: helpText() };
    if (lower === "got it" || lower === "dismiss guide" || lower === "onboard done") {
      markOnboarded();
      return { reply: "Guide dismissed. Type `help` anytime." };
    }
    if (lower === "guide" || lower === "onboarding" || lower === "first run") {
      return { reply: onboardText() };
    }
    if (lower === "listen" || lower === "voice input" || lower === "speech") {
      if (!speechSupported()) {
        return {
          reply:
            "Mic speech recognition is not available in this browser.\n" +
            "Use Chrome/Edge for Web Speech API, or type your message."
        };
      }
      return {
        reply: "Listening… speak now.",
        _listenPromise: listenOnce("en-US")
      };
    }
    if (/^pin fact\s+/i.test(t)) {
      const id = t.replace(/^pin fact\s+/i, "").trim();
      pinFact(id);
      return { reply: "Pinned fact `" + id + "`." };
    }
    if (/^unpin fact\s+/i.test(t)) {
      const id = t.replace(/^unpin fact\s+/i, "").trim();
      unpinFact(id);
      return { reply: "Unpinned `" + id + "`." };
    }
    if (/^memory citations?\s+/i.test(t) || /^cite\s+/i.test(t)) {
      const q = t.replace(/^(memory citations?|cite)\s+/i, "").trim() || t;
      const cites = citeRelevant(q, 5);
      return {
        reply: cites.length ? formatCitations(cites) : "No matching memory facts for that query."
      };
    }
    return null;
  }

  return {
    chunkText,
    studyLongDocument,
    citeRelevant,
    formatCitations,
    speechSupported,
    listenOnce,
    onboardNeeded,
    markOnboarded,
    onboardText,
    helpText,
    fullExport,
    handleCommand,
    pinFact,
    unpinFact,
    isPinned,
    getPinned
  };
})();

if (typeof window !== "undefined") window.LMUpgrade = LMUpgrade;
