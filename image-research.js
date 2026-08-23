/* LocalMind image research: public CC / Wikimedia sources, no API key.
 * Search images of people, animals, cars, planes, places, objects, etc.
 */
const ImageResearch = (() => {
  const OPENVERSE = 'https://api.openverse.org/v1/images/';
  const WIKIMEDIA =
    'https://commons.wikimedia.org/w/api.php';
  const timeout = 9000;
  const JSONP_TIMEOUT = 10000;
  let lastDiagnostics = null;

  async function fetchJson(url) {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), timeout);
    try {
      const r = await fetch(url, {
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        signal: c.signal,
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const ct = (r.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('text/html')) throw new Error('HTML challenge page');
      return await r.json();
    } finally {
      clearTimeout(t);
    }
  }


  // GitHub Pages/custom-domain fallback: when the browser/network blocks direct
  // cross-origin API reads, use a public CORS relay as a last transport. The relay
  // only carries public metadata requests; image thumbnails still load directly.
  const CORS_RELAYS = [
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?url='
  ];

  async function fetchJsonViaRelay(url) {
    let last = null;
    for (const base of CORS_RELAYS) {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), timeout);
      try {
        const r = await fetch(base + encodeURIComponent(url), {
          mode: 'cors', credentials: 'omit', cache: 'no-store', signal: c.signal,
          headers: { 'Accept': 'application/json, text/plain, */*' }
        });
        if (!r.ok) throw new Error('relay HTTP ' + r.status);
        const text = await r.text();
        if (!text || /^\s*</.test(text)) throw new Error('relay returned non-JSON content');
        return JSON.parse(text);
      } catch (e) { last = e; }
      finally { clearTimeout(t); }
    }
    throw last || new Error('No CORS relay available');
  }

  async function fetchJsonWithRelayFallback(url) {
    try { return await fetchJson(url); }
    catch (directError) {
      try { return await fetchJsonViaRelay(url); }
      catch (relayError) {
        const e = new Error((directError && directError.message ? directError.message : 'Direct request failed') +
          '; relay fallback: ' + (relayError && relayError.message ? relayError.message : 'failed'));
        e.direct = directError; e.relay = relayError; throw e;
      }
    }
  }

  function normalizeOpenverse(data, limit) {
    const items = (data && Array.isArray(data.results) ? data.results : []) || [];
    return items
      .map((x) => {
        const url = x.url || x.thumbnail || '';
        const thumb =
          (x.thumbnail && x.thumbnail) ||
          (Array.isArray(x.thumbnails) && x.thumbnails[0]) ||
          url;
        return {
          id: String(x.id || url || ''),
          title: x.title || 'Untitled image',
          creator: x.creator || x.creator_name || '',
          license: [x.license, x.license_version].filter(Boolean).join(' ') || 'CC',
          licenseUrl: x.license_url || '',
          thumbnail: thumb,
          url: url,
          sourceUrl: x.foreign_landing_url || x.url || '',
          source: 'Openverse',
          width: x.width || null,
          height: x.height || null
        };
      })
      .filter((img) => img.url || img.thumbnail)
      .slice(0, limit);
  }

  function normalizeWikimedia(data, limit) {
    const pages =
      (data && data.query && data.query.pages) ? Object.values(data.query.pages) : [];
    return pages
      .map((p) => {
        const info = (p.imageinfo && p.imageinfo[0]) || {};
        const url = info.thumburl || info.url || '';
        const full = info.url || url;
        return {
          id: String(p.pageid || full || ''),
          title: (p.title || 'Wikimedia image').replace(/^File:/i, ''),
          creator:
            (info.extmetadata &&
              info.extmetadata.Artist &&
              String(info.extmetadata.Artist.value || '').replace(/<[^>]+>/g, '')) ||
            'Wikimedia Commons',
          license:
            (info.extmetadata &&
              info.extmetadata.LicenseShortName &&
              info.extmetadata.LicenseShortName.value) ||
            'Wikimedia',
          licenseUrl:
            (info.extmetadata &&
              info.extmetadata.LicenseUrl &&
              info.extmetadata.LicenseUrl.value) ||
            '',
          thumbnail: url,
          url: full,
          sourceUrl: p.title
            ? 'https://commons.wikimedia.org/wiki/' + encodeURIComponent(p.title)
            : full,
          source: 'Wikimedia Commons',
          width: info.thumbwidth || info.width || null,
          height: info.thumbheight || info.height || null
        };
      })
      .filter((img) => img.url || img.thumbnail)
      .slice(0, limit);
  }

  function merge(images, limit) {
    const seen = new Set();
    const out = [];
    for (const img of images) {
      const key = img.id || img.url || img.thumbnail || img.title;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(img);
      if (out.length >= limit) break;
    }
    return out;
  }

  async function oneOpenverse(q, limit) {
    const d = await fetchJsonWithRelayFallback(
      OPENVERSE +
        '?q=' +
        encodeURIComponent(q) +
        '&page_size=' +
        Math.min(Math.max(limit, 6), 20) +
        '&format=json'
    );
    const images = normalizeOpenverse(d, limit);
    if (!images.length) throw Error('No Openverse results');
    return { images, source: 'Openverse' };
  }

  async function oneWikimedia(q, limit) {
    const d = await fetchJsonWithRelayFallback(
      WIKIMEDIA +
        '?action=query&generator=search&gsrsearch=' +
        encodeURIComponent(q) +
        '&gsrnamespace=6&gsrlimit=' +
        Math.min(Math.max(limit, 6), 20) +
        '&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=480&format=json&origin=*'
    );
    const images = normalizeWikimedia(d, limit);
    if (!images.length) throw Error('No Wikimedia results');
    return { images, source: 'Wikimedia Commons' };
  }

  // JSONP fallback is useful on restrictive mobile browsers/WebViews where
  // cross-origin fetch is denied even though Wikimedia itself is reachable.
  // It only reads public, unauthenticated Wikimedia data.
  function oneWikimediaJsonp(q, limit) {
    if (typeof document === 'undefined' || !document.createElement) {
      return Promise.reject(new Error('JSONP unavailable outside a browser'));
    }
    return new Promise((resolve, reject) => {
      const callbackName = '__kanairoexImageJsonp_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      const script = document.createElement('script');
      let finished = false;
      const timer = setTimeout(() => finish(new Error('Wikimedia JSONP timed out')), JSONP_TIMEOUT);

      function cleanup() {
        clearTimeout(timer);
        try { delete globalThis[callbackName]; } catch (_) { globalThis[callbackName] = undefined; }
        if (script && script.parentNode) script.parentNode.removeChild(script);
      }
      function finish(err, data) {
        if (finished) return;
        finished = true;
        cleanup();
        if (err) reject(err);
        else resolve(data);
      }

      globalThis[callbackName] = (data) => finish(null, data);
      script.onerror = () => finish(new Error('Wikimedia JSONP request failed'));
      script.src = WIKIMEDIA +
        '?action=query&generator=search&gsrsearch=' +
        encodeURIComponent(q) +
        '&gsrnamespace=6&gsrlimit=' +
        Math.min(Math.max(limit, 6), 20) +
        '&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=480&format=json&callback=' +
        encodeURIComponent(callbackName);
      (document.head || document.documentElement || document.body).appendChild(script);
    }).then((d) => {
      const images = normalizeWikimedia(d, limit);
      if (!images.length) throw Error('No Wikimedia results');
      return { images, source: 'Wikimedia Commons (JSONP fallback)' };
    });
  }

  // Wikipedia Action API JSONP fallback. This is useful when a static host such as
  // GitHub Pages can load remote scripts but the browser blocks cross-origin fetch.
  // It returns several article thumbnails, so it is a real image-card fallback.
  function oneWikipediaJsonp(q, limit) {
    if (typeof document === 'undefined' || !document.createElement) {
      return Promise.reject(new Error('Wikipedia JSONP unavailable outside a browser'));
    }
    return new Promise((resolve, reject) => {
      const callbackName = '__kanairoexWikiImageJsonp_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      const script = document.createElement('script');
      let finished = false;
      const timer = setTimeout(() => finish(new Error('Wikipedia JSONP timed out')), JSONP_TIMEOUT);
      function cleanup() {
        clearTimeout(timer);
        try { delete globalThis[callbackName]; } catch (_) { globalThis[callbackName] = undefined; }
        if (script && script.parentNode) script.parentNode.removeChild(script);
      }
      function finish(err, data) {
        if (finished) return;
        finished = true;
        cleanup();
        if (err) reject(err); else resolve(data);
      }
      globalThis[callbackName] = (data) => finish(null, data);
      script.onerror = () => finish(new Error('Wikipedia JSONP request failed'));
      script.src = 'https://en.wikipedia.org/w/api.php' +
        '?action=query&generator=search&gsrsearch=' + encodeURIComponent(q) +
        '&gsrlimit=' + Math.min(Math.max(limit, 6), 20) +
        '&prop=pageimages|info&piprop=thumbnail&pithumbsize=480&inprop=url' +
        '&format=json&callback=' + encodeURIComponent(callbackName);
      (document.head || document.documentElement || document.body).appendChild(script);
    }).then((d) => {
      const pages = d && d.query && d.query.pages ? Object.values(d.query.pages) : [];
      const images = pages.map((p) => {
        const thumb = p.thumbnail && p.thumbnail.source;
        const page = p.fullurl || ('https://en.wikipedia.org/wiki/' + encodeURIComponent(String(p.title || q).replace(/\s+/g, '_')));
        return thumb ? {
          id: 'wiki-' + (p.pageid || thumb),
          title: p.title || q,
          creator: '',
          license: 'See source page',
          licenseUrl: '',
          thumbnail: thumb,
          url: thumb,
          sourceUrl: page,
          source: 'Wikipedia JSONP thumbnails',
          width: p.thumbnail.width || null,
          height: p.thumbnail.height || null
        } : null;
      }).filter(Boolean).slice(0, limit);
      if (!images.length) throw Error('No Wikipedia thumbnail results');
      return { images, source: 'Wikipedia JSONP thumbnails' };
    });
  }

  // Wikipedia's public REST summary often exposes a representative thumbnail.
  // This is a last-resort result, not a replacement for the full image search.
  async function oneWikipediaThumbnail(q) {
    const url = 'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(q.replace(/\s+/g, '_'));
    const d = await fetchJsonWithRelayFallback(url);
    const thumb = d && d.thumbnail && d.thumbnail.source;
    if (!thumb) throw Error('No Wikipedia thumbnail');
    const page = (d.content_urls && d.content_urls.desktop && d.content_urls.desktop.page) ||
      'https://en.wikipedia.org/wiki/' + encodeURIComponent(String(d.title || q).replace(/\s+/g, '_'));
    return {
      images: [{
        id: 'wikipedia-' + (d.pageid || q),
        title: d.title || q,
        creator: '',
        license: 'See source page',
        licenseUrl: '',
        thumbnail: thumb,
        url: thumb,
        sourceUrl: page,
        source: 'Wikipedia',
        width: d.thumbnail.width || null,
        height: d.thumbnail.height || null
      }],
      source: 'Wikipedia thumbnail fallback'
    };
  }

  function searchUrl(q) {
    return (
      'https://commons.wikimedia.org/w/index.php?search=' +
      encodeURIComponent(q) +
      '&title=Special:MediaSearch&type=image'
    );
  }

  async function search(query, limit = 12) {
    const q = String(query || '').trim();
    if (!q) throw Error('Image search query is empty.');

    const requestedLimit = Math.max(1, Math.min(Number(limit) || 12, 24));
    const providerLimit = Math.max(requestedLimit, 8);
    const failures = [];

    // Race the browser-safe JSONP route against normal CORS providers. This is
    // important on GitHub Pages: a failed CORS request must never delay or block
    // a provider that can work through a plain <script> request.
    const candidates = [
      ['Wikimedia Commons (JSONP)', oneWikimediaJsonp(q, providerLimit)],
      ['Wikimedia Commons', oneWikimedia(q, providerLimit)],
      ['Openverse', oneOpenverse(q, providerLimit)]
    ];

    let winner = null;
    try {
      winner = await Promise.any(candidates.map(x => x[1]));
    } catch (aggregate) {
      const errors = aggregate && Array.isArray(aggregate.errors) ? aggregate.errors : [];
      for (let i = 0; i < candidates.length; i++) {
        const e = errors[i];
        failures.push(candidates[i][0] + ': ' + ((e && e.message) || String(e || 'failed')));
      }
    }

    let all = winner && winner.images ? winner.images.slice() : [];
    let providers = winner && winner.source ? [winner.source] : [];

    // Enrich a successful result with any other provider that responds quickly,
    // but never wait on a blocked provider. This keeps GitHub Pages responsive
    // while preserving multi-source result sets when the network allows them.
    if (all.length) {
      const enrichment = await Promise.race([
        Promise.allSettled(candidates.map(x => x[1])),
        new Promise(resolve => setTimeout(() => resolve(null), 1200))
      ]);
      if (Array.isArray(enrichment)) {
        for (const r of enrichment) {
          if (r.status === 'fulfilled' && r.value && Array.isArray(r.value.images)) {
            all = all.concat(r.value.images);
            if (r.value.source && !providers.includes(r.value.source)) providers.push(r.value.source);
          }
        }
      }
    }

    // If the primary providers all failed, try Wikipedia through JSONP. A static
    // GitHub Pages site can still load this as a remote script without CORS.
    if (!all.length) {
      try {
        const r = await oneWikipediaJsonp(q, providerLimit);
        all = all.concat(r.images || []);
        providers.push(r.source);
      } catch (e) {
        failures.push('Wikipedia JSONP thumbnails: ' + ((e && e.message) || String(e)));
      }
    }

    // GitHub Pages/custom-domain transport fallback. If direct CORS and JSONP
    // are blocked by the browser/network, fetch the public API JSON through a
    // CORS relay. This is the key difference between local editors and hosted sites.
    if (!all.length) {
      const relayTargets = [
        ['Wikimedia Commons (CORS relay)', WIKIMEDIA +
          '?action=query&generator=search&gsrsearch=' + encodeURIComponent(q) +
          '&gsrnamespace=6&gsrlimit=' + Math.min(Math.max(providerLimit, 8), 20) +
          '&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=480&format=json&origin=*'],
        ['Openverse (CORS relay)', OPENVERSE + '?q=' + encodeURIComponent(q) +
          '&page_size=' + Math.min(Math.max(providerLimit, 8), 20) + '&format=json']
      ];
      for (const [name, target] of relayTargets) {
        try {
          const d = await fetchJsonViaRelay(target);
          const imgs = name.startsWith('Wikimedia') ? normalizeWikimedia(d, providerLimit) : normalizeOpenverse(d, providerLimit);
          if (imgs.length) { all = all.concat(imgs); providers.push(name); break; }
        } catch (e) { failures.push(name + ': ' + ((e && e.message) || String(e))); }
      }
    }

    // Last-resort single representative image for well-known topics.
    if (!all.length) {
      try {
        const r = await oneWikipediaThumbnail(q);
        all = all.concat(r.images || []);
        providers.push(r.source);
      } catch (e) {
        failures.push('Wikipedia thumbnail fallback: ' + ((e && e.message) || String(e)));
      }
    }

    const images = merge(all, requestedLimit);
    lastDiagnostics = {
      query: q,
      failures,
      sources: providers.slice(),
      strategy: 'direct-cors-jsonp-relay-wikipedia-fallback',
      at: new Date().toISOString()
    };
    if (!images.length) {
      const e = Error('Public image search services are unavailable right now.');
      e.searchUrl = searchUrl(q);
      e.diagnostics = lastDiagnostics;
      throw e;
    }
    return {
      query: q,
      images,
      sources: providers,
      diagnostics: lastDiagnostics,
      researchedAt: new Date().toISOString()
    };
  }

  function diagnose() {
    return {
      openverse: OPENVERSE,
      wikimedia: WIKIMEDIA,
      jsonpFallback: true,
      corsRelayFallback: true,
      corsRelays: CORS_RELAYS.slice(),
      wikipediaThumbnailFallback: true,
      wikipediaJsonpFallback: true,
      strategy: 'direct-cors-jsonp-relay-wikipedia-fallback',
      last: lastDiagnostics
    };
  }

  /**
   * Detect natural-language image search intents, e.g.:
   *  - search images of lions
   *  - find pictures of cars
   *  - show photos of airplanes
   *  - images of people
   *  - picture of a plane
   *  - photos of animals
   */
  function isIntent(text) {
    const raw = String(text || '').trim();
    if (!raw) return null;

    // Explicit: (search|find|look up|show|get) (images|pictures|photos|pics) (of|for|about) …
    let m = raw.match(
      /(?:search|find|look\s*up|show|get|browse)\s+(?:for\s+)?(?:images?|pictures?|photos?|pics?|photographs?)\s+(?:of|for|about|showing)\s+(.+)/i
    );
    if (!m) {
      m = raw.match(
        /(?:images?|pictures?|photos?|pics?|photographs?)\s+(?:of|for|about|showing)\s+(.+)/i
      );
    }
    if (!m) {
      // "search for images of X" already covered; also "find image X"
      m = raw.match(
        /(?:search|find|look\s*up|show|get)\s+(?:an?\s+)?(?:image|picture|photo|pic|photograph)\s+(?:of\s+)?(.+)/i
      );
    }
    if (!m) return null;

    let query = m[1]
      .replace(/[?.!]+$/g, '')
      .replace(/\b(online|on the (web|internet)|please)\b/gi, '')
      .trim();
    if (!query || query.length < 2) return null;
    // Avoid clashing with profile/gallery local photo commands
    if (
      /^(my (photo|picture|image|avatar)|profile|gallery|avatar)\b/i.test(query) ||
      /^(set|clear|remove|add|save|upload|change)\b/i.test(raw)
    ) {
      return null;
    }
    return { query: query.slice(0, 120) };
  }

  function saveMetadata(result) {
    if (!result || !Array.isArray(result.images)) return;
    if (typeof Online !== 'undefined' && Online.storeInMemory) {
      const text = result.images
        .map(
          (img, i) =>
            `${i + 1}. ${img.title} — ${img.creator || 'unknown'}\n` +
            `License: ${img.license || '?'}\n` +
            `Image: ${img.url || img.thumbnail}\n` +
            (img.sourceUrl ? `Source: ${img.sourceUrl}` : '')
        )
        .join('\n\n');
      Online.storeInMemory(
        'Images: ' + result.query,
        text,
        result.images[0] ? result.images[0].sourceUrl || result.images[0].url : 'image search'
      );
    }
    try {
      localStorage.setItem(
        'localmind_image_search_' + Date.now(),
        JSON.stringify({
          query: result.query,
          count: result.images.length,
          sources: result.sources,
          researchedAt: result.researchedAt,
          images: result.images.map((x) => ({
            title: x.title,
            url: x.url,
            thumbnail: x.thumbnail,
            sourceUrl: x.sourceUrl,
            license: x.license
          }))
        })
      );
    } catch (_) {}
  }

  return { search, isIntent, saveMetadata, searchUrl, diagnose };
})();

if (typeof window !== 'undefined') window.ImageResearch = ImageResearch;
if (typeof module !== 'undefined') module.exports = ImageResearch;
