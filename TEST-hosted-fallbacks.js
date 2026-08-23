const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

function load(file, extra = {}) {
  const context = {
    console, setTimeout, clearTimeout, AbortController,
    URL, URLSearchParams, Promise, Date, Math, JSON, Object, Array, String,
    localStorage: { getItem(){return null;}, setItem(){} },
    navigator: { onLine: true },
    ...extra
  };
  context.globalThis = context;
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  return context;
}

(async () => {
  const root = __dirname;

  // IMAGE: direct provider fails, GitHub-hosted CORS relay succeeds.
  let imageCalls = [];
  const imageFetch = async (url) => {
    imageCalls.push(url);
    if (url.startsWith('https://commons.wikimedia.org/')) throw new Error('Access denied');
    if (url.startsWith('https://api.openverse.org/')) throw new Error('Access denied');
    if (url.startsWith('https://api.allorigins.win/raw?url=')) {
      const target = decodeURIComponent(url.split('?url=')[1]);
      if (target.includes('commons.wikimedia.org')) {
        return { ok: true, headers: { get(){ return 'application/json'; } }, async text(){
          return JSON.stringify({ query: { pages: {
            1: { pageid: 1, title: 'File:Photosynthesis.jpg', imageinfo: [{ url: 'https://upload.wikimedia.org/photo.jpg', thumburl: 'https://upload.wikimedia.org/thumb.jpg', width: 640, height: 480, extmetadata: { LicenseShortName: { value: 'CC BY-SA' } } }]
          } } } });
        }, async json(){ throw new Error('not used'); } };
      }
    }
    throw new Error('unexpected fetch ' + url);
  };
  const imgCtx = load(root + '/image-research.js', { fetch: imageFetch });
  const img = await imgCtx.ImageResearch.search('photosynthesis', 5);
  assert(img.images.length >= 1, 'image relay should return an image');
  assert(img.sources.some(s => /Wikimedia Commons/.test(s)), 'image result should preserve provider source');
  assert(img.diagnostics.strategy.includes('relay'), 'image diagnostics should record relay strategy');
  assert(imageCalls.some(u => u.startsWith('https://api.allorigins.win/')), 'image relay must be attempted');

  // ONLINE: direct Wikipedia access denied, relay returns usable API JSON.
  let onlineCalls = [];
  const onlineFetch = async (url) => {
    onlineCalls.push(url);
    if (url.startsWith('https://en.wikipedia.org/')) throw new Error('Access denied');
    if (url.startsWith('https://api.allorigins.win/raw?url=')) {
      const target = decodeURIComponent(url.split('?url=')[1]);
      if (target.includes('/api/rest_v1/page/summary/Photosynthesis')) {
        return { ok: true, async text(){ return JSON.stringify({ title: 'Photosynthesis', extract: 'Photosynthesis is a process used by plants to convert light energy into chemical energy.', description: 'process', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Photosynthesis' } } }); } };
      }
      if (target.includes('w/api.php?action=query&prop=extracts')) {
        return { ok: true, async text(){ return JSON.stringify({ query: { pages: { 1: { pageid: 1, title: 'Photosynthesis', extract: 'Plants use light energy to make chemical energy.' } } } }); } };
      }
      if (target.includes('wikidata.org')) {
        return { ok: true, async text(){ return JSON.stringify({ search: [{ id: 'Q170430', label: 'photosynthesis', description: 'process' }] }); } };
      }
    }
    if (url.startsWith('https://api.duckduckgo.com/')) throw new Error('Access denied');
    throw new Error('unexpected fetch ' + url);
  };
  const onCtx = load(root + '/online.js', { fetch: onlineFetch });
  const data = await onCtx.Online.fetchTopicFull('Photosynthesis');
  assert(/Photosynthesis/.test(data.title), 'online relay should return title');
  assert(data.content.length > 20, 'online relay should return content');
  assert(data.sources.length >= 1, 'online result should contain sources');
  assert(onlineCalls.some(u => u.startsWith('https://api.allorigins.win/')), 'online relay must be attempted');
  assert(onCtx.Online.status().corsRelayFallback === true, 'online diagnostics must advertise relay fallback');

  console.log('PASS: hosted image CORS relay fallback');
  console.log('PASS: hosted online research CORS relay fallback');
  console.log('PASS: v41 diagnostics and source metadata');
})().catch(err => { console.error('FAIL:', err); process.exit(1); });
