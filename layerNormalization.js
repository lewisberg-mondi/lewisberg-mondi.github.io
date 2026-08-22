const CoreLayerNorm = (() => {
  function LayerNorm(dim, eps = 1e-5) {
    const gamma = new Float64Array(dim); gamma.fill(1);
    const beta = new Float64Array(dim);
    function forward(x) {
      // x: (seq, dim)
      const out = CoreMatrix.zeros(x.rows, x.cols);
      for (let t = 0; t < x.rows; t++) {
        let mean = 0, var_ = 0;
        for (let d = 0; d < dim; d++) mean += x.data[t * dim + d];
        mean /= dim;
        for (let d = 0; d < dim; d++) {
          const diff = x.data[t * dim + d] - mean;
          var_ += diff * diff;
        }
        var_ /= dim;
        const inv = 1 / Math.sqrt(var_ + eps);
        for (let d = 0; d < dim; d++) {
          out.data[t * dim + d] = gamma[d] * (x.data[t * dim + d] - mean) * inv + beta[d];
        }
      }
      return out;
    }
    return { forward, gamma, beta };
  }
  return { LayerNorm };
})();
if (typeof module !== 'undefined') module.exports = CoreLayerNorm;
