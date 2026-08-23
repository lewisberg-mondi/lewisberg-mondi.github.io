/**
 * Kanairoex / LocalMind Web Research
 * Browser-safe, GitHub Pages compatible, no API key required.
 *
 * Architecture:
 *   intent -> source adapters -> normalized research document -> local memory
 *
 * Sources are deliberately public and browser-accessible:
 *   1) Wikimedia REST page summary
 *   2) MediaWiki Action API search/extracts
 *   3) Wikidata entity search/description
 *   4) DuckDuckGo Instant Answer (best effort)
 *
 * A static GitHub Pages site cannot perform unrestricted Google/Bing-style crawling.
 * This module therefore never pretends that a lookup succeeded when all network
 * sources failed, and it records the source(s) actually used.
 */
const Online = (() => {
  let enabled = true;
  const PAGE_KEY = "localmind_offline_pages";
  const MAX_TEXT = 200000;
  const MAX_KNOWLEDGE = 50000;
  const FETCH_TIMEOUT_MS = 15000;
  const API_UA = "KanairoexAI/1.1 (browser research app; https://github.com/)";

  const SOURCE_NAMES = {
    wikiRest: "Wikipedia REST",
    wikiApi: "Wikipedia API",
    wikidata: "Wikidata",
    ddg: "DuckDuckGo Instant Answer"
  };

  async function fetchWithTimeout(url, options, timeoutMs) {
    const opts = Object.assign({}, options || {});
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs || FETCH_TIMEOUT_MS);
    opts.signal = controller.signal;
    try {
      const response = await fetch(url, opts);
      return response;
    } catch (e) {
      if (e && e.name === "AbortError") throw new Error("Network request timed out after " + ((timeoutMs || FETCH_TIMEOUT_MS) / 1000) + " seconds");
      const msg = e && e.message ? e.message : String(e);
      if (/Failed to fetch|NetworkError|Load failed|CORS|network/i.test(msg)) {
        throw new Error("The browser could not reach the web source (network/CORS). Check your connection and HTTPS site deployment.");
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  function isOnline() {
    try { return typeof navigator === "undefined" ? true : navigator.onLine !== false; }
    catch (_) { return true; }
  }

  function setEnabled(v) { enabled = !!v; }
  function getEnabled() { return enabled && isOnline(); }

  function loadPages() {
    try { return JSON.parse(localStorage.getItem(PAGE_KEY) || "{}"); } catch (_) { return {}; }
  }
  function savePages(p) {
    try { localStorage.setItem(PAGE_KEY, JSON.stringify(p)); return true; }
    catch (_) {
      try {
        const keys = Object.keys(p);
        while (keys.length > 40) delete p[keys.shift()];
        localStorage.setItem(PAGE_KEY, JSON.stringify(p));
      } catch (_) {}
      return false;
    }
  }

  function fetchOpts(extraHeaders) {
    return {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      headers: Object.assign({
        "Accept": "application/json, text/plain, */*",
        "Api-User-Agent": API_UA
      }, extraHeaders || {})
    };
  }


  // GitHub Pages/custom-domain transport fallback. Static hosting cannot add
  // server-side CORS headers, so blocked public API reads can be retried through
  // public CORS relays. Direct requests always remain the first choice.
  const CORS_RELAYS = [
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?url='
  ];

  async function fetchViaRelay(url, timeoutMs) {
    let last = null;
    for (const base of CORS_RELAYS) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs || FETCH_TIMEOUT_MS);
      try {
        const response = await fetch(base + encodeURIComponent(url), {
          method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store',
          signal: controller.signal,
          headers: { 'Accept': 'application/json, text/plain, */*' }
        });
        if (!response.ok) throw new Error('relay HTTP ' + response.status);
        return response;
      } catch (e) { last = e; }
      finally { clearTimeout(timer); }
    }
    throw last || new Error('No CORS relay available');
  }

  async function fetchJsonWithRelayFallback(url, timeoutMs) {
    try {
      const res = await fetchWithTimeout(url, fetchOpts({ Accept: 'application/json' }), timeoutMs);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (directError) {
      try {
        const res = await fetchViaRelay(url, timeoutMs);
        const text = await res.text();
        if (!text || /^\s*</.test(text)) throw new Error('relay returned non-JSON content');
        return JSON.parse(text);
      } catch (relayError) {
        const e = new Error((directError && directError.message ? directError.message : 'Direct request failed') +
          '; relay fallback: ' + (relayError && relayError.message ? relayError.message : 'failed'));
        e.direct = directError; e.relay = relayError; throw e;
      }
    }
  }

  function wikiPageUrl(title) {
    return "https://en.wikipedia.org/wiki/" + encodeURIComponent(String(title || "").replace(/\s+/g, "_"));
  }

  function cleanTopic(topic) {
    return String(topic || "").trim()
      .replace(/[?.!]+$/g, "")
      .replace(/\s+/g, " ")
      .slice(0, 240);
  }

  function parseSummaryJson(data) {
    if (!data || !data.title) return null;
    if (data.type === "disambiguation") return null;
    return {
      title: data.title,
      summary: data.extract || data.description || "",
      url: (data.content_urls && data.content_urls.desktop && data.content_urls.desktop.page) || wikiPageUrl(data.title),
      image: data.thumbnail && data.thumbnail.source ? data.thumbnail.source : null,
      description: data.description || ""
    };
  }

  async function wikiSummary(title) {
    const encoded = encodeURIComponent(String(title).replace(/\s+/g, "_"));
    const url = "https://en.wikipedia.org/api/rest_v1/page/summary/" + encoded;
    const parsed = parseSummaryJson(await fetchJsonWithRelayFallback(url));
    if (!parsed) throw new Error("Wikipedia returned no usable summary");
    return parsed;
  }

  async function wikiSearch(topic) {
    const url = "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=" +
      encodeURIComponent(topic) + "&srlimit=8&format=json&origin=*";
    const data = await fetchJsonWithRelayFallback(url);
    const hits = data && data.query && data.query.search ? data.query.search : [];
    if (!hits.length) throw new Error("No Wikipedia result for " + topic);
    return hits;
  }

  async function wikiFull(title) {
    const url = "https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&exsectionformat=plain&redirects=1&titles=" +
      encodeURIComponent(title) + "&format=json&origin=*";
    const data = await fetchJsonWithRelayFallback(url);
    if (data && data.error) throw new Error(data.error.info || "Wikipedia API error");
    const pages = data && data.query && data.query.pages ? data.query.pages : {};
    const page = Object.values(pages)[0];
    if (!page || page.missing || !page.extract) throw new Error("No article text returned");
    return String(page.extract).trim();
  }

  async function wikidataSearch(topic) {
    const url = "https://www.wikidata.org/w/api.php?action=wbsearchentities&search=" +
      encodeURIComponent(topic) + "&language=en&uselang=en&type=item&limit=5&format=json&origin=*";
    const data = await fetchJsonWithRelayFallback(url);
    const hits = data && Array.isArray(data.search) ? data.search : [];
    if (!hits.length) throw new Error("No Wikidata entity found");
    const best = hits[0];
    return {
      id: best.id,
      title: best.label || topic,
      description: best.description || "",
      url: "https://www.wikidata.org/wiki/" + encodeURIComponent(best.id)
    };
  }

  async function fetchDuckDuckGo(topic) {
    try {
      const url = "https://api.duckduckgo.com/?q=" + encodeURIComponent(topic) +
        "&format=json&no_html=1&skip_disambig=1";
      const res = await fetchWithTimeout(url, fetchOpts({ Accept: "application/json" }), 9000);
      if (!res.ok) return null;
      const d = await res.json();
      const related = [];
      (d.RelatedTopics || []).forEach(rt => {
        if (rt.Text) related.push(rt.Text);
        (rt.Topics || []).forEach(t => { if (t.Text) related.push(t.Text); });
      });
      return {
        heading: d.Heading || "",
        abstract: d.AbstractText || d.Abstract || "",
        abstractSource: d.AbstractSource || "",
        abstractUrl: d.AbstractURL || "",
        answer: d.Answer || "",
        definition: d.Definition || "",
        definitionUrl: d.DefinitionURL || "",
        related: related.slice(0, 12),
        image: d.Image ? "https://duckduckgo.com" + d.Image : null
      };
    } catch (_) { return null; }
  }

  async function fetchTopicFull(topic) {
    const clean = cleanTopic(topic);
    if (!clean) throw new Error("Empty topic");
    if (!isOnline()) throw new Error("Browser reports offline. Connect to the internet and try again.");

    const errors = [];
    let wiki = null;
    let wikiSource = null;
    let fullText = "";
    let wd = null;
    let ddg = null;

    // Fast path: exact Wikipedia summary. This is a browser/CORS-friendly endpoint.
    try {
      wiki = await wikiSummary(clean);
      wikiSource = SOURCE_NAMES.wikiRest;
    } catch (e) { errors.push("Wikipedia REST: " + e.message); }

    // Search if exact title did not work.
    if (!wiki) {
      try {
        const hits = await wikiSearch(clean);
        const best = hits[0];
        wiki = {
          title: best.title,
          summary: String(best.snippet || "").replace(/<[^>]+>/g, ""),
          url: wikiPageUrl(best.title),
          image: null,
          description: ""
        };
        wikiSource = SOURCE_NAMES.wikiApi;
        try {
          const s = await wikiSummary(best.title);
          wiki = Object.assign(wiki, s);
        } catch (_) {}
      } catch (e) { errors.push("Wikipedia search: " + e.message); }
    }

    // Full article is best-effort; summary remains valid if extraction fails.
    if (wiki) {
      try { fullText = await wikiFull(wiki.title); }
      catch (e) { errors.push("Wikipedia article: " + e.message); }
    }

    // Independent entity source, useful when Wikipedia is unavailable.
    try { wd = await wikidataSearch(clean); }
    catch (e) { errors.push("Wikidata: " + e.message); }

    // Optional secondary web answer source.
    ddg = await fetchDuckDuckGo(clean);

    if (!wiki && !wd && !(ddg && (ddg.abstract || ddg.answer || ddg.definition))) {
      throw new Error("No online source could be reached. " + errors.slice(0, 3).join(" | "));
    }

    const title = (wiki && wiki.title) || (wd && wd.title) || (ddg && ddg.heading) || clean;
    const baseSummary = (wiki && wiki.summary) || (ddg && (ddg.abstract || ddg.answer || ddg.definition)) || (wd && wd.description) || "";
    const article = fullText || baseSummary;
    const parts = ["# " + title];
    if (wiki && wiki.description) parts.push("(" + wiki.description + ")");
    parts.push("");

    if (wiki) {
      parts.push("Source: " + wiki.url, "");
      if (ddg && ddg.answer) parts.push("## Direct web answer", ddg.answer, "");
      if (ddg && ddg.definition) parts.push("## Web definition", ddg.definition, "");
      if (ddg && ddg.abstract && ddg.abstract !== article.slice(0, ddg.abstract.length)) {
        parts.push("## Web overview", ddg.abstract, "");
      }
      parts.push("## Wikipedia article", article, "");
    } else {
      parts.push("## Online overview", article, "");
    }

    if (wd && wd.description) {
      parts.push("## Wikidata", wd.description, "Entity: " + wd.url, "");
    }
    if (ddg && ddg.related && ddg.related.length) {
      parts.push("## Related topics");
      ddg.related.forEach(r => parts.push("• " + r));
      parts.push("");
    }

    const combined = parts.join("\n").trim();
    const sources = [];
    if (wiki) sources.push({ name: wikiSource || SOURCE_NAMES.wikiRest, url: wiki.url });
    if (wd) sources.push({ name: SOURCE_NAMES.wikidata, url: wd.url });
    if (ddg && ddg.abstractUrl) sources.push({ name: ddg.abstractSource || SOURCE_NAMES.ddg, url: ddg.abstractUrl });
    if (ddg) sources.push({ name: SOURCE_NAMES.ddg, url: "https://duckduckgo.com/?q=" + encodeURIComponent(clean) });

    return {
      title,
      extract: combined.slice(0, 3000),
      content: combined.slice(0, MAX_TEXT),
      fullText: fullText || article,
      summary: baseSummary,
      url: (wiki && wiki.url) || (wd && wd.url) || (ddg && ddg.abstractUrl) || ("https://duckduckgo.com/?q=" + encodeURIComponent(clean)),
      image: (wiki && wiki.image) || (ddg && ddg.image) || null,
      sources,
      chars: combined.length,
      researchedAt: new Date().toISOString(),
      sourceCount: sources.length,
      networkErrors: errors.slice(0, 8)
    };
  }

  async function fetchUrlText(url) {
    let res;
    try { res = await fetchWithTimeout(url, fetchOpts()); }
    catch (e) { throw new Error("Network/CORS blocked for this URL. Try: look up Topic"); }
    if (!res.ok) throw new Error("Fetch failed HTTP " + res.status);
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("application/json")) {
      const j = await res.json();
      return { text: typeof j === "string" ? j : JSON.stringify(j, null, 2).slice(0, MAX_TEXT), contentType: "json" };
    }
    if (ct.includes("image/")) {
      const blob = await res.blob();
      const dataUrl = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(blob); });
      return { text: "[Image stored as data URL]", contentType: "image", dataUrl };
    }
    const html = await res.text();
    const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
    return { text, contentType: "html", html: html.slice(0, 150000) };
  }

  function storeInMemory(subject, content, source) {
    if (typeof Knowledge !== "undefined" && Knowledge.add) {
      Knowledge.add(subject, String(content || "").slice(0, MAX_KNOWLEDGE) + (source ? "\n\n(Source: " + source + ")" : ""), "online", { source: source || "online", dedupe: true });
    }
    if (typeof Blockchain !== "undefined" && Blockchain.addBlock) {
      try { Blockchain.addBlock({ type: "online", subject, source: source || null, chars: String(content || "").length }); } catch (_) {}
    }
    if (typeof Neurons !== "undefined" && Neurons.activate) Neurons.activate("online:learn", 4);
    if (typeof SelfEvolution !== "undefined" && SelfEvolution.afterOnlineLearn) {
      try { SelfEvolution.afterOnlineLearn(subject, String(content || "").length); } catch (_) {}
    }
  }

  function storePageOffline(url, payload) {
    const pages = loadPages();
    pages[url] = {
      savedAt: Date.now(),
      title: payload.title || url,
      text: String(payload.text || payload.extract || payload.content || "").slice(0, MAX_TEXT),
      html: payload.html ? String(payload.html).slice(0, 150000) : null,
      image: payload.image || payload.dataUrl || null,
      sources: payload.sources || null,
      researchedAt: payload.researchedAt || new Date().toISOString()
    };
    savePages(pages);
  }

  async function probe() {
    if (!isOnline()) return { ok: false, reason: "Browser reports offline" };
    try {
      const url = "https://en.wikipedia.org/api/rest_v1/page/summary/Internet";
      await fetchJsonWithRelayFallback(url, 7000);
      return { ok: true, status: 200, source: "Wikipedia REST/relay" };
    } catch (e) { return { ok: false, reason: e.message }; }
  }

  function status() {
    return {
      enabled: !!enabled,
      browserOnline: isOnline(),
      lookupReady: getEnabled(),
      offlinePages: Object.keys(loadPages()).length,
      sources: Object.values(SOURCE_NAMES),
      corsRelayFallback: true,
      corsRelays: CORS_RELAYS.slice(),
      architecture: "browser-source adapters -> normalized research -> local memory"
    };
  }

  async function learnTopic(topic) {
    if (!enabled) throw new Error("Online mode is disabled. Type: online on");
    if (!isOnline()) throw new Error("Browser reports offline. Connect to the internet, then try: look up " + (topic || "Topic"));
    const data = await fetchTopicFull(topic);
    storeInMemory(data.title, data.content || data.extract, data.sources && data.sources[0] ? data.sources[0].url : data.url);
    storePageOffline(data.url || ("wiki:" + data.title), data);
    return data;
  }

  async function learnUrl(url) {
    if (!getEnabled()) throw new Error("Offline or online mode disabled. Check your internet connection.");
    const got = await fetchUrlText(url);
    const subject = "Web: " + url.replace(/^https?:\/\//, "").slice(0, 80);
    storeInMemory(subject, got.text || "", url);
    storePageOffline(url, { title: subject, text: got.text, html: got.html, dataUrl: got.dataUrl, sources: [{ name: "Direct URL", url }] });
    return { title: subject, content: (got.text || "").slice(0, 8000), extract: (got.text || "").slice(0, 2500), url, image: got.dataUrl, sources: [{ name: "Direct URL", url }], chars: (got.text || "").length };
  }

  function listOfflinePages() {
    return Object.entries(loadPages()).map(([url, p]) => ({ url, title: p.title, savedAt: p.savedAt, chars: (p.text || "").length }));
  }
  function getOfflinePage(url) { return loadPages()[url] || null; }

  function searchOfflinePages(query) {
    const q = String(query || "").toLowerCase().split(/\W+/).filter(w => w.length > 2);
    const pages = loadPages();
    const hits = [];
    Object.keys(pages).forEach(url => {
      const p = pages[url];
      const blob = ((p.title || "") + " " + (p.text || "")).toLowerCase();
      let score = 0;
      q.forEach(w => { if (blob.includes(w)) score++; });
      if (score) hits.push({ url, title: p.title, score, snippet: (p.text || "").slice(0, 500) });
    });
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, 8);
  }

  function detectIntent(text) {
    const raw = String(text || "").trim();
    const lower = raw.toLowerCase();
    if (!lower) return null;
    if (/^(profile|my profile|show profile|view profile|post profile|who am i|balance|wallet|mission control|p2p\b|commands|diagnose|streak|review|set photo|set video|set bio|did|dwn)\b/i.test(lower)) return null;
    const cleanQuery = q => String(q || "").replace(/[?.!]+$/g, "").replace(/^(?:for|about|on)\s+/i, "")
      .replace(/\s+(?:please|online|for me|now|from the web|from internet|from wikipedia|on wikipedia|on google)$/i, "").replace(/\s+/g, " ").trim();
    if (/offline pages|saved pages|list downloaded|show offline/i.test(lower)) return { type: "list" };
    let m = raw.match(/(?:fetch url|download url|read url|learn from url|save url)\s+(\S+)/i);
    if (m) return { type: "url", query: m[1].trim().replace(/[.,;:!?)\]}>]+$/, "") };
    m = raw.match(/https?:\/\/\S+/i);
    if (m && /fetch|download|learn|store|save|read|offline/i.test(lower)) return { type: "url", query: m[0].replace(/[.,;:!?)\]}>]+$/, "") };
    const patterns = [
      /(?:^|\b)(?:look\s*up|lookup)\s+(.+)/i,
      /(?:^|\b)search\s+online\s+(?:for\s+)?(.+)/i,
      /(?:^|\b)(?:google|web\s*search|search\s+the\s+web|search\s+web)\s+(?:for\s+)?(.+)/i,
      /(?:^|\b)search\s+for\s+(.+)/i,
      /(?:^|\b)(?:learn\s+about|wikipedia|wiki)\s+(.+)/i,
      /(?:^|\b)fetch\s+(.+)/i
    ];
    for (let i = 0; i < patterns.length; i++) {
      m = raw.match(patterns[i]);
      if (m) { const q = cleanQuery(m[1]); if (q.length > 1) return { type: "topic", query: q }; }
    }
    if (/\b(online|wikipedia|from the web|from internet|google)\b/i.test(lower)) {
      m = raw.match(/(?:tell me about|what is|what's|who is|who was)\s+(.+)/i);
      if (m) { const q = cleanQuery(m[1]); if (q.length > 1) return { type: "topic", query: q }; }
    }
    return null;
  }

  return { isOnline, setEnabled, getEnabled, status, probe, fetchTopicFull, fetchWikipedia: fetchTopicFull, fetchUrlText, learnTopic, learnUrl, detectIntent, storeInMemory, listOfflinePages, getOfflinePage, searchOfflinePages, searchRelatedTopics: wikiSearch };
})();

if (typeof window !== "undefined") window.Online = Online;
