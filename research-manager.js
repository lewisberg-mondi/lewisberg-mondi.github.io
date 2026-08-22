/* LocalMind Research Manager: long-form, incremental web research. */
const ResearchManager = (() => {
  const MAX_SOURCES = 6;
  const MAX_CHARS = 90000;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function research(topic, onProgress) {
    const q = String(topic || '').trim();
    if (!q) throw new Error('Research topic is empty.');
    const report = { title:q, sections:[], sources:[], chars:0, researchedAt:new Date().toISOString(), complete:false };
    const progress = typeof onProgress === 'function' ? onProgress : () => {};
    progress({stage:'start', message:'Starting deep research: ' + q});

    const main = await Online.fetchTopicFull(q);
    report.title = main.title || q;
    report.sections.push({title: main.title || q, content: main.content || main.extract || '', source:'Wikipedia'});
    report.sources.push(...(main.sources || []));
    report.chars += (main.content || '').length;
    progress({stage:'source', index:1, total:1, title:main.title, chars:report.chars});

    // Use Wikipedia's search adapter when available to collect related articles.
    let hits = [];
    try { hits = await Online.searchRelatedTopics(q); } catch (_) { hits = []; }
    const seen = new Set([String(main.title || '').toLowerCase()]);
    const candidates = hits.filter(h => h && h.title && !seen.has(h.title.toLowerCase())).slice(0, MAX_SOURCES - 1);
    for (let i=0; i<candidates.length; i++) {
      if (report.chars >= MAX_CHARS) break;
      const h = candidates[i];
      try {
        progress({stage:'source', index:i+2, total:candidates.length+1, title:h.title, chars:report.chars});
        const d = await Online.fetchTopicFull(h.title);
        const text = d.content || d.extract || '';
        if (text) {
          report.sections.push({title:d.title || h.title, content:text, source:'Wikipedia'});
          report.sources.push(...(d.sources || []));
          report.chars += text.length;
        }
      } catch (e) {
        progress({stage:'warning', title:h.title, message:'Skipped source: ' + (e.message || e)});
      }
      await sleep(80);
    }

    // Deduplicate sources and section text.
    const sourceMap = new Map();
    report.sources.forEach(s => { if (s && s.url) sourceMap.set(s.url, s); });
    report.sources = Array.from(sourceMap.values());
    report.sections = report.sections.filter((s, i, a) => a.findIndex(x => x.title.toLowerCase() === s.title.toLowerCase()) === i);
    const content = report.sections.map(s => '## ' + s.title + '\n\n' + s.content).join('\n\n---\n\n').slice(0, MAX_CHARS);
    report.content = '# ' + report.title + '\n\n' + content;
    report.extract = report.content.slice(0, 6000);
    report.chars = report.content.length;
    report.complete = true;
    progress({stage:'complete', message:'Research complete', sections:report.sections.length, chars:report.chars});
    return report;
  }
  return { research };
})();
if (typeof window !== 'undefined') window.ResearchManager = ResearchManager;
