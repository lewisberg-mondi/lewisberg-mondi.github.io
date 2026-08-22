/** Scaled dot-product attention — returns output and weight matrix */
const CoreAttention = (() => {
  function scaledDotProduct(Q, K, V, mask = null) {
    // Q,K,V: (seq, dim)
    const seq = Q.rows, dim = Q.cols;
    const scale = 1 / Math.sqrt(Math.max(1, dim));
    const KT = CoreMatrix.transpose(K);
    const scores = CoreMatrix.matmul(Q, KT);
    for (let i = 0; i < scores.data.length; i++) scores.data[i] *= scale;
    if (mask) {
      for (let i = 0; i < seq; i++)
        for (let j = 0; j < seq; j++)
          if (mask[i * seq + j] === 0) scores.data[i * seq + j] = -1e9;
    }
    const attn = CoreMatrix.zeros(seq, seq);
    for (let i = 0; i < seq; i++) {
      const row = Array.prototype.slice.call(scores.data, i * seq, (i + 1) * seq);
      const sm = CoreActivations.softmax(row);
      for (let j = 0; j < seq; j++) attn.data[i * seq + j] = sm[j];
    }
    const out = CoreMatrix.matmul(attn, V);
    out.attnWeights = attn; // (seq, seq) for demos
    return out;
  }
  function causalMask(seq) {
    const m = new Uint8Array(seq * seq);
    for (let i = 0; i < seq; i++)
      for (let j = 0; j <= i; j++) m[i * seq + j] = 1;
    return m;
  }
  /** Build Q=K=V from token embedding matrix rows for a real attention demo */
  function fromTokenVectors(vectors) {
    // vectors: array of Float64Array or arrays, length = seq, each dim
    const seq = vectors.length;
    const dim = vectors[0].length;
    const M = CoreMatrix.zeros(seq, dim);
    for (let i = 0; i < seq; i++)
      for (let d = 0; d < dim; d++) M.data[i * dim + d] = vectors[i][d];
    return scaledDotProduct(M, M, M, null);
  }
  return { scaledDotProduct, causalMask, fromTokenVectors };
})();
if (typeof module !== 'undefined') module.exports = CoreAttention;
