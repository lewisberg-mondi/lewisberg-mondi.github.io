/**
 * Kanairoex Neural Core — educational mini-transformer stack
 * Loads all modules and exposes MiniLM for generation / training demos.
 */
(function (root) {
  // Modules are already global via script tags; this wires a convenient API.
  function createMiniLM(opts = {}) {
    const dim = opts.dim || 32;
    const layers = opts.layers || 2;
    const heads = opts.heads || 2;
    const vocabSize = CoreTokenizer.vocabSize();
    const model = CoreTransformer.Transformer({ dim, layers, heads, vocabSize });
    const head = CoreLMHead.LMHead(dim, vocabSize);

    function generate(prompt, maxNew = 12, temperature = 0.9) {
      CoreRandom.seed((prompt || '').length * 997 + 42);
      let ids = CoreTokenizer.encode(prompt || 'hello', true);
      // drop trailing eos for continuation
      if (ids[ids.length - 1] === 3) ids = ids.slice(0, -1);
      for (let i = 0; i < maxNew; i++) {
        const hidden = model.forward(ids);
        const logits = head.logitsForLast(hidden);
        const next = temperature <= 0
          ? CoreSampler.greedy(logits)
          : CoreSampler.topK(logits, 8, temperature);
        ids.push(next);
        if (next === 3) break;
      }
      return CoreTokenizer.decode(ids);
    }

    function embedText(text) {
      const ids = CoreTokenizer.encode(text, false);
      const h = model.forward(ids.length ? ids : [1]);
      // mean pool
      const dim = h.cols;
      const vec = new Float64Array(dim);
      for (let t = 0; t < h.rows; t++)
        for (let d = 0; d < dim; d++) vec[d] += h.data[t * dim + d];
      for (let d = 0; d < dim; d++) vec[d] /= Math.max(1, h.rows);
      return vec;
    }

    function status() {
      return {
        vocabSize: CoreTokenizer.vocabSize(),
        dim, layers, heads,
        note: 'Educational mini-transformer — not a pretrained LLM'
      };
    }

    /** Run attention on words using live embeddings (real Q=K=V) */
    function realAttention(words) {
      const list = (words || []).map(function (w) { return String(w).trim(); }).filter(Boolean).slice(0, 12);
      if (list.length < 2) return null;
      // ensure vocab knows these words
      if (typeof CoreTokenizer !== "undefined" && CoreTokenizer.buildFromText) {
        CoreTokenizer.buildFromText(list.join(" ") + " " + (CoreTokenizer.decode([2,3]) || ""), 500);
        // rebuild model if vocab grew — recreate singleton path via embed on each
      }
      const dim = model.dim || 32;
      const vecs = list.map(function (w) {
        const ids = CoreTokenizer.encode(w, false);
        const h = model.forward(ids.length ? ids : [1]);
        // last row as token vector
        const row = new Float64Array(dim);
        const t = Math.max(0, h.rows - 1);
        for (let d = 0; d < dim; d++) row[d] = h.data[t * dim + d];
        return row;
      });
      const out = CoreAttention.fromTokenVectors(vecs);
      const seq = list.length;
      const weights = [];
      for (let i = 0; i < seq; i++) {
        weights[i] = [];
        for (let j = 0; j < seq; j++) weights[i][j] = out.attnWeights.data[i * seq + j];
      }
      return { tokens: list, weights: weights, dim: dim };
    }

    function forwardInspect(text) {
      const ids = CoreTokenizer.encode(text || "hello", true);
      const hidden = model.forward(ids);
      const logits = head.logitsForLast(hidden);
      let max = -Infinity, maxi = 0;
      for (let i = 0; i < logits.length; i++) {
        if (logits[i] > max) { max = logits[i]; maxi = i; }
      }
      return {
        tokens: CoreTokenizer.decode(ids),
        ids: ids,
        seq: hidden.rows,
        dim: hidden.cols,
        layers: layers,
        heads: heads,
        topToken: (CoreTokenizer.getVocab().id2tok[maxi] || "<unk>"),
        topLogit: max
      };
    }

    function cosine(a, b) {
      let dot = 0, na = 0, nb = 0;
      for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
      }
      return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-12);
    }

    function knnEmbed(query, candidates, k) {
      k = k || 5;
      const qv = embedText(query);
      const scored = (candidates || []).map(function (c) {
        return { text: c, sim: cosine(qv, embedText(c)) };
      });
      scored.sort(function (a, b) { return b.sim - a.sim; });
      return scored.slice(0, k);
    }

    return { generate, embedText, status, model, head, realAttention, forwardInspect, knnEmbed, cosine };
  }

  // Singleton used by Kanairoex
  let _lm = null;
  function getMiniLM(forceNew) {
    if (forceNew || !_lm) _lm = createMiniLM();
    return _lm;
  }

  root.CoreNN = {
    createMiniLM,
    getMiniLM,
    Random: typeof CoreRandom !== 'undefined' ? CoreRandom : null,
    Tokenizer: typeof CoreTokenizer !== 'undefined' ? CoreTokenizer : null
  };
})(typeof window !== 'undefined' ? window : globalThis);
