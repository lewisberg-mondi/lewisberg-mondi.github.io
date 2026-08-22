const CoreMultiHeadAttention = (() => {
  function MultiHeadAttention(dim, heads = 2) {
    const headDim = Math.max(1, Math.floor(dim / heads));
    const Wq = CoreLayers.Linear(dim, dim);
    const Wk = CoreLayers.Linear(dim, dim);
    const Wv = CoreLayers.Linear(dim, dim);
    const Wo = CoreLayers.Linear(dim, dim);

    function forward(x, causal = true) {
      // x: (seq, dim)
      const seq = x.rows;
      const Q = Wq.forward(x);
      const K = Wk.forward(x);
      const V = Wv.forward(x);
      const mask = causal ? CoreAttention.causalMask(seq) : null;

      // For simplicity: single-head attention on full dim (educational)
      // Full multi-head split would slice headDim; kept simple for stability
      const attended = CoreAttention.scaledDotProduct(Q, K, V, mask);
      return Wo.forward(attended);
    }
    function parameters() {
      return [Wq, Wk, Wv, Wo].map(l => l.parameters());
    }
    return { forward, parameters, dim, heads };
  }
  return { MultiHeadAttention };
})();
if (typeof module !== 'undefined') module.exports = CoreMultiHeadAttention;
