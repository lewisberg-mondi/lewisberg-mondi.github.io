/** Lightweight vector helpers */
const CoreVector = (() => {
  function dot(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }
  function add(a, b) {
    const o = new Float64Array(a.length);
    for (let i = 0; i < a.length; i++) o[i] = a[i] + b[i];
    return o;
  }
  function scale(a, k) {
    const o = new Float64Array(a.length);
    for (let i = 0; i < a.length; i++) o[i] = a[i] * k;
    return o;
  }
  function norm(a) {
    return Math.sqrt(dot(a, a));
  }
  function softmax(logits) {
    let max = -Infinity;
    for (let i = 0; i < logits.length; i++) if (logits[i] > max) max = logits[i];
    const e = new Float64Array(logits.length);
    let sum = 0;
    for (let i = 0; i < logits.length; i++) {
      e[i] = Math.exp(logits[i] - max);
      sum += e[i];
    }
    for (let i = 0; i < e.length; i++) e[i] /= sum;
    return e;
  }
  return { dot, add, scale, norm, softmax };
})();
if (typeof module !== 'undefined') module.exports = CoreVector;
