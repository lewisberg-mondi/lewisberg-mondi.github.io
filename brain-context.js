/* Kanairoex Brain Context — lightweight conversation state, active entities and durable turn metadata. */
const BrainContext = (() => {
  const KEY = 'kanairoex_brain_context_v1';
  const MAX_TURNS = 12;
  const MAX_ENTITIES = 20;

  function safeLoad() {
    try {
      const raw = localStorage.getItem(KEY);
      const d = raw ? JSON.parse(raw) : null;
      return d && typeof d === 'object' ? d : { turns: [], entities: [], activeTopic: '', updatedAt: 0 };
    } catch (_) {
      return { turns: [], entities: [], activeTopic: '', updatedAt: 0 };
    }
  }
  function safeSave(d) {
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (_) {}
    return d;
  }
  function cleanText(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
  function extractEntities(text) {
    const s = cleanText(text);
    const out = [];
    const add = x => {
      const v = cleanText(x).replace(/^["'`]+|["'`.,!?]+$/g, '');
      if (v.length < 2 || v.length > 80) return;
      if (!out.some(e => e.toLowerCase() === v.toLowerCase())) out.push(v);
    };
    // Proper-name-ish phrases and quoted topics.
    (s.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,4}\b/g) || []).forEach(add);
    (s.match(/["“](.{2,80})["”]/g) || []).forEach(x => add(x.slice(1, -1)));
    return out.slice(0, MAX_ENTITIES);
  }
  function resolveReferences(text, state) {
    const s = cleanText(text);
    const entities = Array.isArray(state.entities) ? state.entities : [];
    const pronouns = /\b(he|she|they|it|him|her|them|his|hers|its|their|that|this|there|those|these)\b/i.test(s);
    if (!pronouns) return { resolved: s, references: [] };
    const recent = entities.slice(-6).reverse();
    if (!recent.length) return { resolved: s, references: [] };
    // Conservative: only annotate context; never rewrite user text in a way that changes meaning.
    return { resolved: s, references: recent.slice(0, 3) };
  }
  function getRecent(limit = 8) {
    const s = safeLoad();
    return (s.turns || []).slice(-(Math.max(1, Number(limit) || 8))).map(x => ({ ...x }));
  }
  function build(text, limit = 8) {
    const state = safeLoad();
    const refs = resolveReferences(text, state);
    return {
      activeTopic: state.activeTopic || '',
      recentTurns: getRecent(limit),
      entities: (state.entities || []).slice(-MAX_ENTITIES),
      references: refs.references,
      normalizedInput: refs.resolved,
      createdAt: new Date().toISOString()
    };
  }
  function rememberTurn(userText, assistantText, meta) {
    const state = safeLoad();
    const user = cleanText(userText);
    const assistant = cleanText(assistantText).slice(0, 1800);
    const ents = extractEntities(user + ' ' + assistant);
    const all = (state.entities || []).concat(ents);
    const unique = [];
    all.forEach(e => { if (!unique.some(x => x.toLowerCase() === e.toLowerCase())) unique.push(e); });
    const topic = (meta && meta.activeTopic) || (ents[0] || state.activeTopic || user.slice(0, 80));
    state.turns = (state.turns || []).concat([{ role: 'user', content: user.slice(0, 1200), ts: Date.now(), intent: meta && meta.intent || null }]).slice(-MAX_TURNS);
    state.turns = state.turns.concat([{ role: 'assistant', content: assistant, ts: Date.now() }]).slice(-MAX_TURNS);
    state.entities = unique.slice(-MAX_ENTITIES);
    state.activeTopic = cleanText(topic).slice(0, 120);
    state.updatedAt = Date.now();
    return safeSave(state);
  }
  function clear() { try { localStorage.removeItem(KEY); } catch (_) {} }
  function diagnose() {
    const s = safeLoad();
    return { ok: true, key: KEY, turns: (s.turns || []).length, entities: (s.entities || []).length, activeTopic: s.activeTopic || '', updatedAt: s.updatedAt || 0 };
  }
  return { build, getRecent, rememberTurn, extractEntities, resolveReferences, clear, diagnose };
})();
if (typeof window !== 'undefined') window.BrainContext = BrainContext;
if (typeof module !== 'undefined') module.exports = BrainContext;
