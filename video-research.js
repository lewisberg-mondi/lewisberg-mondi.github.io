/* LocalMind video research. Uses public Piped API instances; no API key. */
const VideoResearch = (() => {
  const INSTANCES = [
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.tokhmi.xyz',
    'https://pipedapi.moomoo.me',
    'https://pipedapi.syncpundit.io'
  ];
  const timeout = 9000;
  async function fetchJson(url) {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), timeout);
    try { const r = await fetch(url, {mode:'cors', credentials:'omit', cache:'no-store', signal:c.signal, headers:{Accept:'application/json'}}); if(!r.ok) throw new Error('HTTP '+r.status); return await r.json(); }
    finally { clearTimeout(t); }
  }
  async function search(query, limit=8) {
    const q = String(query || '').trim(); if(!q) throw new Error('Video search query is empty.');
    let last = null;
    for (const base of INSTANCES) {
      try {
        const data = await fetchJson(base + '/search?q=' + encodeURIComponent(q) + '&filter=videos');
        const items = Array.isArray(data.items) ? data.items : [];
        const videos = items.filter(x => x && (x.type === 'stream' || x.url || x.videoId)).slice(0,limit).map(x => ({
          id:(x.videoId || x.id || (x.url ? String(x.url).split('/').pop() : '')), title:x.title || 'Untitled video', uploader:x.uploaderName || x.uploader || '', duration:x.duration || 0,
          thumbnail:x.thumbnail || x.thumbnailUrl || '', url:x.url && /^https?:/i.test(x.url) ? x.url : ('https://www.youtube.com/watch?v=' + encodeURIComponent(x.videoId || x.id || '')),
          embed:'https://www.youtube.com/embed/' + encodeURIComponent(x.videoId || x.id || ''), source:'Piped/YouTube'
        }));
        if (videos.length) return {query:q, videos, instance:base, researchedAt:new Date().toISOString()};
      } catch(e) { last=e; }
    }
    throw new Error('Video search sources were unavailable.' + (last ? ' Try again when online.' : ''));
  }
  function isIntent(text) {
    const raw=String(text||'').trim();
    let m=raw.match(/(?:search|find|look\s*up)\s+(?:for\s+)?(?:videos?|video)\s+(?:about|on|for)\s+(.+)/i);
    if (!m) m=raw.match(/(?:videos?|video)\s+(?:about|on|for)\s+(.+)/i);
    if (!m) return null;
    return {query:m[1].replace(/[?.!]+$/,'').trim()};
  }
  function saveMetadata(result) {
    if (typeof Online !== 'undefined' && Online.storeInMemory) {
      const text=result.videos.map((v,i)=>`${i+1}. ${v.title} — ${v.uploader}\nWatch: ${v.url}`).join('\n');
      Online.storeInMemory('Videos: '+result.query, text, result.videos[0] ? result.videos[0].url : 'video search');
      try { localStorage.setItem('localmind_video_search_'+Date.now(), JSON.stringify(result)); } catch(_) {}
    }
  }
  return {search,isIntent,saveMetadata};
})();
if(typeof window!=='undefined') window.VideoResearch=VideoResearch;
