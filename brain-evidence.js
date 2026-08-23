/* Kanairoex Evidence Engine — source trust, claim signals and calibrated confidence. */
const BrainEvidence = (() => {
  const TRUST = [
    { name: 'primary/official', score: 0.98, re: /\.gov\b|\.go\.[a-z]{2}\b|official|api\.github\.com|github\.com\/[^/]+\/[^/]+/i },
    { name: 'academic/reference', score: 0.92, re: /\.edu\b|wikipedia\.org|wikimedia\.org|britannica|oxford|university|journal|doi\.org/i },
    { name: 'established secondary', score: 0.80, re: /reuters|apnews|bbc|nytimes|nature\.com|who\.int|un\.org/i },
    { name: 'community', score: 0.60, re: /reddit|forum|blog|medium\.com/i }
  ];
  function sourceScore(url, name) {
    const s = String(url || '') + ' ' + String(name || '');
    for (const t of TRUST) if (t.re.test(s)) return { score: t.score, tier: t.name };
    return { score: 0.50, tier: 'unknown' };
  }
  function sourcesFrom(result) {
    const out = [];
    if (result && Array.isArray(result.sources)) result.sources.forEach(s => out.push({ url: s, name: s }));
    if (result && result.creative && Array.isArray(result.creative.items)) result.creative.items.forEach(x => out.push({ url: x.sourceUrl || x.url, name: x.source || x.title }));
    if (result && result.creative && Array.isArray(result.creative.sources)) result.creative.sources.forEach(x => out.push(x));
    if (result && result.online) out.push({ url: result.online.url || '', name: 'online research' });
    return out.filter(x => x.url || x.name);
  }
  function claims(text) {
    const s = String(text || '').replace(/```[\s\S]*?```/g, '');
    return s.split(/(?<=[.!?])\s+/).map(x => x.trim()).filter(x => x.length >= 25 && !/^https?:\/\//i.test(x)).slice(0, 30);
  }
  function assess(input, result) {
    const src = sourcesFrom(result);
    const scored = src.map(x => ({ ...x, ...sourceScore(x.url, x.name) }));
    const avg = scored.length ? scored.reduce((a,b) => a + b.score, 0) / scored.length : 0.52;
    const claimCount = claims(result && result.reply);
    const type = input && input.plan && input.plan.types || [];
    let confidence = avg;
    if (type.includes('math') && /verified|calculated|calculation/i.test(String(result && result.thinking))) confidence += 0.12;
    if (type.includes('image') && result && result.creative && Array.isArray(result.creative.items)) confidence += result.creative.items.length ? 0.10 : -0.15;
    if (result && result._error) confidence -= 0.20;
    if (!src.length && (type.includes('web') || type.includes('compare'))) confidence -= 0.20;
    confidence = Math.max(0, Math.min(0.99, confidence));
    return {
      confidence: Number(confidence.toFixed(2)),
      level: confidence >= 0.90 ? 'very strong' : confidence >= 0.75 ? 'strong' : confidence >= 0.55 ? 'moderate' : confidence >= 0.35 ? 'weak' : 'unknown',
      sourceCount: scored.length,
      sources: scored.slice(0, 12),
      claimCount,
      caveat: (!src.length && claimCount.length) ? 'No external source metadata was attached; treat factual claims as model/offline knowledge or inference.' : ''
    };
  }
  function rank(sources) { return (sources || []).slice().sort((a,b) => (b.score || 0) - (a.score || 0)); }
  return { assess, sourceScore, sourcesFrom, claims, rank };
})();
if (typeof window !== 'undefined') window.BrainEvidence = BrainEvidence;
if (typeof module !== 'undefined') module.exports = BrainEvidence;
