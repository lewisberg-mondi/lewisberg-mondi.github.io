/**
 * Online mode — multi-source fetch (Wikipedia full text + DuckDuckGo + more)
 * Stores full article text offline. Works from file:// via CORS-friendly APIs.
 * Note: Google Search is not available from the browser without an API key
 * (CORS + anti-bot). We use Wikipedia + DuckDuckGo Instant Answer instead.
 */
const Online = (() => {
  let enabled = true;
  const PAGE_KEY = "localmind_offline_pages";
  const MAX_TEXT = 200000; // full articles can be large
  const MAX_KNOWLEDGE = 50000;
  const FETCH_TIMEOUT_MS = 12000;

  async function fetchWithTimeout(url, options) {
    const opts = Object.assign({}, options || {});
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    opts.signal = controller.signal;
    try { return await fetch(url, opts); }
    catch (e) {
      if (e && e.name === "AbortError") throw new Error("Network request timed out after 12 seconds");
      throw e;
    }
    finally { clearTimeout(timer); }
  }

  function isOnline() {
    return typeof navigator === "undefined" || navigator.onLine !== false;
  }
  function setEnabled(v) { enabled = !!v; }
  function getEnabled() { return enabled && isOnline(); }

  function loadPages() {
    try { return JSON.parse(localStorage.getItem(PAGE_KEY) || "{}"); } catch { return {}; }
  }
  function savePages(p) {
    try { localStorage.setItem(PAGE_KEY, JSON.stringify(p)); } catch (e) {
      const keys = Object.keys(p);
      if (keys.length > 40) {
        keys.slice(0, keys.length - 40).forEach(k => delete p[k]);
        try { localStorage.setItem(PAGE_KEY, JSON.stringify(p)); } catch (e2) {}
      }
    }
  }

  function fetchOpts(extraHeaders) {
    return {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      cache: "default",
      headers: Object.assign({
        "Accept": "application/json, text/html, */*"
      }, extraHeaders || {})
    };
  }

  /** Resolve best Wikipedia title via search if needed */
  async function resolveWikiTitle(topic) {
    const clean = (topic || "").trim().replace(/[?.!]+$/, "");
    if (!clean) throw new Error("Empty topic");

    // Quick summary probe
    const encoded = encodeURIComponent(clean.replace(/\s+/g, "_"));
    const sumUrl = "https://en.wikipedia.org/api/rest_v1/page/summary/" + encoded;
    try {
      const res = await fetchWithTimeout(sumUrl, fetchOpts({ Accept: "application/json" }));
      if (res.ok) {
        const data = await res.json();
        if (data.type !== "disambiguation" && data.title) {
          return {
            title: data.title,
            summary: data.extract || data.description || "",
            url: (data.content_urls && data.content_urls.desktop && data.content_urls.desktop.page) ||
              ("https://en.wikipedia.org/wiki/" + encodeURIComponent(data.title.replace(/\s+/g, "_"))),
            image: data.thumbnail && data.thumbnail.source ? data.thumbnail.source : null,
            description: data.description || ""
          };
        }
      }
    } catch (e) { /* fall through to search */ }

    const searchUrl =
      "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=" +
      encodeURIComponent(clean) +
      "&srlimit=5&format=json&origin=*";
    const sRes = await fetchWithTimeout(searchUrl, fetchOpts({ Accept: "application/json" }));
    if (!sRes.ok) throw new Error("Wikipedia search " + sRes.status);
    const sData = await sRes.json();
    const hits = (sData.query && sData.query.search) || [];
    if (!hits.length) throw new Error('No Wikipedia page found for "' + clean + '"');

    const best = hits[0].title;
    const sum2 = "https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(best.replace(/\s+/g, "_"));
    const r2 = await fetchWithTimeout(sum2, fetchOpts({ Accept: "application/json" }));
    if (r2.ok) {
      const data = await r2.json();
      return {
        title: data.title || best,
        summary: data.extract || data.description || hits[0].snippet || "",
        url: (data.content_urls && data.content_urls.desktop && data.content_urls.desktop.page) ||
          ("https://en.wikipedia.org/wiki/" + encodeURIComponent(best.replace(/\s+/g, "_"))),
        image: data.thumbnail && data.thumbnail.source ? data.thumbnail.source : null,
        description: data.description || ""
      };
    }
    return {
      title: best,
      summary: (hits[0].snippet || "").replace(/<[^>]+>/g, ""),
      url: "https://en.wikipedia.org/wiki/" + encodeURIComponent(best.replace(/\s+/g, "_")),
      image: null,
      description: ""
    };
  }

  /** Full plain-text article from Wikipedia (can be 50k–100k+ chars) */
  async function fetchWikipediaFull(title) {
    const url =
      "https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&exsectionformat=plain&redirects=1&titles=" +
      encodeURIComponent(title) +
      "&format=json&origin=*";
    const res = await fetchWithTimeout(url, fetchOpts({ Accept: "application/json" }));
    if (!res.ok) throw new Error("Wikipedia full extract " + res.status);
    const data = await res.json();
    const pages = (data.query && data.query.pages) || {};
    const page = Object.values(pages)[0];
    if (!page || page.missing) return "";
    return (page.extract || "").trim();
  }

  /** DuckDuckGo Instant Answer (CORS *). Good for definitions, related topics, direct answers. */
  async function fetchDuckDuckGo(topic) {
    try {
      const url =
        "https://api.duckduckgo.com/?q=" +
        encodeURIComponent(topic) +
        "&format=json&no_html=1&skip_disambig=1";
      const res = await fetchWithTimeout(url, fetchOpts({ Accept: "application/json" }));
      if (!res.ok) return null;
      const d = await res.json();
      const related = [];
      (d.RelatedTopics || []).forEach(function (rt) {
        if (rt.Text) related.push(rt.Text);
        if (rt.Topics) rt.Topics.forEach(function (t) { if (t.Text) related.push(t.Text); });
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
        image: d.Image ? ("https://duckduckgo.com" + d.Image) : null
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * Multi-source gather: full Wikipedia + DuckDuckGo Instant Answer.
   * Returns rich object with full text for offline storage.
   */
  async function fetchTopicFull(topic) {
    const clean = (topic || "").trim().replace(/[?.!]+$/, "");
    if (!clean) throw new Error("Empty topic");

    const [wikiMeta, ddg] = await Promise.all([
      resolveWikiTitle(clean),
      fetchDuckDuckGo(clean)
    ]);

    let fullText = "";
    try {
      fullText = await fetchWikipediaFull(wikiMeta.title);
    } catch (e) {
      fullText = wikiMeta.summary || "";
    }
    if (!fullText) fullText = wikiMeta.summary || "";

    // Build combined document
    const parts = [];
    parts.push("# " + (wikiMeta.title || clean));
    if (wikiMeta.description) parts.push("(" + wikiMeta.description + ")");
    parts.push("");
    parts.push("Source: " + (wikiMeta.url || "Wikipedia"));
    parts.push("");

    if (ddg && ddg.answer) {
      parts.push("## Direct answer");
      parts.push(ddg.answer);
      parts.push("");
    }
    if (ddg && ddg.definition) {
      parts.push("## Definition");
      parts.push(ddg.definition + (ddg.definitionUrl ? "\n(" + ddg.definitionUrl + ")" : ""));
      parts.push("");
    }
    if (ddg && ddg.abstract && ddg.abstract !== fullText.slice(0, ddg.abstract.length)) {
      parts.push("## Quick overview (DuckDuckGo / " + (ddg.abstractSource || "web") + ")");
      parts.push(ddg.abstract);
      parts.push("");
    }

    parts.push("## Full article (Wikipedia)");
    parts.push(fullText || wikiMeta.summary || "No full text available.");
    parts.push("");

    if (ddg && ddg.related && ddg.related.length) {
      parts.push("## Related topics");
      ddg.related.forEach(function (r) { parts.push("• " + r); });
      parts.push("");
    }

    const combined = parts.join("\n").trim();
    const image = wikiMeta.image || (ddg && ddg.image) || null;

    return {
      title: wikiMeta.title || clean,
      extract: combined.slice(0, 2500), // short preview for chat UI
      content: combined,                // full body
      fullText: fullText,
      summary: wikiMeta.summary,
      url: wikiMeta.url,
      image: image,
      sources: [
        wikiMeta.url ? { name: "Wikipedia", url: wikiMeta.url } : null,
        ddg && ddg.abstractUrl ? { name: ddg.abstractSource || "DuckDuckGo", url: ddg.abstractUrl } : null,
        { name: "DuckDuckGo Instant Answer", url: "https://duckduckgo.com/?q=" + encodeURIComponent(clean) }
      ].filter(Boolean),
      chars: combined.length
    };
  }

  // Back-compat alias used by older call sites
  async function fetchWikipedia(topic) {
    const data = await fetchTopicFull(topic);
    return {
      title: data.title,
      extract: data.content || data.extract,
      url: data.url,
      image: data.image
    };
  }

  async function fetchUrlText(url) {
    let res;
    try {
      res = await fetchWithTimeout(url, fetchOpts());
    } catch (netErr) {
      throw new Error(
        "Network/CORS blocked for this URL. " +
        "Prefer “look up Topic” (multi-source Wikipedia + DuckDuckGo) when opened from a file."
      );
    }
    if (!res.ok) throw new Error("Fetch failed " + res.status);
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("application/json")) {
      const j = await res.json();
      return { text: typeof j === "string" ? j : JSON.stringify(j, null, 2).slice(0, MAX_TEXT), contentType: "json" };
    }
    if (ct.includes("image/")) {
      const blob = await res.blob();
      const dataUrl = await new Promise(function (resolve, reject) {
        const r = new FileReader();
        r.onload = function () { resolve(r.result); };
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
      return { text: "[Image stored as data URL]", contentType: "image", dataUrl: dataUrl };
    }
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_TEXT);
    return { text: text, contentType: "html", html: html.slice(0, 150000) };
  }

  function storeInMemory(subject, content, source) {
    if (typeof Knowledge !== "undefined") {
      Knowledge.add(
        subject,
        content.slice(0, MAX_KNOWLEDGE) + (source ? "\n\n(Source: " + source + ")" : ""),
        "online",
        { source: source || "online", dedupe: true }
      );
    }
    if (typeof Blockchain !== "undefined") {
      Blockchain.addBlock({ type: "online", subject: subject, source: source || null, chars: (content || "").length });
    }
    if (typeof Neurons !== "undefined") Neurons.activate("online:learn", 4);
    if (typeof SelfEvolution !== "undefined" && SelfEvolution.afterOnlineLearn) {
      try { SelfEvolution.afterOnlineLearn(subject, (content || "").length); } catch (e) {}
    }
  }

  function storePageOffline(url, payload) {
    const pages = loadPages();
    pages[url] = {
      savedAt: Date.now(),
      title: payload.title || url,
      text: (payload.text || payload.extract || payload.content || "").slice(0, MAX_TEXT),
      html: payload.html ? String(payload.html).slice(0, 150000) : null,
      image: payload.image || payload.dataUrl || null,
      sources: payload.sources || null
    };
    savePages(pages);
  }

  async function learnTopic(topic) {
    if (!getEnabled()) throw new Error("Offline or online mode disabled. Check your internet connection.");
    const data = await fetchTopicFull(topic);
    storeInMemory(data.title, data.content || data.extract, data.url);
    storePageOffline(data.url || ("wiki:" + data.title), {
      title: data.title,
      text: data.content || data.extract,
      image: data.image,
      sources: data.sources
    });
    return data;
  }

  async function learnUrl(url) {
    if (!getEnabled()) throw new Error("Offline or online mode disabled. Check your internet connection.");
    const got = await fetchUrlText(url);
    const subject = "Web: " + url.replace(/^https?:\/\//, "").slice(0, 80);
    storeInMemory(subject, got.text || "", url);
    storePageOffline(url, { title: subject, text: got.text, html: got.html, dataUrl: got.dataUrl });
    return { title: subject, content: (got.text || "").slice(0, 8000), extract: (got.text || "").slice(0, 2500), url: url, image: got.dataUrl };
  }

  function listOfflinePages() {
    return Object.entries(loadPages()).map(function (pair) {
      return { url: pair[0], title: pair[1].title, savedAt: pair[1].savedAt, chars: (pair[1].text || "").length };
    });
  }

  function getOfflinePage(url) {
    return loadPages()[url] || null;
  }

  function searchOfflinePages(query) {
    const q = (query || "").toLowerCase().split(/\W+/).filter(function (w) { return w.length > 2; });
    const pages = loadPages();
    const hits = [];
    for (const url of Object.keys(pages)) {
      const p = pages[url];
      const blob = ((p.title || "") + " " + (p.text || "")).toLowerCase();
      let score = 0;
      for (const w of q) if (blob.includes(w)) score++;
      if (score > 0) hits.push({ url: url, title: p.title, score: score, snippet: (p.text || "").slice(0, 500) });
    }
    hits.sort(function (a, b) { return b.score - a.score; });
    return hits.slice(0, 8);
  }

  function detectIntent(text) {
    const raw = (text || "").trim();
    const lower = raw.toLowerCase();
    if (!lower) return null;
    // System / profile commands are never web topics
    if (/^(profile|my profile|show profile|view profile|post profile|who am i|balance|wallet|mission control|p2p\b|commands|diagnose|streak|review|set photo|set video|set bio|did|dwn)\b/i.test(lower)) {
      return null;
    }

    function cleanQuery(q) {
      return String(q || "")
        .replace(/[?.!]+$/g, "")
        .replace(/^(?:for|about|on)\s+/i, "")
        .replace(/\s+(?:please|online|for me|now|from the web|from internet|from wikipedia|on wikipedia|on google|via google)$/i, "")
        .replace(/\s+/g, " ")
        .trim();
    }

    if (/offline pages|saved pages|list downloaded|show offline/i.test(lower)) {
      return { type: "list" };
    }

    let m = raw.match(/(?:fetch url|download url|read url|learn from url|save url)\s+(\S+)/i);
    if (m) return { type: "url", query: m[1].trim().replace(/[.,;:!?)\]}>]+$/, "") };

    m = raw.match(/https?:\/\/\S+/i);
    if (m && /fetch|download|learn|store|save|read|offline/i.test(lower)) {
      return { type: "url", query: m[0].replace(/[.,;:!?)\]}>]+$/, "") };
    }

    const topicPatterns = [
      /(?:^|\b)(?:look\s*up|lookup)\s+(.+)/i,
      /(?:^|\b)search\s+online\s+(?:for\s+)?(.+)/i,
      /(?:^|\b)(?:google|web\s*search|search\s+the\s+web|search\s+web)\s+(?:for\s+)?(.+)/i,
      /(?:^|\b)search\s+for\s+(.+)/i,
      /(?:^|\b)(?:learn\s+about|wikipedia|wiki)\s+(.+)/i,
      /(?:^|\b)fetch\s+(.+)/i
    ];
    for (let i = 0; i < topicPatterns.length; i++) {
      m = lower.match(topicPatterns[i]);
      if (m) {
        const q = cleanQuery(m[1]);
        if (q.length > 1) return { type: "topic", query: q };
      }
    }

    if (/\b(online|wikipedia|from the web|from internet|google)\b/i.test(lower)) {
      m = lower.match(/(?:tell me about|what is|what's|who is|who was)\s+(.+)/i);
      if (m) {
        const q = cleanQuery(m[1]);
        if (q.length > 1) return { type: "topic", query: q };
      }
    }

    return null;
  }

  return {
    isOnline: isOnline,
    setEnabled: setEnabled,
    getEnabled: getEnabled,
    fetchWikipedia: fetchWikipedia,
    fetchTopicFull: fetchTopicFull,
    fetchUrlText: fetchUrlText,
    learnTopic: learnTopic,
    learnUrl: learnUrl,
    detectIntent: detectIntent,
    storeInMemory: storeInMemory,
    listOfflinePages: listOfflinePages,
    getOfflinePage: getOfflinePage,
    searchOfflinePages: searchOfflinePages
  };
})();

if (typeof window !== 'undefined') window.Online = Online;
