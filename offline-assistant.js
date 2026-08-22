/**
 * Offline-Assistant core rules — sync, offline answers, structured storage
 */
const OfflineAssistant = (() => {
  const WATCH_KEY = "localmind_watchlist";
  const SYNC_KEY = "localmind_last_sync";
  const META_KEY = "localmind_fact_meta";
  const SYNC_TOPIC_TIMEOUT_MS = 15000;

  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error((label || "Operation") + " timed out")), ms))
    ]);
  }

  function loadWatch() {
    try { return JSON.parse(localStorage.getItem(WATCH_KEY) || "[]"); } catch { return []; }
  }
  function saveWatch(list) {
    try { localStorage.setItem(WATCH_KEY, JSON.stringify(list.slice(0, 40))); } catch (e) {}
  }
  function getLastSync() {
    try { return localStorage.getItem(SYNC_KEY) || null; } catch { return null; }
  }
  function setLastSync() {
    const d = new Date().toISOString();
    try { localStorage.setItem(SYNC_KEY, d); } catch (e) {}
    return d;
  }
  function formatSyncDate() {
    const s = getLastSync();
    if (!s) return "never";
    try {
      return new Date(s).toLocaleString();
    } catch { return s; }
  }

  function addWatch(topic) {
    const t = String(topic || "").trim().slice(0, 80);
    if (!t) return loadWatch();
    const list = loadWatch().filter(x => x.toLowerCase() !== t.toLowerCase());
    list.unshift(t);
    saveWatch(list);
    return list;
  }

  function loadMeta() {
    try { return JSON.parse(localStorage.getItem(META_KEY) || "{}"); } catch { return {}; }
  }
  function saveMeta(m) {
    try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) {}
  }

  /** Structured fact: Topic | Summary | Source | Date | Expires */
  function saveStructured(topic, summary, source, expiresDays) {
    const dateSaved = new Date().toISOString().slice(0, 10);
    const expires = expiresDays
      ? new Date(Date.now() + expiresDays * 86400000).toISOString().slice(0, 10)
      : "none";
    const content =
      "Summary: " + summary +
      "\nSource: " + (source || "local") +
      "\nDate Saved: " + dateSaved +
      "\nExpires: " + expires;
    if (typeof Knowledge !== "undefined") {
      Knowledge.add(topic, content, "synced");
    }
    const meta = loadMeta();
    meta[topic.toLowerCase()] = { source: source || "local", dateSaved, expires };
    saveMeta(meta);
    if (typeof Blockchain !== "undefined") {
      Blockchain.addBlock({ type: "sync_save", topic, source: source || "local", dateSaved });
    }
    return { topic, summary, source: source || "local", dateSaved, expires };
  }

  function offlineMissingReply(topic) {
    return (
      "I don't have this offline. Last sync was **" + formatSyncDate() + "**.\n\n" +
      "Want me to fetch it next time we're online?\n" +
      "• Say **look up " + (topic || "topic") + "** when online\n" +
      "• Or **add watch " + (topic || "topic") + "** then **SYNC NOW**"
    );
  }

  function isOnline() {
    if (typeof Online !== "undefined" && Online.getEnabled) return Online.getEnabled();
    return typeof navigator === "undefined" || navigator.onLine !== false;
  }

  function formatFactBrief(fact) {
    const lines = (fact.content || "").split("\n");
    let summary = fact.content;
    let source = "";
    let dateSaved = "";
    for (const line of lines) {
      if (/^Summary:/i.test(line)) summary = line.replace(/^Summary:\s*/i, "");
      if (/^Source:/i.test(line)) source = line.replace(/^Source:\s*/i, "");
      if (/^Date Saved:/i.test(line)) dateSaved = line.replace(/^Date Saved:\s*/i, "");
    }
    let out = "**" + fact.subject + "**\n- " + summary.slice(0, 400);
    if (source) out += "\n- Source: " + source;
    if (dateSaved) out += "\n- Saved: " + dateSaved;
    return out;
  }

  async function syncTopic(topic) {
    if (!isOnline()) throw new Error("Offline — cannot sync now.");
    if (typeof Online === "undefined") throw new Error("Online module missing.");
    const data = await withTimeout(Online.learnTopic(topic), SYNC_TOPIC_TIMEOUT_MS, "Sync for " + topic);
    const saved = saveStructured(
      data.title || topic,
      (data.extract || data.content || "").slice(0, 1200),
      data.url || "wikipedia",
      30
    );
    addWatch(topic);
    return saved;
  }

  async function syncNow() {
    if (!isOnline()) {
      return { ok: false, message: "Cannot SYNC NOW — you appear offline. Last sync: " + formatSyncDate() };
    }
    const list = loadWatch();
    if (!list.length) {
      return {
        ok: false,
        message: "Watchlist empty. Add topics: **add watch [topic]** then **SYNC NOW**."
      };
    }
    const results = [];
    const errors = [];
    for (const topic of list.slice(0, 8)) {
      try {
        const s = await syncTopic(topic);
        results.push(s.topic);
      } catch (e) {
        errors.push(topic + ": " + (e.message || e));
      }
    }
    setLastSync();
    let msg = "**SYNC NOW complete**\n\n";
    if (results.length) msg += "Saved:\n" + results.map(t => "- " + t).join("\n") + "\n";
    if (errors.length) msg += "\nIssues:\n" + errors.map(e => "- " + e).join("\n") + "\n";
    msg += "\nLast sync: **" + formatSyncDate() + "**";
    return { ok: true, message: msg, results, errors };
  }

  function detect(text) {
    const lower = text.toLowerCase().trim();
    if (/^sync\s*now$/i.test(lower) || /^sync now\b/i.test(lower)) return { type: "sync_now" };
    let m = lower.match(/^add watch\s+(.+)/i);
    if (m) return { type: "add_watch", topic: m[1].replace(/[?.!]+$/, "").trim() };
    m = lower.match(/^remove watch\s+(.+)/i);
    if (m) return { type: "remove_watch", topic: m[1].trim() };
    if (/^watchlist$|^list watch|^show watch/i.test(lower)) return { type: "list_watch" };
    if (/^last sync$|^when.*sync/i.test(lower)) return { type: "last_sync" };
    return null;
  }

  function handleSyncIntent(intent) {
    if (intent.type === "add_watch") {
      const list = addWatch(intent.topic);
      return "Added to watchlist: **" + intent.topic + "**\n\nWatchlist:\n" + list.map(t => "- " + t).join("\n") + "\n\nSay **SYNC NOW** when online.";
    }
    if (intent.type === "remove_watch") {
      const list = loadWatch().filter(t => t.toLowerCase() !== intent.topic.toLowerCase());
      saveWatch(list);
      return "Removed from watchlist (if present): **" + intent.topic + "**";
    }
    if (intent.type === "list_watch") {
      const list = loadWatch();
      if (!list.length) return "Watchlist is empty. **add watch [topic]**";
      return "**Watchlist**\n" + list.map(t => "- " + t).join("\n") + "\n\nLast sync: " + formatSyncDate();
    }
    if (intent.type === "last_sync") {
      return "Last sync was **" + formatSyncDate() + "**.";
    }
    return null;
  }

  function briefFromKnowledge(question) {
    if (typeof Knowledge === "undefined") return null;
    const hits = Knowledge.findRelevant(question, 5);
    if (!hits.length) return null;
    let out = "**From local knowledge**\n\n";
    hits.forEach(h => { out += formatFactBrief(h) + "\n\n"; });
    out += "_Last sync: " + formatSyncDate() + "_";
    return out;
  }

  return {
    detect, handleSyncIntent, syncNow, syncTopic,
    offlineMissingReply, briefFromKnowledge, saveStructured,
    getLastSync, formatSyncDate, addWatch, loadWatch, isOnline
  };
})();
