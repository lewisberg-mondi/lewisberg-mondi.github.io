/** Simple backprop helpers for Linear layers */
const CoreBackprop = (() => {
  function linearBackward(gradOut, x, W) {
    // gradOut: (outDim), x: (inDim), W: matrix (outDim, inDim)
    // dW[i,j] = gradOut[i] * x[j]
    // dx[j] = sum_i W[i,j] * gradOut[i]
    const dW = CoreMatrix.zeros(W.rows, W.cols);
    const dx = new Float64Array(x.length);
    const db = new Float64Array(gradOut.length);
    for (let i = 0; i < W.rows; i++) {
      db[i] = gradOut[i];
      for (let j = 0; j < W.cols; j++) {
        dW.data[i * W.cols + j] = gradOut[i] * x[j];
        dx[j] += W.data[i * W.cols + j] * gradOut[i];
      }
    }
    return { dW, db, dx };
  }
  return { linearBackward };
})();
if (typeof module !== 'undefined') module.exports = CoreBackprop;
