/**
 * Offline RAG — Retrieval Augmented Generation
 * --------------------------------------------
 * 1. Index: chunk knowledge + loaded files + journal notes
 * 2. Embed: bag-of-words + optional MiniLM mean-pool hybrid score
 * 3. Retrieve: top-k by cosine / overlap
 * 4. Generate: compose answer from retrieved chunks (SpeakGen) + citations
 *
 * Fully offline. No network.
 */
const RAG = (() => {
  const INDEX_KEY = "localmind_rag_index_v1";
  const META_KEY = "localmind_rag_meta_v1";

  function loadIndex() {
    try { return JSON.parse(localStorage.getItem(INDEX_KEY) || "[]"); } catch { return []; }
  }
  function saveIndex(idx) {
    try { localStorage.setItem(INDEX_KEY, JSON.stringify(idx.slice(-800))); } catch (e) {
      try { localStorage.setItem(INDEX_KEY, JSON.stringify(idx.slice(-300))); } catch (e2) {}
    }
  }
  function loadMeta() {
    try { return JSON.parse(localStorage.getItem(META_KEY) || "{}"); } catch { return {}; }
  }
  function saveMeta(m) {
    try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) {}
  }

  const STOP = {
    the:1, a:1, an:1, and:1, or:1, but:1, in:1, on:1, at:1, to:1, for:1, of:1, is:1, are:1, was:1, were:1,
    be:1, been:1, being:1, it:1, its:1, this:1, that:1, with:1, from:1, by:1, as:1, i:1, you:1, we:1,
    they:1, he:1, she:1, my:1, your:1, our:1, their:1, not:1, no:1, so:1, if:1, then:1, than:1,
    what:1, who:1, how:1, when:1, where:1, why:1, do:1, does:1, did:1, can:1, could:1, would:1,
    should:1, will:1, just:1, also:1, very:1, more:1, some:1, any:1, all:1, each:1, other:1
  };

  function tokenize(text) {
    return String(text || "").toLowerCase()
      .replace(/[^a-z0-9\s'-]/g, " ")
      .split(/\s+/)
      .filter(function (w) { return w.length > 2 && !STOP[w]; });
  }

  /**
   * Chunking strategy (all enabled):
   *  1. Paragraph split on blank lines
   *  2. Sentence-aware packing (., !, ? boundaries)
   *  3. Word windows of `size` (default 120) with `overlap` words
   *  4. Drop tiny fragments; hard-cap characters
   */
  const CHUNK_DEFAULTS = {
    size: 120,              // max words per semantic chunk
    overlap: 30,            // for long-window fallback
    minChars: 25,
    maxChars: 1600,
    minInput: 20,
    semanticThreshold: 0.12, // merge sentences if similarity >= this
    mode: "semantic"         // "semantic" | "sentence" | "overlap"
  };

  function splitSentences(text) {
    // Keep punctuation with the sentence
    const parts = String(text).match(/[^.!?]+[.!?]+|[^.!?]+$/g);
    if (!parts) return [String(text).trim()];
    return parts.map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function packSentences(sentences, size) {
    // Pack whole sentences until ~size words
    const packs = [];
    let buf = [];
    let words = 0;
    sentences.forEach(function (s) {
      const w = s.split(/\s+/).filter(Boolean).length;
      if (words + w > size && buf.length) {
        packs.push(buf.join(" "));
        buf = [s];
        words = w;
      } else {
        buf.push(s);
        words += w;
      }
    });
    if (buf.length) packs.push(buf.join(" "));
    return packs;
  }

  function overlappingWindows(words, size, overlap) {
    const out = [];
    if (!words.length) return out;
    const step = Math.max(1, size - overlap);
    for (let i = 0; i < words.length; i += step) {
      const slice = words.slice(i, i + size);
      if (!slice.length) break;
      out.push(slice.join(" "));
      if (i + size >= words.length) break;
    }
    return out;
  }

  /**
   * Semantic similarity between two short texts (BOW cosine + optional dense).
   */
  function textSimilarity(a, b) {
    const ba = bowVector(a);
    const bb = bowVector(b);
    let s = cosineBow(ba, bb);
    try {
      const va = embedMiniLM(a);
      const vb = embedMiniLM(b);
      if (va && vb) s = 0.4 * s + 0.6 * cosineDense(va, vb);
    } catch (e) {}
    return s;
  }

  /**
   * Semantic chunking:
   *  - Split into sentences
   *  - Greedily merge while adjacent similarity >= threshold
   *  - Start a new chunk when topic drifts (similarity drop)
   *  - Enforce max words; if a merge would exceed, flush first
   */
  function semanticChunkSentences(sentences, opts) {
    opts = opts || {};
    const threshold = opts.threshold != null ? opts.threshold : CHUNK_DEFAULTS.semanticThreshold;
    const maxWords = opts.size != null ? opts.size : CHUNK_DEFAULTS.size;
    const minChars = opts.minChars != null ? opts.minChars : CHUNK_DEFAULTS.minChars;
    const chunks = [];
    if (!sentences.length) return chunks;

    let current = [sentences[0]];
    let currentWords = sentences[0].split(/\s+/).filter(Boolean).length;

    for (let i = 1; i < sentences.length; i++) {
      const s = sentences[i];
      const w = s.split(/\s+/).filter(Boolean).length;

      // Similarity vs last sentence (local) and vs whole chunk (global)
      const last = current[current.length - 1];
      const simLast = textSimilarity(last, s);
      const simAll = textSimilarity(current.join(" "), s);
      const sim = Math.max(simLast, simAll * 0.85);

      const wouldExceed = currentWords + w > maxWords;
      // Soft keep: very short follow-ups stay with parent if any shared signal
      const softKeep = w <= 6 && simLast >= threshold * 0.5;
      const topicBreak = sim < threshold && !softKeep;

      if (wouldExceed || topicBreak) {
        const joined = current.join(" ").trim();
        if (joined.length >= minChars) {
          chunks.push({
            text: joined,
            strategy: "semantic",
            simBreak: Math.round(sim * 1000) / 1000,
            words: currentWords
          });
        }
        current = [s];
        currentWords = w;
      } else {
        current.push(s);
        currentWords += w;
      }
    }
    if (current.length) {
      const joined = current.join(" ").trim();
      if (joined.length >= minChars) {
        chunks.push({ text: joined, strategy: "semantic", words: currentWords });
      }
    }
    return chunks;
  }

  function makeChunk(text, source, meta, extra) {
    return Object.assign({
      id: "rag_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      text: String(text).slice(0, CHUNK_DEFAULTS.maxChars),
      source: source || "unknown",
      title: (meta && meta.title) || source || "chunk",
      created: Date.now()
    }, extra || {});
  }

  function chunkText(text, source, meta, opts) {
    opts = opts || {};
    const size = opts.size != null ? opts.size : CHUNK_DEFAULTS.size;
    const overlap = opts.overlap != null ? opts.overlap : CHUNK_DEFAULTS.overlap;
    const minChars = opts.minChars != null ? opts.minChars : CHUNK_DEFAULTS.minChars;
    const threshold = opts.threshold != null ? opts.threshold : CHUNK_DEFAULTS.semanticThreshold;
    const mode = opts.mode || CHUNK_DEFAULTS.mode || "semantic";
    const raw = String(text || "").trim();
    if (raw.length < CHUNK_DEFAULTS.minInput) return [];

    const parts = [];
    const seen = {};

    const paras = raw.split(/\n\s*\n/).filter(function (p) {
      return p.trim().length > 15;
    });
    const blocks = paras.length ? paras : [raw];

    blocks.forEach(function (block, bi) {
      const sentences = splitSentences(block);

      // --- Primary: semantic merging by similarity ---
      if (mode === "semantic") {
        const sem = semanticChunkSentences(sentences, {
          size: size,
          threshold: threshold,
          minChars: minChars
        });
        sem.forEach(function (seg, si) {
          const words = seg.text.split(/\s+/).filter(Boolean);
          // If still huge, fall back to overlapping windows
          if (words.length > size * 1.5) {
            overlappingWindows(words, size, overlap).forEach(function (win, wi) {
              if (win.length < minChars) return;
              const key = win.slice(0, 100);
              if (seen[key]) return;
              seen[key] = true;
              parts.push(makeChunk(win, source, meta, {
                strategy: "semantic+overlap",
                para: bi,
                window: wi,
                words: win.split(/\s+/).length,
                overlap: overlap
              }));
            });
          } else {
            const key = seg.text.slice(0, 100);
            if (seen[key]) return;
            seen[key] = true;
            parts.push(makeChunk(seg.text, source, meta, {
              strategy: "semantic",
              para: bi,
              seg: si,
              words: seg.words,
              threshold: threshold
            }));
          }
        });
        return;
      }

      // --- Legacy: sentence pack + overlap ---
      const sentencePacks = packSentences(sentences, size);
      sentencePacks.forEach(function (pack) {
        const words = pack.split(/\s+/).filter(Boolean);
        if (words.length <= size) {
          if (pack.length >= minChars) {
            const key = pack.slice(0, 100);
            if (!seen[key]) {
              seen[key] = true;
              parts.push(makeChunk(pack, source, meta, {
                strategy: "sentence",
                para: bi,
                words: words.length
              }));
            }
          }
          return;
        }
        overlappingWindows(words, size, overlap).forEach(function (win, wi) {
          if (win.length < minChars) return;
          const key = win.slice(0, 100);
          if (seen[key]) return;
          seen[key] = true;
          parts.push(makeChunk(win, source, meta, {
            strategy: "overlap",
            para: bi,
            window: wi,
            words: win.split(/\s+/).length,
            overlap: overlap
          }));
        });
      });
    });

    return parts;
  }

  function bowVector(text) {
    const tf = {};
    tokenize(text).forEach(function (w) {
      tf[w] = (tf[w] || 0) + 1;
    });
    return tf;
  }

  function cosineBow(a, b) {
    let dot = 0, na = 0, nb = 0;
    Object.keys(a).forEach(function (k) {
      na += a[k] * a[k];
      if (b[k]) dot += a[k] * b[k];
    });
    Object.keys(b).forEach(function (k) { nb += b[k] * b[k]; });
    return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-12);
  }

  function embedMiniLM(text) {
    try {
      if (typeof CoreNN !== "undefined" && CoreNN.getMiniLM) {
        const v = CoreNN.getMiniLM().embedText(String(text).slice(0, 400));
        return Array.prototype.slice.call(v);
      }
    } catch (e) {}
    return null;
  }

  function cosineDense(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-12);
  }

  function indexChunk(chunk) {
    chunk.bow = bowVector(chunk.text);
    chunk.vec = embedMiniLM(chunk.text);
    return chunk;
  }

  /** Rebuild index from knowledge, files, optional extra texts */
  function rebuild() {
    const chunks = [];
    if (typeof Knowledge !== "undefined" && Knowledge.getAll) {
      Knowledge.getAll().forEach(function (f) {
        const body = (f.subject || "") + ". " + (f.content || "");
        chunkText(body, "knowledge", { title: f.subject }).forEach(function (c) {
          c.category = f.category || "knowledge";
          chunks.push(indexChunk(c));
        });
      });
    }
    if (typeof Files !== "undefined" && Files.getCurrent) {
      try {
        const cur = Files.getCurrent();
        if (cur && cur.content) {
          chunkText(cur.content, "file:" + (cur.name || "loaded"), { title: cur.name }).forEach(function (c) {
            chunks.push(indexChunk(c));
          });
        }
      } catch (e) {}
    }
    // offline pages
    try {
      if (typeof Online !== "undefined" && Online.listOfflinePages) {
        const pages = Online.listOfflinePages() || [];
        pages.forEach(function (p) {
          const text = p.extract || p.content || p.summary || "";
          chunkText(text, "offline:" + (p.title || "page"), { title: p.title }).forEach(function (c) {
            chunks.push(indexChunk(c));
          });
        });
      }
    } catch (e) {}

    saveIndex(chunks);
    const meta = { builtAt: Date.now(), count: chunks.length };
    saveMeta(meta);
    if (typeof Neurons !== "undefined" && Neurons.activate) {
      Neurons.activate("rag:rebuild", 2);
    }
    return meta;
  }

  function ensureIndex() {
    let idx = loadIndex();
    if (!idx.length) {
      rebuild();
      idx = loadIndex();
    }
    return idx;
  }

  function retrieve(query, k) {
    k = k || 5;
    const idx = ensureIndex();
    const qBow = bowVector(query);
    const qVec = embedMiniLM(query);
    const scored = idx.map(function (c) {
      let score = cosineBow(qBow, c.bow || {});
      if (qVec && c.vec) {
        score = 0.55 * score + 0.45 * cosineDense(qVec, c.vec);
      }
      // slight boost for title match
      const qt = tokenize(query);
      const title = String(c.title || "").toLowerCase();
      qt.forEach(function (w) {
        if (title.indexOf(w) !== -1) score += 0.05;
      });
      return { chunk: c, score: score };
    });
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.filter(function (s) { return s.score > 0.02; }).slice(0, k);
  }

  function answer(query, k) {
    k = k || 5;
    const hits = retrieve(query, k);
    if (!hits.length) {
      return {
        reply:
          "**RAG:** no relevant chunks offline.\n\n" +
          "Teach facts (`Remember that …`), **Load file**, or **Rebuild RAG index** after adding knowledge.\n" +
          "Then ask again.",
        hits: []
      };
    }

    // Compose answer from top chunks
    let reply = "";
    if (typeof SpeakGen !== "undefined" && SpeakGen.compose) {
      const facts = hits.map(function (h) {
        return {
          subject: h.chunk.title || h.chunk.source,
          content: h.chunk.text
        };
      });
      const composed = SpeakGen.compose(query, facts, {
        text: hits.map(function (h) { return h.chunk.text; }).join(" ").slice(0, 2000)
      });
      reply = composed.text + "\n\n";
    } else {
      reply = "Based on offline retrieval:\n\n";
      hits.forEach(function (h, i) {
        reply += (i + 1) + ". " + h.chunk.text.slice(0, 280) + "\n\n";
      });
    }

    reply += "### Retrieved sources (offline RAG)\n";
    reply += "| # | Score | Source | Preview |\n|---|-------|--------|--------|\n";
    hits.forEach(function (h, i) {
      reply += "| " + (i + 1) + " | " + h.score.toFixed(3) + " | " +
        String(h.chunk.source).slice(0, 24) + " | " +
        String(h.chunk.title || "").slice(0, 32) + " |\n";
    });
    reply += "\n_Answer grounded in local index only. Rebuild after teaching new facts._";

    if (typeof Neurons !== "undefined" && Neurons.coActivate) {
      try {
        Neurons.coActivate(
          tokenize(query).slice(0, 4).concat(hits.slice(0, 2).map(function (h) { return h.chunk.title; })),
          1
        );
      } catch (e) {}
    }

    return { reply: reply, hits: hits };
  }

  function status() {
    const meta = loadMeta();
    const idx = loadIndex();
    return (
      "**Offline RAG status**\n\n" +
      "- Chunks indexed: **" + idx.length + "**\n" +
      "- Chunk size: **" + CHUNK_DEFAULTS.size + "** · overlap: **" + CHUNK_DEFAULTS.overlap +
        "** · mode: **" + CHUNK_DEFAULTS.mode + "** · semantic θ: **" + CHUNK_DEFAULTS.semanticThreshold + "**\n" +
      "- Last build: " + (meta.builtAt ? new Date(meta.builtAt).toLocaleString() : "never") + "\n\n" +
      "Commands:\n" +
      "- **Rebuild RAG index**\n" +
      "- **RAG:** your question\n" +
      "- **RAG status**\n"
    );
  }

  function setChunkConfig(size, overlap, threshold) {
    if (size != null) CHUNK_DEFAULTS.size = Math.max(40, Math.min(300, Number(size) || 120));
    if (overlap != null) CHUNK_DEFAULTS.overlap = Math.max(0, Math.min(CHUNK_DEFAULTS.size - 1, Number(overlap) || 0));
    if (threshold != null) {
      const th = Number(threshold);
      if (!isNaN(th)) CHUNK_DEFAULTS.semanticThreshold = Math.max(0.05, Math.min(0.9, th));
    }
    return CHUNK_DEFAULTS;
  }

  function detect(text) {
    const t = text || "";
    const lower = t.toLowerCase().trim();
    if (/^rebuild rag(\s+index)?\b/i.test(lower)) return { type: "rebuild" };
    if (/^rag status\b/i.test(lower)) return { type: "status" };
    if (/^rag chunk(s)?\s+/i.test(lower) || /^set rag chunk/i.test(lower)) {
      const nums = t.match(/(\d+(?:\.\d+)?)/g) || [];
      return { type: "config", size: nums[0], overlap: nums[1], threshold: nums[2] };
    }
    if (/^rag mode\s+(semantic|sentence|overlap)\b/i.test(lower)) {
      const m = lower.match(/rag mode\s+(semantic|sentence|overlap)/i);
      return { type: "mode", mode: m[1].toLowerCase() };
    }
    if (/^rag\s*[:\-]\s*/i.test(t)) {
      return { type: "query", body: t.replace(/^rag\s*[:\-]?\s*/i, "").trim() };
    }
    if (/^search (my )?(notes|memory|knowledge|files)\b/i.test(lower)) {
      return { type: "query", body: t.replace(/^search (my )?(notes|memory|knowledge|files)\s*[:\-]?\s*/i, "").trim() };
    }
    return null;
  }

  function handle(intent) {
    if (!intent) return null;
    if (intent.type === "mode") {
      CHUNK_DEFAULTS.mode = intent.mode;
      return "RAG chunk mode set to **" + intent.mode + "**. Rebuild index to apply.";
    }
    if (intent.type === "config") {
      const c = setChunkConfig(intent.size, intent.overlap, intent.threshold);
      return "RAG chunk config: **size=" + c.size + "**, **overlap=" + c.overlap + "**, **semantic threshold=" + c.semanticThreshold + "**, mode=**" + c.mode + "**.\nSay **Rebuild RAG index** to apply.";
    }
    if (intent.type === "rebuild") {
      const m = rebuild();
      return "RAG index rebuilt: **" + m.count + "** chunks (size=" + CHUNK_DEFAULTS.size + ", overlap=" + CHUNK_DEFAULTS.overlap + ").\n\nAsk with **RAG:** your question";
    }
    if (intent.type === "status") return status();
    if (intent.type === "query") {
      if (!intent.body) return "Usage: **RAG:** what is photosynthesis?";
      return answer(intent.body, 5).reply;
    }
    return null;
  }

  /**
   * Auto-retrieve for general questions when knowledge alone is thin.
   * Called from reasoning optionally.
   */
  function tryAugment(query) {
    const hits = retrieve(query, 4);
    if (!hits.length || hits[0].score < 0.08) return null;
    return answer(query, 4);
  }

  /** Incrementally index a single text without full rebuild (keeps UI responsive) */
  function indexOne(text, source, meta) {
    if (!text || String(text).trim().length < 3) return 0;
    let idx = loadIndex();
    const parts = chunkText(String(text), source || "knowledge", meta || {});
    let n = 0;
    parts.forEach(function (c) {
      // Prefer cheap bag-of-words; skip dense MiniLM embed during interactive teach
      c.bow = bowVector(c.text);
      c.vec = null;
      idx.push(c);
      n++;
    });
    // Cap index size to avoid unbounded growth / localStorage quota
    if (idx.length > 800) idx = idx.slice(-800);
    saveIndex(idx);
    try {
      const metaObj = loadMeta() || {};
      metaObj.count = idx.length;
      metaObj.lastIncremental = Date.now();
      saveMeta(metaObj);
    } catch (e) {}
    return n;
  }

  let _rebuildTimer = null;
  /** Debounced full rebuild off the critical path (after teach / bulk import) */
  function rebuildDeferred(delayMs) {
    delayMs = delayMs == null ? 1200 : delayMs;
    if (_rebuildTimer) clearTimeout(_rebuildTimer);
    _rebuildTimer = setTimeout(function () {
      _rebuildTimer = null;
      try {
        // Use requestIdleCallback when available so we don't fight the UI
        const run = function () { try { rebuild(); } catch (e) { console.warn("RAG deferred rebuild", e); } };
        if (typeof requestIdleCallback === "function") {
          requestIdleCallback(run, { timeout: 4000 });
        } else {
          run();
        }
      } catch (e) {}
    }, delayMs);
  }

  return {
    rebuild: rebuild,
    rebuildDeferred: rebuildDeferred,
    indexOne: indexOne,
    retrieve: retrieve,
    answer: answer,
    status: status,
    detect: detect,
    handle: handle,
    tryAugment: tryAugment,
    ensureIndex: ensureIndex,
    chunkText: chunkText,
    setChunkConfig: setChunkConfig,
    CHUNK_DEFAULTS: CHUNK_DEFAULTS
  };
})();
