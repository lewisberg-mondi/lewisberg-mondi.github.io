/* LocalMind image research: public CC / Wikimedia sources, no API key.
 * Search images of people, animals, cars, planes, places, objects, etc.
 */
const ImageResearch = (() => {
  const OPENVERSE = 'https://api.openverse.org/v1/images/';
  const WIKIMEDIA =
    'https://commons.wikimedia.org/w/api.php';
  const timeout = 9000;

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
      if (ct.includes('text/html')) throw new Error('HTML challenge page');
      return await r.json();
    } finally {
      clearTimeout(t);
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
    const d = await fetchJson(
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
    const d = await fetchJson(
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

    const jobs = [oneOpenverse(q, Math.max(limit, 8)), oneWikimedia(q, Math.max(limit, 8))];
    const settled = await Promise.allSettled(jobs);
    let all = [];
    let used = [];
    settled.forEach((r) => {
      if (r.status === 'fulfilled') {
        all = all.concat(r.value.images || []);
        used.push(r.value.source);
      }
    });

    const images = merge(all, limit);
    if (!images.length) {
      const e = Error('Public image search services are unavailable right now.');
      e.searchUrl = searchUrl(q);
      throw e;
    }
    return {
      query: q,
      images,
      sources: used,
      researchedAt: new Date().toISOString()
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

  return { search, isIntent, saveMetadata, searchUrl };
})();

if (typeof window !== 'undefined') window.ImageResearch = ImageResearch;
if (typeof module !== 'undefined') module.exports = ImageResearch;
