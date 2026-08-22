/**
 * Kanairoex Knowledge Base
 * Stores facts the AI learns. Bulk-safe for preload.
 * Performance: in-memory cache + debounced localStorage writes.
 */

const Knowledge = (() => {
  const STORAGE_KEY = "localmind_knowledge";
  const SAVE_DELAY_MS = 400;
  const MAX_FACTS = 5000;

  let _cache = null;
  let _dirty = false;
  let _saveTimer = null;

  function load() {
    if (_cache) return _cache;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      _cache = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(_cache)) _cache = [];
    } catch {
      _cache = [];
    }
    return _cache;
  }

  function saveNow(facts) {
    try {
      let list = facts || _cache || [];
      if (list.length > MAX_FACTS) list = list.slice(-MAX_FACTS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      _cache = list;
      _dirty = false;
    } catch (e) {
      const list = facts || _cache || [];
      if (list.length > 100) {
        const trimmed = list.slice(-Math.floor(list.length / 2));
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
          _cache = trimmed;
          _dirty = false;
        } catch (e2) {}
      }
    }
  }

  function save(facts) {
    if (facts) _cache = facts;
    _dirty = true;
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(function () {
      _saveTimer = null;
      if (_dirty) saveNow(_cache);
    }, SAVE_DELAY_MS);
  }

  function flush() {
    if (_saveTimer) {
      clearTimeout(_saveTimer);
      _saveTimer = null;
    }
    if (_dirty) saveNow(_cache);
  }

  try {
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", flush);
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "hidden") flush();
      });
    }
  } catch (_) {}

  function add(subject, content, category = "general", opts = {}) {
    const facts = load();
    const fact = {
      id: "f_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      subject: String(subject || "").trim(),
      content: String(content || "").trim(),
      category,
      source: opts.source || (category === "online" ? "online" : category),
      created: Date.now(),
      updated: Date.now(),
      uses: 0
    };
    if (!fact.subject || !fact.content) return null;
    const subjKey = fact.subject.toLowerCase();
    const srcKey = String(fact.source || "").toLowerCase();
    const existingIdx = facts.findIndex(function (f) {
      return String(f.subject || "").toLowerCase() === subjKey &&
        String(f.source || f.category || "").toLowerCase() === srcKey;
    });
    if (existingIdx >= 0 && opts.dedupe !== false) {
      facts[existingIdx].content = fact.content;
      facts[existingIdx].updated = Date.now();
      facts[existingIdx].source = fact.source;
      save(facts);
      return facts[existingIdx];
    }
    facts.push(fact);
    save(facts);

    if (!opts.silent) {
      try {
        if (typeof Blockchain !== "undefined") {
          Blockchain.addBlock({
            type: "knowledge",
            action: "learn",
            subject: fact.subject,
            content: fact.content.slice(0, 200),
            category
          });
        }
      } catch (_) {}
      try {
        if (typeof Neurons !== "undefined") {
          Neurons.activate("knowledge:" + fact.subject.toLowerCase().slice(0, 30), 2);
        }
      } catch (_) {}
    }
    return fact;
  }

  function addBulk(items, category = "education", maxItems = 120) {
    if (!items || !items.length) return 0;
    const facts = load();
    let added = 0;
    const limit = Math.min(items.length, maxItems || 120);
    for (let i = 0; i < limit; i++) {
      const it = items[i];
      if (!it) continue;
      const subject = String(it.subject || it.title || "").trim();
      const content = String(it.content || it.text || it.body || "").trim();
      if (!subject || !content) continue;
      const subjKey = subject.toLowerCase();
      const existingIdx = facts.findIndex(function (f) {
        return String(f.subject || "").toLowerCase() === subjKey &&
          String(f.category || "") === category;
      });
      if (existingIdx >= 0) {
        facts[existingIdx].content = content;
        facts[existingIdx].updated = Date.now();
      } else {
        facts.push({
          id: "f_b_" + Date.now() + "_" + i + "_" + Math.random().toString(36).slice(2, 5),
          subject: subject,
          content: content,
          category: category,
          source: category,
          created: Date.now(),
          updated: Date.now(),
          uses: 0
        });
        added++;
      }
    }
    save(facts);
    return added;
  }

  function findRelevant(query, limit) {
    limit = limit || 6;
    const q = String(query || "").toLowerCase();
    if (!q) return [];
    const facts = load();
    const tokens = q.split(/\s+/).filter(function (t) { return t.length > 2; });
    const scored = [];
    for (let i = 0; i < facts.length; i++) {
      const f = facts[i];
      const blob = ((f.subject || "") + " " + (f.content || "")).toLowerCase();
      let score = 0;
      if (blob.indexOf(q) >= 0) score += 10;
      for (let j = 0; j < tokens.length; j++) {
        if (blob.indexOf(tokens[j]) >= 0) score += 2;
      }
      if (score > 0) scored.push({ f: f, score: score });
    }
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.slice(0, limit).map(function (x) {
      x.f.uses = (x.f.uses || 0) + 1;
      return x.f;
    });
  }

  function search(query) {
    if (!query) return load().slice();
    return findRelevant(query, 50);
  }

  function remove(id) {
    const facts = load().filter(function (f) { return f.id !== id; });
    save(facts);
    return true;
  }

  function getAll() { return load().slice(); }
  function getCount() { return load().length; }
  function exportData() { return load().slice(); }

  function clear() {
    _cache = [];
    _dirty = true;
    flush();
  }

  function importData(arr) {
    if (!Array.isArray(arr) || !arr.length) return 0;
    const facts = load();
    let n = 0;
    for (let i = 0; i < arr.length; i++) {
      const it = arr[i];
      if (!it || !it.subject || !it.content) continue;
      facts.push({
        id: it.id || ("f_imp_" + Date.now() + "_" + i),
        subject: String(it.subject).trim(),
        content: String(it.content).trim(),
        category: it.category || "general",
        source: it.source || it.category || "import",
        created: it.created || Date.now(),
        updated: Date.now(),
        uses: it.uses || 0
      });
      n++;
    }
    save(facts);
    flush();
    return n;
  }

  return {
    add,
    addBulk,
    findRelevant,
    search,
    load,
    save,
    flush,
    remove,
    getAll,
    getCount,
    exportData,
    importData,
    clear
  };
})();

if (typeof window !== "undefined") window.Knowledge = Knowledge;
