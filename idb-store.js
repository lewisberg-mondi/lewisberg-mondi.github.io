/**
 * Kanairoex — IndexedDB + improved Vector Store
 * Persistent high-capacity storage for facts, embeddings, and SRS cards.
 * Provides cosine / k-NN search over dense vectors.
 */
const IDBStore = (() => {
  const DB_NAME = "localmind-idb-v1";
  const DB_VERSION = 1;
  let dbPromise = null;

  function isSupported() {
    return typeof indexedDB !== "undefined";
  }

  function open() {
    if (!isSupported()) return Promise.reject(new Error("IndexedDB unavailable"));
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("facts")) {
          const s = db.createObjectStore("facts", { keyPath: "id", autoIncrement: true });
          s.createIndex("subject", "subject", { unique: false });
          s.createIndex("category", "category", { unique: false });
        }
        if (!db.objectStoreNames.contains("vectors")) {
          const s = db.createObjectStore("vectors", { keyPath: "id" });
          s.createIndex("namespace", "namespace", { unique: false });
        }
        if (!db.objectStoreNames.contains("srs")) {
          const s = db.createObjectStore("srs", { keyPath: "id", autoIncrement: true });
          s.createIndex("due", "due", { unique: false });
          s.createIndex("subject", "subject", { unique: false });
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "key" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function tx(store, mode = "readonly") {
    return open().then((db) => db.transaction(store, mode).objectStore(store));
  }

  // ── Facts ──────────────────────────────────────────────
  async function putFact(fact) {
    const store = await tx("facts", "readwrite");
    return new Promise((res, rej) => {
      const r = store.put(fact);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }

  async function getFactsBySubject(subject) {
    const store = await tx("facts");
    return new Promise((res, rej) => {
      const idx = store.index("subject");
      const r = idx.getAll(subject);
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => rej(r.error);
    });
  }

  async function allFacts() {
    const store = await tx("facts");
    return new Promise((res, rej) => {
      const r = store.getAll();
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => rej(r.error);
    });
  }

  // ── Vector Store ───────────────────────────────────────
  /**
   * Simple deterministic bag-of-words style embedding (dim=64)
   * for offline semantic search without external models.
   */
  function embedText(text, dim = 64) {
    const vec = new Float32Array(dim);
    const tokens = String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean);
    if (!tokens.length) return vec;
    tokens.forEach((tok, i) => {
      let h = 2166136261;
      for (let c = 0; c < tok.length; c++) {
        h ^= tok.charCodeAt(c);
        h = Math.imul(h, 16777619);
      }
      const idx = Math.abs(h) % dim;
      vec[idx] += 1 + (i % 3) * 0.1;
      // bigram spill
      if (i + 1 < tokens.length) {
        let h2 = h;
        const t2 = tokens[i + 1];
        for (let c = 0; c < t2.length; c++) {
          h2 ^= t2.charCodeAt(c);
          h2 = Math.imul(h2, 16777619);
        }
        vec[Math.abs(h2) % dim] += 0.5;
      }
    });
    // L2 normalize
    let norm = 0;
    for (let i = 0; i < dim; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < dim; i++) vec[i] /= norm;
    return vec;
  }

  function cosine(a, b) {
    let dot = 0;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) dot += a[i] * b[i];
    return dot;
  }

  async function upsertVector(id, text, namespace = "default", extra = {}) {
    const vector = Array.from(embedText(text));
    const store = await tx("vectors", "readwrite");
    const record = { id, text, vector, namespace, ...extra, updated: Date.now() };
    return new Promise((res, rej) => {
      const r = store.put(record);
      r.onsuccess = () => res(record);
      r.onerror = () => rej(r.error);
    });
  }

  async function knn(queryText, k = 5, namespace = "default") {
    const q = embedText(queryText);
    const store = await tx("vectors");
    const all = await new Promise((res, rej) => {
      const r = store.getAll();
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => rej(r.error);
    });
    const filtered = namespace ? all.filter((x) => x.namespace === namespace) : all;
    const scored = filtered.map((item) => ({
      id: item.id,
      text: item.text,
      score: cosine(q, item.vector || []),
      meta: item
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }

  async function vectorCount(namespace) {
    const store = await tx("vectors");
    const all = await new Promise((res, rej) => {
      const r = store.getAll();
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => rej(r.error);
    });
    return namespace ? all.filter((x) => x.namespace === namespace).length : all.length;
  }

  // ── Meta ───────────────────────────────────────────────
  async function setMeta(key, value) {
    const store = await tx("meta", "readwrite");
    return new Promise((res, rej) => {
      const r = store.put({ key, value });
      r.onsuccess = () => res(true);
      r.onerror = () => rej(r.error);
    });
  }

  async function getMeta(key) {
    const store = await tx("meta");
    return new Promise((res, rej) => {
      const r = store.get(key);
      r.onsuccess = () => res(r.result ? r.result.value : null);
      r.onerror = () => rej(r.error);
    });
  }

  async function status() {
    if (!isSupported()) return { supported: false };
    try {
      await open();
      const facts = await allFacts();
      const vcount = await vectorCount();
      return {
        supported: true,
        facts: facts.length,
        vectors: vcount,
        db: DB_NAME
      };
    } catch (e) {
      return { supported: true, error: e.message };
    }
  }

  // Expose SRS store helpers for the SRS module
  async function srsPut(card) {
    const store = await tx("srs", "readwrite");
    return new Promise((res, rej) => {
      const r = store.put(card);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }

  async function srsGetAll() {
    const store = await tx("srs");
    return new Promise((res, rej) => {
      const r = store.getAll();
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => rej(r.error);
    });
  }

  async function srsGetDue(before = Date.now()) {
    const all = await srsGetAll();
    return all.filter((c) => (c.due || 0) <= before);
  }

  return {
    isSupported,
    open,
    putFact,
    getFactsBySubject,
    allFacts,
    embedText,
    cosine,
    upsertVector,
    knn,
    vectorCount,
    setMeta,
    getMeta,
    status,
    srsPut,
    srsGetAll,
    srsGetDue
  };
})();

if (typeof window !== "undefined") window.IDBStore = IDBStore;
