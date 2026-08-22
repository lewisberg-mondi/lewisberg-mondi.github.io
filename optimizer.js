/** SGD and simple Adam */
const CoreOptimizer = (() => {
  function SGD(params, lr = 0.01) {
    function step(grads) {
      // grads: array of Float64Array matching params
      for (let i = 0; i < params.length; i++) {
        const p = params[i], g = grads[i];
        for (let j = 0; j < p.length; j++) p[j] -= lr * g[j];
      }
    }
    return { step, lr };
  }
  function Adam(params, lr = 0.001, beta1 = 0.9, beta2 = 0.999, eps = 1e-8) {
    const m = params.map(p => new Float64Array(p.length));
    const v = params.map(p => new Float64Array(p.length));
    let t = 0;
    function step(grads) {
      t++;
      for (let i = 0; i < params.length; i++) {
        const p = params[i], g = grads[i];
        for (let j = 0; j < p.length; j++) {
          m[i][j] = beta1 * m[i][j] + (1 - beta1) * g[j];
          v[i][j] = beta2 * v[i][j] + (1 - beta2) * g[j] * g[j];
          const mHat = m[i][j] / (1 - Math.pow(beta1, t));
          const vHat = v[i][j] / (1 - Math.pow(beta2, t));
          p[j] -= lr * mHat / (Math.sqrt(vHat) + eps);
        }
      }
    }
    return { step, lr };
  }
  return { SGD, Adam };
})();
if (typeof module !== 'undefined') module.exports = CoreOptimizer;
