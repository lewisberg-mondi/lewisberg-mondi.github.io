const CoreTransformer = (() => {
  function Transformer(opts = {}) {
    const dim = opts.dim || 32;
    const layers = opts.layers || 2;
    const heads = opts.heads || 2;
    const vocabSize = opts.vocabSize || (typeof CoreTokenizer !== 'undefined' ? CoreTokenizer.vocabSize() : 64);
    const maxSeq = opts.maxSeq || 64;

    const embed = CoreEmbedding.Embedding(vocabSize, dim);
    const blocks = [];
    for (let i = 0; i < layers; i++) blocks.push(CoreTransformerBlock.TransformerBlock(dim, heads));
    const lnF = CoreLayerNorm.LayerNorm(dim);

    function forward(tokenIds) {
      const seq = Math.min(tokenIds.length, maxSeq);
      const ids = tokenIds.slice(0, seq);
      let x = embed.forward(ids);
      const pe = CorePositionalEncoding.sinusoidal(seq, dim);
      x = CorePositionalEncoding.add(x, pe);
      for (const block of blocks) x = block.forward(x);
      x = lnF.forward(x);
      return x; // (seq, dim)
    }

    return { forward, embed, blocks, dim, vocabSize, maxSeq };
  }
  return { Transformer };
})();
if (typeof module !== 'undefined') module.exports = CoreTransformer;
