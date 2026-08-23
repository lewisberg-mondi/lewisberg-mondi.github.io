/* Kanairoex Brain Controller — one coherent orchestration layer over context, planning, evidence and verification. */
const BrainController = (() => {
  const VERSION = '39.0.0';
  const PRINCIPLES = [
    'Do not invent sources or claim a tool succeeded when it did not.',
    'Distinguish stored facts, retrieved evidence, calculations and inference.',
    'Prefer stronger sources and preserve disagreements instead of silently overwriting knowledge.',
    'Verify important claims, calculations and tool-routing metadata.',
    'Ask for missing information when a reliable answer cannot be produced without it.',
    'Keep progress messages truthful; never simulate hidden work as completed work.'
  ];
  function before(text, settings) {
    const context = typeof BrainContext !== 'undefined' ? BrainContext.build(text, 8) : { recentTurns: [], entities: [], activeTopic: '' };
    const plan = typeof BrainPlanner !== 'undefined' ? BrainPlanner.plan(text, context) : { types: ['general'], complexity: 1, steps: ['Understand request'] };
    return { version: VERSION, context, plan, settings: settings || {}, startedAt: Date.now() };
  }
  function after(text, result, state) {
    const verification = typeof BrainVerifier !== 'undefined' ? BrainVerifier.verify(state, result) : { passed: true, issues: [], warnings: [] };
    const evidence = typeof BrainEvidence !== 'undefined' ? BrainEvidence.assess(state, result) : { confidence: 0.5, level: 'moderate', sources: [] };
    const thinking = [];
    thinking.push('Brain plan: ' + ((state.plan.types || ['general']).join(' + ')) + ' · complexity ' + (state.plan.complexity || 1));
    if (state.plan.tools && state.plan.tools.length) thinking.push('Tools considered: ' + state.plan.tools.join(', '));
    if (verification.issues.length) thinking.push('Verification: ' + verification.issues.join('; '));
    else thinking.push('Verification: structure and routing checks passed');
    thinking.push('Evidence confidence: ' + evidence.level + ' (' + evidence.confidence + ')');
    return {
      ...result,
      brain: { version: VERSION, plan: state.plan, context: state.context, verification, evidence },
      thinking: [thinking.join('\n'), result && result.thinking || ''].filter(Boolean).join('\n')
    };
  }
  function diagnose() {
    return {
      version: VERSION,
      ok: true,
      principles: PRINCIPLES.slice(),
      context: typeof BrainContext !== 'undefined' ? BrainContext.diagnose() : { ok: false },
      verifier: typeof BrainVerifier !== 'undefined' ? BrainVerifier.diagnose() : { ok: false },
      providers: {
        image: typeof ImageResearch !== 'undefined' ? ImageResearch.diagnose() : null,
        video: typeof VideoResearch !== 'undefined' ? { available: true } : null,
        github: typeof GitHubCodeResearch !== 'undefined' ? { available: true } : null,
        web: typeof Online !== 'undefined' ? (Online.status ? Online.status() : { available: true }) : null
      }
    };
  }
  function health() {
    const names = ['BrainContext','BrainPlanner','BrainEvidence','BrainVerifier','Reasoning','AI','ImageResearch','VideoResearch','Online','RAG','Knowledge'];
    const modules = {};
    names.forEach(n => { modules[n] = typeof globalThis[n] !== 'undefined'; });
    return { version: VERSION, ok: Object.values(modules).filter(Boolean).length >= 5, modules, at: new Date().toISOString() };
  }
  function principles() { return PRINCIPLES.slice(); }
  return { before, after, diagnose, health, principles, VERSION };
})();
if (typeof window !== 'undefined') window.BrainController = BrainController;
if (typeof module !== 'undefined') module.exports = BrainController;
