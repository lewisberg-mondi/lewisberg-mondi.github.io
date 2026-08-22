const CoreTransformerBlock = (() => {
  function TransformerBlock(dim, heads = 2) {
    const ln1 = CoreLayerNorm.LayerNorm(dim);
    const attn = CoreMultiHeadAttention.MultiHeadAttention(dim, heads);
    const ln2 = CoreLayerNorm.LayerNorm(dim);
    const ffn = CoreFeedForward.FeedForward(dim);
    function forward(x) {
      // Pre-norm residual
      const a = attn.forward(ln1.forward(x), true);
      const x2 = CoreMatrix.zeros(x.rows, x.cols);
      for (let i = 0; i < x.data.length; i++) x2.data[i] = x.data[i] + a.data[i];
      const f = ffn.forward(ln2.forward(x2));
      const out = CoreMatrix.zeros(x.rows, x.cols);
      for (let i = 0; i < x.data.length; i++) out.data[i] = x2.data[i] + f.data[i];
      return out;
    }
    return { forward, attn, ffn };
  }
  return { TransformerBlock };
})();
if (typeof module !== 'undefined') module.exports = CoreTransformerBlock;
