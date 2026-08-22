/** Linear / Dense layer */
const CoreLayers = (() => {
  function Linear(inDim, outDim, scale = 0.02) {
    const W = CoreMatrix.randn(outDim, inDim, scale);
    const b = new Float64Array(outDim);
    function forward(x) {
      // x: Float64Array length inDim, or matrix (batch, inDim)
      if (x.rows !== undefined) {
        // batch matrix
        const out = CoreMatrix.matmul(x, CoreMatrix.transpose(W));
        for (let i = 0; i < out.rows; i++)
          for (let j = 0; j < out.cols; j++)
            out.data[i * out.cols + j] += b[j];
        return out;
      }
      const y = CoreMatrix.matvec(W, x);
      for (let i = 0; i < y.length; i++) y[i] += b[i];
      return y;
    }
    function parameters() { return { W, b }; }
    return { forward, parameters, inDim, outDim };
  }
  return { Linear };
})();
if (typeof module !== 'undefined') module.exports = CoreLayers;
