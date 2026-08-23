/**
 * Reference research adapters: Encyclopaedia Britannica + Oxford dictionaries.
 * These are source/navigation integrations. We do not scrape or reproduce
 * copyrighted/paywalled reference articles. Public dictionary data is used
 * for a definition fallback, while official source links are preserved.
 */
const ReferenceResearch = (() => {
  const TIMEOUT = 10000;
  const SOURCES = {
    britannica: q => 'https://www.britannica.com/search?query=' + encodeURIComponent(q),
    oxford: w => 'https://www.oxfordlearnersdictionaries.com/definition/english/' + encodeURIComponent(String(w).toLowerCase().replace(/\s+/g, '-')),
    oed: q => 'https://www.oed.com/search/dictionary/?scope=Entries&q=' + encodeURIComponent(q),
    dictionaryApi: w => 'https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(w)
  };

  async function fetchJson(url) {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), TIMEOUT);
    try {
      const r = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'no-store', signal: c.signal, headers: { Accept: 'application/json' } });
      if (!r.ok) throw Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  }

  function isIntent(text) {
    const raw = String(text || '').trim();
    let m = raw.match(/(?:search|look\s*up|find|check)\s+(?:in\s+)?(?:britannica|encyclopaedia\s+britannica|encyclopedia)\s+(?:for|about|on)?\s*(.+)/i);
    if (m) return { type: 'britannica', query: clean(m[1]) };
    m = raw.match(/(?:search|look\s*up|find|check)\s+(?:in\s+)?(?:oxford\s+dictionary|oxford|oed|oxford\s+english\s+dictionary)\s+(?:for|about|on)?\s*(.+)/i);
    if (m) return { type: 'oxford', query: clean(m[1]) };
    m = raw.match(/(?:britannica|encyclopaedia\s+britannica)\s*[:\-]?\s*(?:about\s+)?(.+)/i);
    if (m && m[1].trim().length > 1) return { type: 'britannica', query: clean(m[1]) };
    m = raw.match(/(?:oxford\s+dictionary|oed)\s*[:\-]?\s*(?:meaning\s+of\s+)?(.+)/i);
    if (m && m[1].trim().length > 1) return { type: 'oxford', query: clean(m[1]) };
    return null;
  }
  function clean(q) { return String(q || '').replace(/[?.!]+$/g, '').replace(/\s+/g, ' ').trim().slice(0, 160); }

  async function dictionaryFallback(word) {
    const w = clean(word).split(/\s+/)[0];
    if (!w) return null;
    try {
      const data = await fetchJson(SOURCES.dictionaryApi(w));
      const e = Array.isArray(data) ? data[0] : null;
      if (!e) return null;
      const meanings = (e.meanings || []).slice(0, 5).map(m => ({
        partOfSpeech: m.partOfSpeech || '', definitions: (m.definitions || []).slice(0, 3).map(d => ({ definition: d.definition || '', example: d.example || '', synonyms: d.synonyms || [] }))
      }));
      return { word: e.word || w, phonetic: e.phonetic || '', meanings };
    } catch (_) { return null; }
  }

  async function search(query, type) {
    const q = clean(query); if (!q) throw Error('Reference search query is empty.');
    if (type === 'britannica') {
      const data = typeof Online !== 'undefined' ? await Online.fetchTopicFull(q) : null;
      const sources = [
        { name: 'Encyclopaedia Britannica', url: SOURCES.britannica(q), official: true },
        ...(data && data.sources ? data.sources : [])
      ];
      const content = data ? (data.content || data.extract || '') : 'Open the official Encyclopaedia Britannica search result for this topic.';
      return { type, query: q, title: (data && data.title) || q, content, sources: dedupe(sources), officialUrl: SOURCES.britannica(q), note: 'Britannica is linked as the authoritative reference; article text is not copied into LocalMind.' };
    }
    const d = await dictionaryFallback(q);
    const word = (d && d.word) || q;
    const lines = ['# Oxford dictionary research: ' + word, '', 'Official Oxford reference: ' + SOURCES.oxford(word), 'OED search: ' + SOURCES.oed(word), ''];
    if (d) {
      if (d.phonetic) lines.push('Pronunciation: ' + d.phonetic, '');
      d.meanings.forEach(m => { lines.push('## ' + m.partOfSpeech); m.definitions.forEach(x => { lines.push('- ' + x.definition); if (x.example) lines.push('  Example: ' + x.example); if (x.synonyms && x.synonyms.length) lines.push('  Synonyms: ' + x.synonyms.slice(0, 8).join(', ')); }); lines.push(''); });
    } else lines.push('A public definition service was unavailable. Use the official Oxford links above.');
    return { type, query: q, title: word, content: lines.join('\n'), sources: [{ name: 'Oxford Learner\'s Dictionaries', url: SOURCES.oxford(word) }, { name: 'Oxford English Dictionary', url: SOURCES.oed(word) }], officialUrl: SOURCES.oxford(word), dictionary: d };
  }

  function dedupe(xs) { const m = new Map(); (xs || []).forEach(s => { if (s && s.url) m.set(s.url, s); }); return [...m.values()]; }
  function save(result) {
    if (!result) return;
    if (typeof Online !== 'undefined' && Online.storeInMemory) Online.storeInMemory(result.title || result.query, result.content || '', (result.sources && result.sources[0] && result.sources[0].url) || result.officialUrl || 'reference');
    try { localStorage.setItem('localmind_reference_' + Date.now(), JSON.stringify(result)); } catch (_) {}
  }
  return { isIntent, search, save, urls: SOURCES };
})();
if (typeof window !== 'undefined') window.ReferenceResearch = ReferenceResearch;
