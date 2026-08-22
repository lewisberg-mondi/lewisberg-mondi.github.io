const CoreSampler = (() => {
  function sample(logits, temperature = 1.0) {
    const scaled = new Float64Array(logits.length);
    const t = Math.max(0.05, temperature);
    for (let i = 0; i < logits.length; i++) scaled[i] = logits[i] / t;
    const p = CoreActivations.softmax(scaled);
    let r = (typeof CoreRandom !== 'undefined' ? CoreRandom.next() : Math.random());
    for (let i = 0; i < p.length; i++) {
      r -= p[i];
      if (r <= 0) return i;
    }
    return p.length - 1;
  }
  function greedy(logits) {
    let best = 0;
    for (let i = 1; i < logits.length; i++) if (logits[i] > logits[best]) best = i;
    return best;
  }
  function topK(logits, k = 5, temperature = 1.0) {
    const pairs = [];
    for (let i = 0; i < logits.length; i++) pairs.push([logits[i], i]);
    pairs.sort((a, b) => b[0] - a[0]);
    const top = pairs.slice(0, Math.min(k, pairs.length));
    const filtered = new Float64Array(logits.length);
    for (let i = 0; i < filtered.length; i++) filtered[i] = -1e9;
    for (let t = 0; t < top.length; t++) filtered[top[t][1]] = top[t][0];
    return sample(filtered, temperature);
  }
  return { sample, greedy, topK };
})();
if (typeof module !== 'undefined') module.exports = CoreSampler;
