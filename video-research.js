/* LocalMind video research: resilient public-source search, no API key. */
const VideoResearch = (() => {
  // Public Piped / Invidious instances change frequently; keep several and fail soft.
  const PIPED = [
    'https://api.piped.private.coffee',
    'https://pipedapi.adminforge.de',
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.tokhmi.xyz',
    'https://pipedapi.moomoo.me',
    'https://pipedapi.syncpundit.io'
  ];
  const INVIDIOUS = [
    'https://invidious.nerdvpn.de',
    'https://inv.nadeko.net',
    'https://invidious.tiekoetter.com',
    'https://invidious.f5.si',
    'https://yt.chocolatemoo53.com',
    'https://invidious.flokinet.to'
  ];
  const timeout = 7000;

  async function fetchJson(url) {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), timeout);
    try {
      const r = await fetch(url, {
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        signal: c.signal,
        headers: { Accept: 'application/json' }
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const ct = (r.headers.get('content-type') || '').toLowerCase();
      // Some instances return HTML captcha pages with 200
      if (ct.includes('text/html')) throw new Error('HTML challenge page');
      return await r.json();
    } finally {
      clearTimeout(t);
    }
  }

  function videoIdFrom(item) {
    if (!item) return '';
    if (item.videoId) return String(item.videoId);
    if (item.id && !String(item.id).includes('/')) return String(item.id);
    const u = String(item.url || item.videoUrl || '');
    let m = u.match(/[?&]v=([^&]+)/);
    if (m) return decodeURIComponent(m[1]);
    m = u.match(/\/watch\/([^/?#]+)/);
    if (m) return m[1];
    m = u.match(/\/watch\?v=([^&]+)/);
    if (m) return m[1];
    m = u.match(/\/video\/([^/?#]+)/);
    return m ? m[1] : '';
  }

  function thumb(item, id) {
    if (item.thumbnail) return item.thumbnail;
    if (item.thumbnailUrl) return item.thumbnailUrl;
    if (Array.isArray(item.videoThumbnails) && item.videoThumbnails.length) {
      const best =
        item.videoThumbnails.find((x) => /maxres|high/i.test(x.quality || '')) ||
        item.videoThumbnails[item.videoThumbnails.length - 1];
      if (best && best.url) return best.url;
    }
    return id ? 'https://i.ytimg.com/vi/' + encodeURIComponent(id) + '/hqdefault.jpg' : '';
  }

  function normalizePiped(data, limit) {
    const items = Array.isArray(data)
      ? data
      : Array.isArray(data && data.items)
        ? data.items
        : [];
    return items
      .filter((x) => x && (x.type === 'stream' || x.videoId || x.url))
      .map((x) => {
        const id = videoIdFrom(x);
        const url = id
          ? 'https://www.youtube.com/watch?v=' + encodeURIComponent(id)
          : x.url || '';
        return {
          id,
          title: x.title || 'Untitled video',
          uploader: x.uploaderName || x.uploader || x.channelName || '',
          duration: Number(x.duration || 0),
          thumbnail: thumb(x, id),
          url,
          embed: id ? 'https://www.youtube.com/embed/' + encodeURIComponent(id) : '',
          source: 'Piped/YouTube'
        };
      })
      .filter((v) => v.id || v.url)
      .slice(0, limit);
  }

  function normalizeInvidious(data, limit, base) {
    const items = Array.isArray(data) ? data : [];
    return items
      .filter((x) => x && (x.type === 'video' || x.videoId || x.videoId === 0))
      .map((x) => {
        const id = videoIdFrom(x);
        const url = id
          ? 'https://www.youtube.com/watch?v=' + encodeURIComponent(id)
          : base + '/watch?v=' + encodeURIComponent(id);
        return {
          id,
          title: x.title || 'Untitled video',
          uploader: x.author || '',
          duration: Number(x.lengthSeconds || 0),
          thumbnail: thumb(x, id),
          url,
          embed: id ? 'https://www.youtube.com/embed/' + encodeURIComponent(id) : '',
          source: 'Invidious/YouTube'
        };
      })
      .filter((v) => v.id || v.url)
      .slice(0, limit);
  }

  function merge(videos, limit) {
    const seen = new Set();
    const out = [];
    for (const v of videos) {
      const key = v.id || v.url || v.title;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(v);
      if (out.length >= limit) break;
    }
    return out;
  }

  async function onePiped(base, q, limit) {
    const d = await fetchJson(
      base + '/search?q=' + encodeURIComponent(q) + '&filter=videos'
    );
    const videos = normalizePiped(d, limit);
    if (!videos.length) throw Error('No Piped results');
    return { videos, instance: base, source: 'Piped' };
  }

  async function oneInv(base, q, limit) {
    const d = await fetchJson(
      base +
        '/api/v1/search?q=' +
        encodeURIComponent(q) +
        '&type=video&sort_by=relevance'
    );
    const videos = normalizeInvidious(d, limit, base);
    if (!videos.length) throw Error('No Invidious results');
    return { videos, instance: base, source: 'Invidious' };
  }

  function searchUrl(q) {
    return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q);
  }

  async function search(query, limit = 8) {
    const q = String(query || '').trim();
    if (!q) throw Error('Video search query is empty.');

    const jobs = [];
    PIPED.forEach((base) => jobs.push(onePiped(base, q, Math.max(limit, 6))));
    INVIDIOUS.forEach((base) => jobs.push(oneInv(base, q, Math.max(limit, 6))));

    const settled = await Promise.allSettled(jobs);
    let all = [];
    let used = [];
    settled.forEach((r) => {
      if (r.status === 'fulfilled') {
        all = all.concat(r.value.videos || []);
        used.push(r.value.instance);
      }
    });

    const videos = merge(all, limit);
    if (!videos.length) {
      const e = Error('Public video search services are unavailable right now.');
      e.searchUrl = searchUrl(q);
      throw e;
    }
    return {
      query: q,
      videos,
      instances: used,
      researchedAt: new Date().toISOString()
    };
  }

  function isIntent(text) {
    const raw = String(text || '').trim();
    let m = raw.match(
      /(?:search|find|look\s*up)\s+(?:for\s+)?(?:videos?|video)\s+(?:about|on|for)\s+(.+)/i
    );
    if (!m) m = raw.match(/(?:videos?|video)\s+(?:about|on|for)\s+(.+)/i);
    return m ? { query: m[1].replace(/[?.!]+$/, '').trim() } : null;
  }

  function saveMetadata(result) {
    if (!result || !Array.isArray(result.videos)) return;
    if (typeof Online !== 'undefined' && Online.storeInMemory) {
      const text = result.videos
        .map(
          (v, i) =>
            `${i + 1}. ${v.title} — ${v.uploader}\nWatch: ${v.url}${
              v.embed ? '\nEmbed: ' + v.embed : ''
            }`
        )
        .join('\n');
      Online.storeInMemory(
        'Videos: ' + result.query,
        text,
        result.videos[0] ? result.videos[0].url : 'video search'
      );
    }
    try {
      localStorage.setItem(
        'localmind_video_search_' + Date.now(),
        JSON.stringify(result)
      );
    } catch (_) {}
  }

  return { search, isIntent, saveMetadata, searchUrl };
})();
if (typeof window !== 'undefined') window.VideoResearch = VideoResearch;
