const CoreEmbedding = (() => {
  function Embedding(vocabSize, dim, scale = 0.02) {
    const weight = CoreMatrix.randn(vocabSize, dim, scale);
    function forward(tokenIds) {
      // tokenIds: number[] -> matrix (seq, dim)
      const out = CoreMatrix.zeros(tokenIds.length, dim);
      for (let t = 0; t < tokenIds.length; t++) {
        const id = Math.max(0, Math.min(vocabSize - 1, tokenIds[t] | 0));
        for (let d = 0; d < dim; d++) {
          out.data[t * dim + d] = weight.data[id * dim + d];
        }
      }
      return out;
    }
    function parameters() { return { weight }; }
    return { forward, parameters, dim, vocabSize };
  }
  return { Embedding };
})();
if (typeof module !== 'undefined') module.exports = CoreEmbedding;
