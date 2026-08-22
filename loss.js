const CoreLoss = (() => {
  function crossEntropy(logits, targetIndex) {
    const p = CoreActivations.softmax(logits);
    return -Math.log(Math.max(1e-12, p[targetIndex]));
  }
  function mse(pred, target) {
    let s = 0;
    for (let i = 0; i < pred.length; i++) {
      const d = pred[i] - target[i];
      s += d * d;
    }
    return s / pred.length;
  }
  return { crossEntropy, mse };
})();
if (typeof module !== 'undefined') module.exports = CoreLoss;
