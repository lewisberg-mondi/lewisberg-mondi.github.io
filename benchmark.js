/* Kanairoex benchmark runner — deterministic browser-safe regression checks. */
const KanairoexBenchmark = (() => {
  function run() {
    const checks = [];
    const test = (name, fn) => { try { const value = fn(); checks.push({ name, passed: value !== false, detail: value === false ? 'returned false' : '' }); } catch (e) { checks.push({ name, passed: false, detail: e && e.message || String(e) }); } };
    test('planner classifies image search', () => BrainPlanner && BrainPlanner.classify('look up image of Jesus').includes('image'));
    test('planner classifies research', () => BrainPlanner && BrainPlanner.classify('research current climate change data').includes('web'));
    test('planner detects multi-step complexity', () => (BrainPlanner.complexity('research and compare current prices and verify sources', BrainPlanner.classify('research and compare current prices and verify sources')) >= 3));
    test('context entity extraction', () => BrainContext.extractEntities('Jesus Christ visited Jerusalem').length > 0);
    test('evidence source ranking', () => BrainEvidence.sourceScore('https://en.wikipedia.org/wiki/Jesus').score >= 0.9);
    test('verifier routing check', () => BrainVerifier.verify({ plan: { types: ['image'] } }, { reply: 'IMAGE_SEARCH:Jesus', imageSearch: { query: 'Jesus' } }).passed);
    const passed = checks.every(x => x.passed);
    return { passed, checks, ranAt: new Date().toISOString(), version: '39.0.0' };
  }
  return { run };
})();
if (typeof window !== 'undefined') window.KanairoexBenchmark = KanairoexBenchmark;
if (typeof module !== 'undefined') module.exports = KanairoexBenchmark;
