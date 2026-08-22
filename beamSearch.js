const CoreBeamSearch = (() => {
  function search(model, head, startIds, maxLen = 20, beamWidth = 3) {
    // Educational beam search — expands candidates by log-prob
    let beams = [{ ids: startIds.slice(), score: 0 }];
    for (let step = 0; step < maxLen; step++) {
      const candidates = [];
      for (const beam of beams) {
        const hidden = model.forward(beam.ids);
        const logits = head.logitsForLast(hidden);
        const p = CoreActivations.softmax(logits);
        const top = p.map((v, i) => [Math.log(Math.max(1e-12, v)), i])
          .sort((a, b) => b[0] - a[0])
          .slice(0, beamWidth);
        for (const [lp, id] of top) {
          candidates.push({
            ids: beam.ids.concat([id]),
            score: beam.score + lp
          });
        }
      }
      candidates.sort((a, b) => b.score - a.score);
      beams = candidates.slice(0, beamWidth);
      // stop if all beams ended with eos (id 3)
      if (beams.every(b => b.ids[b.ids.length - 1] === 3)) break;
    }
    return beams[0].ids;
  }
  return { search };
})();
if (typeof module !== 'undefined') module.exports = CoreBeamSearch;
