/* Kanairoex Brain Planner — intent, complexity, tool selection and missing-information analysis. */
const BrainPlanner = (() => {
  const patterns = {
    image: /\b(image|images|photo|photos|picture|pictures|photograph|pictures)\b/i,
    video: /\b(video|videos|watch|clip|clips)\b/i,
    web: /\b(look\s*up|search|online|research|latest|current|today|news|browse)\b/i,
    code: /\b(code|coding|script|javascript|html|css|debug|implement|github|repository)\b/i,
    math: /\b(calculate|compute|equation|percentage|percent|sum|divide|multiply|average)\b|\d+\s*[+\-*/%]\s*\d+/i,
    document: /\b(file|document|pdf|upload|summarize|summary|spreadsheet)\b/i,
    teach: /\b(explain|teach|learn|remember|why|how)\b/i,
    compare: /\b(compare|versus|vs\.?|difference|best|better|rank)\b/i,
    create: /\b(create|build|make|generate|write|design)\b/i
  };
  function classify(text) {
    const s = String(text || '');
    const types = Object.keys(patterns).filter(k => patterns[k].test(s));
    if (!types.length) return ['general'];
    return types.slice(0, 4);
  }
  function complexity(text, types) {
    const s = String(text || '');
    let score = 1;
    if (s.length > 120) score++;
    if (s.length > 280) score++;
    if ((s.match(/\band\b|\bthen\b|\bafter\b|\bwhile\b/gi) || []).length >= 2) score++;
    if (types.length >= 2) score++;
    if (/\b(compare|research|analy[sz]e|verify|deep|detailed|step[- ]by[- ]step)\b/i.test(s)) score++;
    return Math.min(5, score);
  }
  function missing(text, types) {
    const s = String(text || '').toLowerCase();
    const out = [];
    if (types.includes('math') && /how much|cost|energy|power|budget|percentage/i.test(s) && !/\d/.test(s)) out.push('numeric inputs or assumptions');
    if (types.includes('compare') && !/\b(compare|versus|vs|difference)\b/i.test(s)) out.push('comparison targets');
    if (types.includes('document') && /summarize|summary/i.test(s) && !/file|document|upload|attached/i.test(s)) out.push('the document or its contents');
    return out;
  }
  function steps(types, complexityLevel) {
    const base = ['Understand objective', 'Load relevant context and memory'];
    if (types.includes('web') || types.includes('image') || types.includes('video')) base.push('Select and query external sources');
    if (types.includes('document')) base.push('Extract and rank document evidence');
    if (types.includes('math')) base.push('Compute with explicit assumptions and verify');
    if (types.includes('code')) base.push('Inspect requirements, implement, and test edge cases');
    if (types.includes('compare')) base.push('Normalize criteria and compare evidence');
    if (complexityLevel >= 3) base.push('Cross-check important claims and contradictions');
    base.push('Synthesize a clear answer and state uncertainty');
    return base;
  }
  function plan(text, context) {
    const types = classify(text);
    const level = complexity(text, types);
    const missingInfo = missing(text, types);
    const tools = [];
    if (types.includes('image')) tools.push('ImageResearch');
    if (types.includes('video')) tools.push('VideoResearch');
    if (types.includes('web')) tools.push('Online/ResearchManager');
    if (types.includes('code')) tools.push('GitHubCodeResearch/Coder');
    if (types.includes('document')) tools.push('Files/StudyHub');
    if (types.includes('math')) tools.push('Math/Verifier');
    if (types.includes('teach')) tools.push('Knowledge/RAG');
    return {
      types, complexity: level, tools,
      missing: missingInfo,
      steps: steps(types, level),
      activeTopic: context && context.activeTopic || '',
      requiresVerification: level >= 3 || types.some(x => ['web','compare','math','code'].includes(x)),
      createdAt: new Date().toISOString()
    };
  }
  function explain(plan) {
    return 'Plan: ' + plan.types.join(' + ') + ' · complexity ' + plan.complexity + '\n' + plan.steps.map((x,i) => '→ ' + (i+1) + '. ' + x).join('\n');
  }
  return { classify, complexity, missing, plan, explain };
})();
if (typeof window !== 'undefined') window.BrainPlanner = BrainPlanner;
if (typeof module !== 'undefined') module.exports = BrainPlanner;
