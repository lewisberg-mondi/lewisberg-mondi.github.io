/* LocalMind image research: public sources, no API key.
 * Openverse + Wikimedia Commons + Wikipedia page images.
 * Designed to work from GitHub Pages / custom domains (CORS origin=*).
 */
const ImageResearch = (() => {
  const OPENVERSE = 'https://api.openverse.org/v1/images/';
  const WIKIMEDIA = 'https://commons.wikimedia.org/w/api.php';
  const WIKIPEDIA = 'https://en.wikipedia.org/w/api.php';
  const timeoutMs = 12000;

  async function fetchJson(url, attempt) {
    const c = new AbortController();
    const t = setTimeout(function () {
      try {
        c.abort();
      } catch (_) {}
    }, timeoutMs);
    try {
      const r = await fetch(url, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        cache: 'default',
        signal: c.signal,
        headers: {
          Accept: 'application/json'
        }
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const ct = (r.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('text/html')) throw new Error('HTML challenge page');
      return await r.json();
    } catch (e) {
      if (attempt < 1) {
        await new Promise(function (res) {
          setTimeout(res, 400);
        });
        return fetchJson(url, attempt + 1);
      }
      throw e;
    } finally {
      clearTimeout(t);
    }
  }

  function normalizeOpenverse(data, limit) {
    const items = (data && Array.isArray(data.results) ? data.results : []) || [];
    return items
      .map(function (x) {
        // Prefer direct file URL for <img> (Openverse "thumbnail" is an API path that often fails in browsers)
        const url = x.url || '';
        let thumb = url;
        if (!thumb && Array.isArray(x.thumbnails) && x.thumbnails[0]) thumb = x.thumbnails[0];
        // Only use API thumbnail endpoint as last resort
        if (!thumb && x.thumbnail && !/\/thumb\/?$/i.test(String(x.thumbnail))) thumb = x.thumbnail;
        if (!thumb) thumb = x.thumbnail || '';
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
      .filter(function (img) {
        return img.url || img.thumbnail;
      })
      .slice(0, limit);
  }

  function normalizeWikimedia(data, limit) {
    const pages =
      data && data.query && data.query.pages ? Object.values(data.query.pages) : [];
    return pages
      .map(function (p) {
        const info = (p.imageinfo && p.imageinfo[0]) || {};
        const url = info.thumburl || info.url || '';
        const full = info.url || url;
        var creator = 'Wikimedia Commons';
        try {
          if (info.extmetadata && info.extmetadata.Artist) {
            creator = String(info.extmetadata.Artist.value || '').replace(/<[^>]+>/g, '').slice(0, 80) || creator;
          }
        } catch (_) {}
        var license = 'Wikimedia';
        try {
          if (info.extmetadata && info.extmetadata.LicenseShortName) {
            license = info.extmetadata.LicenseShortName.value || license;
          }
        } catch (_) {}
        return {
          id: String(p.pageid || full || ''),
          title: String(p.title || 'Wikimedia image').replace(/^File:/i, ''),
          creator: creator,
          license: license,
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
      .filter(function (img) {
        return img.url || img.thumbnail;
      })
      .slice(0, limit);
  }

  function normalizeWikipedia(data, limit) {
    const pages =
      data && data.query && data.query.pages ? Object.values(data.query.pages) : [];
    return pages
      .map(function (p) {
        const thumb = (p.thumbnail && p.thumbnail.source) || '';
        const original =
          (p.original && p.original.source) ||
          thumb.replace(/\/\d+px-/, '/800px-') ||
          thumb;
        if (!thumb && !original) return null;
        return {
          id: String(p.pageid || original || ''),
          title: p.title || 'Wikipedia',
          creator: 'Wikipedia',
          license: 'Wikipedia / source license',
          licenseUrl: '',
          thumbnail: thumb || original,
          url: original || thumb,
          sourceUrl: p.fullurl || 'https://en.wikipedia.org/wiki/' + encodeURIComponent(p.title || ''),
          source: 'Wikipedia',
          width: (p.thumbnail && p.thumbnail.width) || null,
          height: (p.thumbnail && p.thumbnail.height) || null
        };
      })
      .filter(Boolean)
      .slice(0, limit);
  }

  function merge(images, limit) {
    const seen = new Set();
    const out = [];
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
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
        Math.min(Math.max(limit, 8), 20) +
        '&format=json',
      0
    );
    const images = normalizeOpenverse(d, limit);
    if (!images.length) throw Error('No Openverse results');
    return { images: images, source: 'Openverse' };
  }

  async function oneWikimedia(q, limit) {
    const d = await fetchJson(
      WIKIMEDIA +
        '?action=query&generator=search&gsrsearch=' +
        encodeURIComponent(q) +
        '&gsrnamespace=6&gsrlimit=' +
        Math.min(Math.max(limit, 8), 20) +
        '&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=480&format=json&origin=*',
      0
    );
    const images = normalizeWikimedia(d, limit);
    if (!images.length) throw Error('No Wikimedia results');
    return { images: images, source: 'Wikimedia Commons' };
  }

  async function oneWikipedia(q, limit) {
    const d = await fetchJson(
      WIKIPEDIA +
        '?action=query&generator=search&gsrsearch=' +
        encodeURIComponent(q) +
        '&gsrlimit=' +
        Math.min(Math.max(limit, 8), 15) +
        '&prop=pageimages|info&piprop=thumbnail|original&pithumbsize=480&inprop=url&format=json&origin=*',
      0
    );
    const images = normalizeWikipedia(d, limit);
    if (!images.length) throw Error('No Wikipedia page images');
    return { images: images, source: 'Wikipedia' };
  }

  function searchUrl(q) {
    return (
      'https://commons.wikimedia.org/w/index.php?search=' +
      encodeURIComponent(q) +
      '&title=Special:MediaSearch&type=image'
    );
  }

  async function search(query, limit) {
    limit = limit == null ? 12 : limit;
    const q = String(query || '').trim();
    if (!q) throw Error('Image search query is empty.');

    const jobs = [
      oneOpenverse(q, Math.max(limit, 8)),
      oneWikimedia(q, Math.max(limit, 8)),
      oneWikipedia(q, Math.max(limit, 8))
    ];
    const settled = await Promise.allSettled(jobs);
    let all = [];
    let used = [];
    let errors = [];
    settled.forEach(function (r, idx) {
      const names = ['Openverse', 'Wikimedia', 'Wikipedia'];
      if (r.status === 'fulfilled') {
        all = all.concat(r.value.images || []);
        used.push(r.value.source);
      } else {
        errors.push(names[idx] + ': ' + (r.reason && r.reason.message ? r.reason.message : r.reason));
      }
    });

    const images = merge(all, limit);
    if (!images.length) {
      const e = Error(
        'Public image search services are unavailable right now.' +
          (errors.length ? ' (' + errors.join('; ') + ')' : '')
      );
      e.searchUrl = searchUrl(q);
      e.errors = errors;
      throw e;
    }
    return {
      query: q,
      images: images,
      sources: used,
      partialErrors: errors,
      researchedAt: new Date().toISOString()
    };
  }

  function isIntent(text) {
    const raw = String(text || '').trim();
    if (!raw) return null;

    let m = raw.match(
      /(?:search|find|look\s*up|show|get|browse)\s+(?:for\s+)?(?:images?|pictures?|photos?|pics?|photographs?)\s+(?:of|for|about|showing)\s+(.+)/i
    );
    if (!m) {
      m = raw.match(
        /(?:images?|pictures?|photos?|pics?|photographs?)\s+(?:of|for|about|showing)\s+(.+)/i
      );
    }
    if (!m) {
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
        .map(function (img, i) {
          return (
            i +
            1 +
            '. ' +
            img.title +
            ' — ' +
            (img.creator || 'unknown') +
            '\nLicense: ' +
            (img.license || '?') +
            '\nImage: ' +
            (img.url || img.thumbnail) +
            (img.sourceUrl ? '\nSource: ' + img.sourceUrl : '')
          );
        })
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
          images: result.images.map(function (x) {
            return {
              title: x.title,
              url: x.url,
              thumbnail: x.thumbnail,
              sourceUrl: x.sourceUrl,
              license: x.license,
              source: x.source
            };
          })
        })
      );
    } catch (_) {}
  }

  return { search: search, isIntent: isIntent, saveMetadata: saveMetadata, searchUrl: searchUrl };
})();

if (typeof window !== 'undefined') window.ImageResearch = ImageResearch;
if (typeof module !== 'undefined') module.exports = ImageResearch;
