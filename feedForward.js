const CoreFeedForward = (() => {
  function FeedForward(dim, hiddenMult = 2) {
    const hidden = dim * hiddenMult;
    const fc1 = CoreLayers.Linear(dim, hidden);
    const fc2 = CoreLayers.Linear(hidden, dim);
    function forward(x) {
      // x: (seq, dim)
      const h = fc1.forward(x);
      for (let i = 0; i < h.data.length; i++) h.data[i] = CoreActivations.gelu(h.data[i]);
      return fc2.forward(h);
    }
    function parameters() { return [fc1.parameters(), fc2.parameters()]; }
    return { forward, parameters };
  }
  return { FeedForward };
})();
if (typeof module !== 'undefined') module.exports = CoreFeedForward;
