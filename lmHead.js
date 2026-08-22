const CoreLMHead = (() => {
  function LMHead(dim, vocabSize) {
    const proj = CoreLayers.Linear(dim, vocabSize, 0.02);
    function forward(hidden) {
      // hidden: (seq, dim) -> logits (seq, vocab)
      return proj.forward(hidden);
    }
    function logitsForLast(hidden) {
      const seq = hidden.rows;
      const dim = hidden.cols;
      const last = new Float64Array(dim);
      for (let d = 0; d < dim; d++) last[d] = hidden.data[(seq - 1) * dim + d];
      return proj.forward(last); // (vocab,)
    }
    return { forward, logitsForLast, proj };
  }
  return { LMHead };
})();
if (typeof module !== 'undefined') module.exports = CoreLMHead;
