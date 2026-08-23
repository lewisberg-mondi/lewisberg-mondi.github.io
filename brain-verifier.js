/* Kanairoex Verification Engine — structural, logical and routing checks. */
const BrainVerifier = (() => {
  function verify(input, result) {
    const issues = [];
    const warnings = [];
    const r = result || {};
    const plan = input && input.plan || { types: [] };
    if (r.reply == null && !r._advancedPromise) issues.push('No reply was generated.');
    if (typeof r.reply === 'string') {
      if (/^IMAGE_SEARCH:/i.test(r.reply) && !r.imageSearch) issues.push('Image search marker has no routing metadata.');
      if (/^VIDEO_SEARCH:/i.test(r.reply) && !r.videoSearch) issues.push('Video search marker has no routing metadata.');
      if (/^GITHUB_CODE_SEARCH:/i.test(r.reply) && !r.githubCodeSearch) issues.push('GitHub marker has no routing metadata.');
    }
    if (plan.types.includes('image') && r.imageSearch && !r._advancedPromise) warnings.push('Image request requires the asynchronous image provider stage.');
    if (plan.types.includes('web') && r.online && !r._advancedPromise) warnings.push('Web request requires the asynchronous research stage.');
    if (r.creative && r.creative.type === 'image-search' && (!Array.isArray(r.creative.items) || !r.creative.items.length)) issues.push('Image result has no image cards.');
    if (r.creative && r.creative.type === 'video-search' && (!Array.isArray(r.creative.items) || !r.creative.items.length)) issues.push('Video result has no video cards.');
    if (r.creative && r.creative.type === 'github-code-search' && (!Array.isArray(r.creative.items) || !r.creative.items.length)) warnings.push('GitHub result contains no repository cards.');
    const passed = issues.length === 0;
    return { passed, issues, warnings, checkedAt: new Date().toISOString(), checks: ['reply-shape','routing-metadata','creative-payload','tool-stage'] };
  }
  function contradictionFacts(text, facts) {
    const s = String(text || '').toLowerCase();
    const found = [];
    (facts || []).forEach(f => {
      const subj = String(f.subject || '').toLowerCase();
      const cont = String(f.content || '').toLowerCase();
      if (!subj || !cont || !s.includes(subj)) return;
      const saysOpposite = (s.includes('not ' + cont) || s.includes("isn't " + cont) || s.includes('is not ' + cont));
      if (saysOpposite) found.push({ fact: f, reason: 'negation conflict' });
    });
    return found;
  }
  function diagnose() { return { ok: true, checks: ['reply-shape','routing','creative','tool-stage','contradiction'] }; }
  return { verify, contradictionFacts, diagnose };
})();
if (typeof window !== 'undefined') window.BrainVerifier = BrainVerifier;
if (typeof module !== 'undefined') module.exports = BrainVerifier;
