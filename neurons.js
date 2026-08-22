/**
 * Kanairoex Hebbian Learning Engine
 * ---------------------------------
 * Classical Hebb:  "Cells that fire together, wire together."
 *   Δw_ij = η · x_i · x_j
 *
 * With practical additions used in local learning systems:
 *   - LTP: repeated co-activation strengthens synapses
 *   - LTD: activation without the partner weakly depresses the link
 *   - Trace (eligibility): recent firings can still co-associate for a short window
 *   - Soft bound: weights stay in [0, W_MAX]
 *   - Pruning: weak/old synapses are removed (sleep-like cleanup)
 *   - Pattern completion: cue activates linked ensemble
 *
 * This is a didactic simulation for education — not a full neural model.
 */

const Neurons = (() => {
  const STORAGE_KEY = "localmind_neurons";
  const LINKS_KEY = "localmind_neuron_links";
  const TRACE_KEY = "localmind_neuron_trace";
  const META_KEY = "localmind_hebb_meta";

  const MAX_NEURONS = 100;
  const MAX_LINKS = 160;
  const W_MAX = 1.0;          // soft max synaptic weight
  const ETA = 0.12;           // learning rate η
  const LTD_RATE = 0.03;      // long-term depression rate
  const TRACE_MS = 8000;      // eligibility trace window
  const DECAY = 0.002;        // slow passive weight decay per learn step

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function save(neurons) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(neurons)); } catch (e) {}
  }

  function loadLinks() {
    try {
      return JSON.parse(localStorage.getItem(LINKS_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function saveLinks(links) {
    try { localStorage.setItem(LINKS_KEY, JSON.stringify(links)); } catch (e) {}
  }

  function loadTrace() {
    try {
      return JSON.parse(localStorage.getItem(TRACE_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function saveTrace(trace) {
    try { localStorage.setItem(TRACE_KEY, JSON.stringify(trace.slice(-40))); } catch (e) {}
  }

  function meta() {
    try {
      return JSON.parse(localStorage.getItem(META_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function saveMeta(m) {
    try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) {}
  }

  function linkKey(a, b) {
    return a < b ? a + "||" + b : b + "||" + a;
  }

  function normLabel(label) {
    return String(label || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 48);
  }

  function tokensFromText(text) {
    const stop = {
      the:1, a:1, an:1, and:1, or:1, but:1, in:1, on:1, at:1, to:1, for:1, of:1, is:1, are:1, was:1, were:1,
      be:1, it:1, this:1, that:1, with:1, from:1, by:1, as:1, i:1, you:1, we:1, they:1, my:1, me:1, what:1,
      who:1, how:1, when:1, where:1, why:1, do:1, does:1, did:1, can:1, could:1, would:1, should:1, please:1
    };
    const out = [];
    String(text || "").toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").split(/\s+/).forEach(function (w) {
      if (w.length < 3 || stop[w]) return;
      if (out.indexOf(w) === -1) out.push(w);
    });
    return out.slice(0, 12);
  }

  function trimNeurons(neurons) {
    const keys = Object.keys(neurons);
    if (keys.length <= MAX_NEURONS) return neurons;
    keys.sort(function (a, b) {
      return (neurons[a].lastUsed || 0) - (neurons[b].lastUsed || 0);
    });
    for (let i = 0; i < keys.length - MAX_NEURONS; i++) delete neurons[keys[i]];
    return neurons;
  }

  function trimLinks(links) {
    const keys = Object.keys(links);
    if (keys.length <= MAX_LINKS) return links;
    keys.sort(function (a, b) { return (links[a].w || 0) - (links[b].w || 0); });
    for (let i = 0; i < keys.length - MAX_LINKS; i++) delete links[keys[i]];
    return links;
  }

  /** Ensure neuron exists and bump activity (firing) */
  function activate(label, amount) {
    if (!label) return null;
    amount = amount == null ? 1 : amount;
    let neurons = load();
    const key = normLabel(label);
    if (!key) return null;
    if (!neurons[key]) {
      neurons[key] = { strength: 0, uses: 0, created: Date.now(), x: 0 };
    }
    neurons[key].strength = Math.min(100, (neurons[key].strength || 0) + amount);
    neurons[key].uses = (neurons[key].uses || 0) + 1;
    neurons[key].lastUsed = Date.now();
    // instantaneous activity x in [0,1] for Hebb rule
    neurons[key].x = Math.min(1, 0.35 + amount * 0.15);
    neurons = trimNeurons(neurons);
    save(neurons);

    // eligibility trace
    let trace = loadTrace().filter(function (t) {
      return Date.now() - t.t < TRACE_MS;
    });
    trace.push({ label: key, t: Date.now(), x: neurons[key].x });
    saveTrace(trace);

    return neurons[key];
  }

  /**
   * Core Hebbian update between two units.
   * Δw = η * x_i * x_j  − decay   (LTP when both active)
   */
  function hebbPair(a, b, xA, xB, eta) {
    eta = eta == null ? ETA : eta;
    a = normLabel(a);
    b = normLabel(b);
    if (!a || !b || a === b) return null;

    let links = loadLinks();
    const k = linkKey(a, b);
    if (!links[k]) {
      links[k] = { a: a, b: b, w: 0, uses: 0, ltp: 0, ltd: 0 };
    }

    const xi = Math.max(0, Math.min(1, xA == null ? 1 : xA));
    const xj = Math.max(0, Math.min(1, xB == null ? 1 : xB));

    // Classical Hebbian LTP
    let dw = eta * xi * xj;
    // Mild decay
    dw -= DECAY * (links[k].w || 0);

    links[k].w = Math.max(0, Math.min(W_MAX, (links[k].w || 0) + dw));
    links[k].uses = (links[k].uses || 0) + 1;
    links[k].last = Date.now();
    if (dw > 0) links[k].ltp = (links[k].ltp || 0) + 1;

    links = trimLinks(links);
    saveLinks(links);

    const m = meta();
    m.hebbUpdates = (m.hebbUpdates || 0) + 1;
    m.lastHebb = Date.now();
    saveMeta(m);

    return { a: a, b: b, w: links[k].w, dw: dw };
  }

  /**
   * Co-activate a set of labels and apply pairwise Hebbian LTP.
   * Also associates with recent trace (eligibility).
   */
  function coActivate(labels, amount) {
    amount = amount == null ? 2 : amount;
    const unique = [];
    (labels || []).forEach(function (l) {
      const k = normLabel(l);
      if (k && unique.indexOf(k) === -1) unique.push(k);
    });

    const xs = {};
    unique.forEach(function (l) {
      const n = activate(l, amount);
      xs[l] = n ? (n.x || 0.5) : 0.5;
    });

    const touched = [];
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const res = hebbPair(unique[i], unique[j], xs[unique[i]], xs[unique[j]], ETA);
        if (res) touched.push(res);
      }
    }

    // Eligibility: bind current set to recent trace neurons
    const trace = loadTrace().filter(function (t) {
      return Date.now() - t.t < TRACE_MS && unique.indexOf(t.label) === -1;
    });
    trace.slice(-6).forEach(function (t) {
      unique.forEach(function (u) {
        const res = hebbPair(u, t.label, xs[u], t.x || 0.4, ETA * 0.5);
        if (res) touched.push(res);
      });
    });

    return { neurons: unique, links: touched };
  }

  /**
   * LTD: if A fired and B did not, slightly weaken w_ab.
   * Call with active set after a turn to depress unused partners of active neurons.
   */
  function depressUnpaired(activeLabels) {
    const active = {};
    (activeLabels || []).forEach(function (l) {
      active[normLabel(l)] = true;
    });
    let links = loadLinks();
    let count = 0;
    Object.keys(links).forEach(function (k) {
      const L = links[k];
      const aOn = !!active[L.a];
      const bOn = !!active[L.b];
      if ((aOn && !bOn) || (bOn && !aOn)) {
        L.w = Math.max(0, (L.w || 0) - LTD_RATE);
        L.ltd = (L.ltd || 0) + 1;
        L.last = Date.now();
        count++;
        if (L.w < 0.02 && (L.uses || 0) < 3) delete links[k];
      }
    });
    saveLinks(links);
    return count;
  }

  /**
   * Learn from a full user interaction:
   * extract tokens, co-activate, optional subject binding.
   */
  function learnFromInteraction(userText, extraLabels) {
    const toks = tokensFromText(userText);
    const labels = toks.concat(extraLabels || []);
    const result = coActivate(labels, 1);
    // mild LTD against non-participants
    depressUnpaired(result.neurons);
    return result;
  }

  /**
   * Pattern completion — given a cue, return linked neurons sorted by weight.
   * Simulates ensemble reactivation.
   */
  function complete(cue, limit) {
    limit = limit || 6;
    const key = normLabel(cue);
    const links = loadLinks();
    const neurons = load();
    const hits = [];

    Object.keys(links).forEach(function (k) {
      const L = links[k];
      if (L.a === key || L.b === key) {
        const other = L.a === key ? L.b : L.a;
        hits.push({
          label: other,
          w: L.w || 0,
          strength: (neurons[other] && neurons[other].strength) || 0
        });
      }
    });

    // also partial string match on neuron labels
    Object.keys(neurons).forEach(function (lab) {
      if (lab !== key && (lab.indexOf(key) !== -1 || key.indexOf(lab) !== -1)) {
        hits.push({ label: lab, w: 0.15, strength: neurons[lab].strength || 0 });
      }
    });

    hits.sort(function (a, b) {
      return (b.w * 2 + b.strength * 0.01) - (a.w * 2 + a.strength * 0.01);
    });

    // unique
    const seen = {};
    const out = [];
    hits.forEach(function (h) {
      if (seen[h.label]) return;
      seen[h.label] = true;
      out.push(h);
    });
    return out.slice(0, limit);
  }

  /**
   * Boost knowledge search using associated concepts (pattern completion).
   */
  function associatedQueries(text) {
    const toks = tokensFromText(text);
    const extra = [];
    toks.slice(0, 5).forEach(function (t) {
      complete(t, 3).forEach(function (h) {
        if (h.w >= 0.15 && extra.indexOf(h.label) === -1) extra.push(h.label);
      });
    });
    return extra.slice(0, 8);
  }

  /** Prune weak/old synapses (sleep-like) */
  function prune(minWeight) {
    minWeight = minWeight == null ? 0.05 : minWeight;
    const links = loadLinks();
    let removed = 0;
    const now = Date.now();
    Object.keys(links).forEach(function (k) {
      const L = links[k];
      const old = now - (L.last || 0) > 7 * 86400000;
      if ((L.w || 0) < minWeight || (old && (L.w || 0) < 0.2)) {
        delete links[k];
        removed++;
      }
    });
    saveLinks(links);
    const m = meta();
    m.lastPrune = now;
    m.pruned = (m.pruned || 0) + removed;
    saveMeta(m);
    return removed;
  }

  function getAll() { return load(); }
  function getCount() { return Object.keys(load()).length; }
  function getLinkCount() { return Object.keys(loadLinks()).length; }

  function getStrongest(n) {
    n = n || 12;
    const all = load();
    return Object.entries(all)
      .sort(function (a, b) { return b[1].strength - a[1].strength; })
      .slice(0, n)
      .map(function (e) {
        return {
          label: e[0],
          strength: e[1].strength,
          uses: e[1].uses,
          lastUsed: e[1].lastUsed
        };
      });
  }

  function getStrongestLinks(n) {
    n = n || 12;
    const links = loadLinks();
    return Object.keys(links)
      .map(function (k) { return links[k]; })
      .sort(function (a, b) { return (b.w || 0) - (a.w || 0); })
      .slice(0, n)
      .map(function (L) {
        return {
          a: L.a,
          b: L.b,
          w: Math.round((L.w || 0) * 1000) / 1000,
          uses: L.uses || 0,
          ltp: L.ltp || 0,
          ltd: L.ltd || 0
        };
      });
  }

  function getStats() {
    const m = meta();
    return {
      neurons: getCount(),
      links: getLinkCount(),
      hebbUpdates: m.hebbUpdates || 0,
      pruned: m.pruned || 0,
      lastHebb: m.lastHebb || null,
      eta: ETA,
      wMax: W_MAX
    };
  }

  function explain() {
    return (
      "**Hebbian learning in Kanairoex**\n\n" +
      "Kanairoex uses association units that strengthen when they fire together " +
      "(Hebb: cells that fire together wire together).\n\n" +
      "**Brain → AI map (built-in)**\n" +
      "• Neuron → perceptron / node\n" +
      "• Dendrites → input weights\n" +
      "• Cell body → weighted sum\n" +
      "• Threshold → activation (ReLU / Sigmoid-style)\n" +
      "• Learning → backprop idea + local Hebbian updates\n" +
      "• Dopamine-like signal → reward / TD-style feedback\n" +
      "• Pruning → dropout-style robustness\n" +
      "• Sleep replay → experience replay of past patterns\n\n" +
      "Ask: **brain AI map** · **what is backpropagation** · **dopamine and RL**"
    );
  }

  function brainAiMap() {
    return (
      "**Your brain as the blueprint for AI**\n\n" +
      "**1. Neuron = Perceptron (node)**\n" +
      "• Dendrites ≈ input weights\n" +
      "• Cell body ≈ sum of weighted inputs\n" +
      "• Action potential threshold ≈ activation function (ReLU / Sigmoid)\n" +
      "• Axon terminals ≈ output to the next layer\n\n" +
      "**2. Learning ≈ Backpropagation + gradient descent**\n" +
      "Hebb: fire together, wire together. In AI, a loss measures error; weights are adjusted backward to reduce that loss. Learning rate = size of each tweak.\n\n" +
      "**3. Dopamine ≈ reward signal (reinforcement learning)**\n" +
      "TD Error ≈ Actual Reward − Expected Reward. Positive surprise strengthens paths; negative weakens them — trial, error, and feedback.\n\n" +
      "**4. Brain waves / pruning ≈ Dropout & normalization**\n" +
      "Pruning unused synapses ≈ Dropout (turn off units in training to avoid overfitting). Normalization stabilizes activations.\n\n" +
      "**5. Sleep consolidation ≈ experience replay**\n" +
      "Hippocampal replay to cortex ≈ replaying stored experiences so new learning does not erase old skills.\n\n" +
      "**Where AI differs**\n" +
      "Brains use strong inductive biases and rich chemical synapses; many AIs start from random weights and need far more examples.\n\n" +
      "**Frontier**\n" +
      "Spiking neural networks and neuromorphic chips aim for timing-based, energy-efficient computation closer to biology.\n\n" +
      "_Facts are also stored in Knowledge — try: what is backpropagation · what is experience replay_"
    );
  }


  function clear() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LINKS_KEY);
    localStorage.removeItem(TRACE_KEY);
    localStorage.removeItem(META_KEY);
  }

  return {
    activate: activate,
    coActivate: coActivate,
    hebbPair: hebbPair,
    depressUnpaired: depressUnpaired,
    learnFromInteraction: learnFromInteraction,
    complete: complete,
    associatedQueries: associatedQueries,
    prune: prune,
    getAll: getAll,
    getCount: getCount,
    getLinkCount: getLinkCount,
    getStrongest: getStrongest,
    getStrongestLinks: getStrongestLinks,
    getStats: getStats,
    explain: explain,
    brainAiMap: brainAiMap,
    clear: clear,
    // constants for UI
    ETA: ETA,
    W_MAX: W_MAX
  };
})();
