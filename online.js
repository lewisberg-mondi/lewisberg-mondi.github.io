/**
 * Online mode — multi-source fetch (Wikipedia + DuckDuckGo)
 * Hardened for GitHub Pages / HTTPS hosts:
 *  - Prefer Wikipedia REST (CORS *), fall back to action API with origin=*
 *  - Api-User-Agent header (Wikimedia policy)
 *  - DuckDuckGo is best-effort (CORS often blocked)
 *  - Clear errors when offline / blocked
 */
const Online = (() => {
  let enabled = true;
  const PAGE_KEY = "localmind_offline_pages";
  const MAX_TEXT = 200000;
  const MAX_KNOWLEDGE = 50000;
  const FETCH_TIMEOUT_MS = 15000;
  const API_UA = "KanairoexAI/1.0 (educational offline browser app; lookup)";

  async function fetchWithTimeout(url, options) {
    const opts = Object.assign({}, options || {});
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT_MS);
    opts.signal = controller.signal;
    try {
      return await fetch(url, opts);
    } catch (e) {
      if (e && e.name === "AbortError") throw new Error("Network request timed out after 15 seconds");
      const msg = (e && e.message) ? e.message : String(e);
      if (/Failed to fetch|NetworkError|Load failed|CORS/i.test(msg)) {
        throw new Error(
          "Browser blocked the network request (CORS/offline). " +
          "Confirm you are online and that the site is served over HTTPS (e.g. GitHub Pages)."
        );
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  function isOnline() {
    try {
      if (typeof navigator === "undefined") return true;
      // navigator.onLine can be wrong; treat unknown as online and let fetch fail clearly
      return navigator.onLine !== false;
    } catch (_) {
      return true;
    }
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
        keys.slice(0, keys.length - 40).forEach(function (k) { delete p[k]; });
        try { localStorage.setItem(PAGE_KEY, JSON.stringify(p)); } catch (e2) {}
      }
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
        // Wikimedia asks clients to identify themselves
        "Api-User-Agent": API_UA
      }, extraHeaders || {})
    };
  }

  function wikiPageUrl(title) {
    return "https://en.wikipedia.org/wiki/" + encodeURIComponent(String(title || "").replace(/\s+/g, "_"));
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

  /** Resolve best Wikipedia title via REST first, then action API search */
  async function resolveWikiTitle(topic) {
    const clean = (topic || "").trim().replace(/[?.!]+$/g, "");
    if (!clean) throw new Error("Empty topic");

    // 1) REST summary by title guess
    const encoded = encodeURIComponent(clean.replace(/\s+/g, "_"));
    const sumUrl = "https://en.wikipedia.org/api/rest_v1/page/summary/" + encoded;
    try {
      const res = await fetchWithTimeout(sumUrl, fetchOpts({ Accept: "application/json" }));
      if (res.ok) {
        const parsed = parseSummaryJson(await res.json());
        if (parsed) return parsed;
      }
    } catch (e) { /* fall through */ }

    // 2) REST search (more reliable CORS than action API under load)
    try {
      const restSearch =
        "https://en.wikipedia.org/w/rest.php/v1/search/page?q=" +
        encodeURIComponent(clean) +
        "&limit=5";
      const rs = await fetchWithTimeout(restSearch, fetchOpts({ Accept: "application/json" }));
      if (rs.ok) {
        const js = await rs.json();
        const pages = js.pages || [];
        if (pages.length) {
          const best = pages[0].title || pages[0].key;
          const sum2 = "https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(String(best).replace(/\s+/g, "_"));
          const r2 = await fetchWithTimeout(sum2, fetchOpts({ Accept: "application/json" }));
          if (r2.ok) {
            const parsed = parseSummaryJson(await r2.json());
            if (parsed) return parsed;
          }
          return {
            title: best,
            summary: pages[0].description || pages[0].excerpt || "",
            url: wikiPageUrl(best),
            image: pages[0].thumbnail && pages[0].thumbnail.url ? pages[0].thumbnail.url : null,
            description: pages[0].description || ""
          };
        }
      }
    } catch (e) { /* fall through */ }

    // 3) Classic action API search (origin=* for CORS)
    const searchUrl =
      "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=" +
      encodeURIComponent(clean) +
      "&srlimit=5&format=json&origin=*";
    const sRes = await fetchWithTimeout(searchUrl, fetchOpts({ Accept: "application/json" }));
    if (sRes.status === 429) {
      throw new Error("Wikipedia is rate-limiting requests. Wait ~20 seconds and try again.");
    }
    if (!sRes.ok) throw new Error("Wikipedia search failed (HTTP " + sRes.status + ")");
    const sData = await sRes.json();
    const hits = (sData.query && sData.query.search) || [];
    if (!hits.length) throw new Error('No Wikipedia page found for "' + clean + '"');

    const best = hits[0].title;
    try {
      const sum2 = "https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(best.replace(/\s+/g, "_"));
      const r2 = await fetchWithTimeout(sum2, fetchOpts({ Accept: "application/json" }));
      if (r2.ok) {
        const parsed = parseSummaryJson(await r2.json());
        if (parsed) return parsed;
      }
    } catch (e) { /* use hit snippet */ }

    return {
      title: best,
      summary: String(hits[0].snippet || "").replace(/<[^>]+>/g, ""),
      url: wikiPageUrl(best),
      image: null,
      description: ""
    };
  }

  /**
   * Optional longer article text (action API). Never throws — summary is enough.
   * Do NOT call rest_v1/page/mobile-sections* — Wikimedia shut it down (HTTP 403 "Access denied").
   */
  async function fetchWikipediaFull(title) {
    try {
      const url =
        "https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&exsectionformat=plain&redirects=1&titles=" +
        encodeURIComponent(title) +
        "&format=json&origin=*";
      const res = await fetchWithTimeout(url, fetchOpts({ Accept: "application/json" }));
      if (!res.ok) return "";
      const data = await res.json();
      if (data && data.error) return "";
      const pages = (data.query && data.query.pages) || {};
      const page = Object.values(pages)[0];
      if (!page || page.missing) return "";
      return (page.extract || "").trim();
    } catch (e) {
      return "";
    }
  }

  /** DuckDuckGo Instant Answer — best-effort; many browsers block this host */
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
        if (rt.Topics) {
          rt.Topics.forEach(function (t) {
            if (t.Text) related.push(t.Text);
          });
        }
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
    } catch (e) {
      return null;
    }
  }

  /**
   * Multi-source gather: full Wikipedia + optional DuckDuckGo.
   * Wikipedia alone is enough for a successful lookup.
   */
  async function fetchTopicFull(topic) {
    const clean = (topic || "").trim().replace(/[?.!]+$/g, "");
    if (!clean) throw new Error("Empty topic");
    if (!isOnline()) {
      throw new Error("Your browser reports offline. Connect to the internet and try again.");
    }

    // Run sources in parallel; DDG failure must not fail the whole lookup
    const wikiPromise = resolveWikiTitle(clean);
    const ddgPromise = fetchDuckDuckGo(clean).catch(function () { return null; });

    let wikiMeta;
    try {
      wikiMeta = await wikiPromise;
    } catch (e) {
      // Last chance: DDG-only answer
      const ddgOnly = await ddgPromise;
      if (ddgOnly && (ddgOnly.abstract || ddgOnly.answer || ddgOnly.definition)) {
        const parts = ["# " + clean, ""];
        if (ddgOnly.answer) { parts.push("## Direct answer", ddgOnly.answer, ""); }
        if (ddgOnly.definition) { parts.push("## Definition", ddgOnly.definition, ""); }
        if (ddgOnly.abstract) { parts.push("## Overview", ddgOnly.abstract, ""); }
        const combined = parts.join("\n").trim();
        return {
          title: ddgOnly.heading || clean,
          extract: combined.slice(0, 2500),
          content: combined,
          fullText: ddgOnly.abstract || "",
          summary: ddgOnly.abstract || ddgOnly.answer || "",
          url: ddgOnly.abstractUrl || ("https://duckduckgo.com/?q=" + encodeURIComponent(clean)),
          image: ddgOnly.image,
          sources: [{ name: "DuckDuckGo", url: ddgOnly.abstractUrl || "" }].filter(function (s) { return s.url; }),
          chars: combined.length
        };
      }
      throw e;
    }

    const ddg = await ddgPromise;

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

  function status() {
    return {
      enabled: !!enabled,
      browserOnline: isOnline(),
      lookupReady: getEnabled(),
      offlinePages: Object.keys(loadPages()).length,
      sources: ["Wikipedia REST", "Wikipedia API", "DuckDuckGo (optional)"]
    };
  }

  async function learnTopic(topic) {
    if (!isOnline()) {
      throw new Error("Browser reports offline. Connect to the internet, then try: look up " + (topic || "Topic"));
    }
    if (!enabled) {
      throw new Error("Online mode is disabled. Type: online on");
    }
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
    status: status,
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
