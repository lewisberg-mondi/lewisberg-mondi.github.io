const CorePositionalEncoding = (() => {
  function sinusoidal(seqLen, dim) {
    const pe = CoreMatrix.zeros(seqLen, dim);
    for (let pos = 0; pos < seqLen; pos++) {
      for (let i = 0; i < dim; i += 2) {
        const div = Math.pow(10000, i / dim);
        pe.data[pos * dim + i] = Math.sin(pos / div);
        if (i + 1 < dim) pe.data[pos * dim + i + 1] = Math.cos(pos / div);
      }
    }
    return pe;
  }
  function add(x, pe) {
    // x and pe: (seq, dim)
    const out = CoreMatrix.zeros(x.rows, x.cols);
    for (let i = 0; i < x.data.length; i++) {
      out.data[i] = x.data[i] + (pe.data[i] || 0);
    }
    return out;
  }
  return { sinusoidal, add };
})();
if (typeof module !== 'undefined') module.exports = CorePositionalEncoding;
