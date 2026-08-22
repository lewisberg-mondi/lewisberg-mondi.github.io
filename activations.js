const CoreActivations = (() => {
  function relu(x) { return x > 0 ? x : 0; }
  function reluDeriv(x) { return x > 0 ? 1 : 0; }
  function gelu(x) {
    return 0.5 * x * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (x + 0.044715 * x * x * x)));
  }
  function sigmoid(x) { return 1 / (1 + Math.exp(-Math.max(-40, Math.min(40, x)))); }
  function tanh(x) { return Math.tanh(x); }
  function softmax(arr) {
    return (typeof CoreVector !== 'undefined' ? CoreVector.softmax(arr) : (() => {
      let m = -Infinity; for (const v of arr) if (v > m) m = v;
      const e = arr.map(v => Math.exp(v - m));
      const s = e.reduce((a, b) => a + b, 0);
      return e.map(v => v / s);
    })());
  }
  function apply(fn, arr) {
    const o = new Float64Array(arr.length);
    for (let i = 0; i < arr.length; i++) o[i] = fn(arr[i]);
    return o;
  }
  return { relu, reluDeriv, gelu, sigmoid, tanh, softmax, apply };
})();
if (typeof module !== 'undefined') module.exports = CoreActivations;
