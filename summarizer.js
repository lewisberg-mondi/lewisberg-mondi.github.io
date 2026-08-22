/**
 * Offline long-text / story study & summary
 * Pure client-side extractive + structured summary (no external API)
 */
const Summarizer = (() => {
  function detect(text) {
    const t = text || "";
    const lower = t.toLowerCase();
    // Explicit summarize commands
    if (/^(summarize|summary of|give me a summary|tl;dr|tldr)\b/i.test(lower.trim())) {
      const body = t.replace(/^(summarize|summary of|give me a summary|tl;dr|tldr)\s*(this|the|my)?\s*(story|text|passage|article)?\s*[:\-]?\s*/i, "").trim();
      if (body.length > 80) return { type: "summary", body: body };
    }
    // "Study this story:" or "Analyze this text:"
    if (/^(study|analyse|analyze|review)\s+(this\s+)?(story|text|passage|article|novel|chapter)\b/i.test(lower)) {
      const body = t.replace(/^(study|analyse|analyze|review)\s+(this\s+)?(story|text|passage|article|novel|chapter)\s*[:\-]?\s*/i, "").trim();
      if (body.length > 80) return { type: "study", body: body };
    }
    // Long pasted text with summarize intent somewhere
    if (t.length > 400 && /\b(summarize|summary|main points|key points|what is this about)\b/i.test(lower)) {
      return { type: "summary", body: t };
    }
    // Very long paste alone → offer study mode detection
    if (t.length > 1200 && !/\?$/.test(t.trim()) && !/^(remember|look up|build|draw|grade|hello|hi)\b/i.test(lower)) {
      return { type: "auto", body: t };
    }
    return null;
  }

  function sentences(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .split(/(?<=[.!?])\s+/)
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 20; });
  }

  function wordFreq(text) {
    const stop = {
      the:1, a:1, an:1, and:1, or:1, but:1, in:1, on:1, at:1, to:1, for:1, of:1, as:1, is:1, was:1, were:1,
      be:1, been:1, being:1, it:1, its:1, this:1, that:1, these:1, those:1, with:1, from:1, by:1, he:1, she:1,
      they:1, them:1, his:1, her:1, their:1, we:1, you:1, i:1, me:1, my:1, our:1, not:1, no:1, so:1, if:1,
      then:1, than:1, into:1, about:1, after:1, before:1, over:1, under:1, again:1, there:1, when:1, where:1,
      what:1, which:1, who:1, how:1, had:1, has:1, have:1, did:1, do:1, does:1, would:1, could:1, should:1,
      can:1, will:1, just:1, also:1, very:1, more:1, some:1, any:1, all:1, each:1, other:1, only:1, own:1,
      such:1, same:1, than:1, too:1, out:1, up:1, down:1, him:1, her:1, said:1
    };
    const freq = {};
    String(text || "").toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").split(/\s+/).forEach(function (w) {
      if (w.length < 3 || stop[w]) return;
      freq[w] = (freq[w] || 0) + 1;
    });
    return freq;
  }

  function scoreSentence(sent, freq) {
    const words = sent.toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").split(/\s+/);
    let score = 0;
    words.forEach(function (w) {
      if (freq[w]) score += freq[w];
    });
    // slight preference for mid-length sentences
    if (sent.length > 40 && sent.length < 220) score *= 1.15;
    if (sent.length < 30) score *= 0.6;
    return score / Math.max(1, Math.sqrt(words.length));
  }

  function topKeywords(freq, n) {
    return Object.keys(freq)
      .sort(function (a, b) { return freq[b] - freq[a]; })
      .slice(0, n || 8);
  }

  function extractCharacters(text) {
    const names = {};
    const re = /\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?)\b/g;
    let m;
    const skip = { The:1, This:1, That:1, Then:1, When:1, Where:1, What:1, After:1, Before:1, However:1, Therefore:1, Chapter:1, Once:1 };
    while ((m = re.exec(text)) !== null) {
      const n = m[1];
      if (skip[n]) continue;
      names[n] = (names[n] || 0) + 1;
    }
    return Object.keys(names)
      .sort(function (a, b) { return names[b] - names[a]; })
      .filter(function (n) { return names[n] >= 2; })
      .slice(0, 8);
  }

  function study(body) {
    const text = String(body || "").trim();
    const sents = sentences(text);
    const freq = wordFreq(text);
    const keywords = topKeywords(freq, 10);
    const chars = extractCharacters(text);
    const words = text.split(/\s+/).filter(Boolean).length;
    const paras = text.split(/\n\s*\n/).filter(function (p) { return p.trim().length > 40; });

    // Rank sentences
    const ranked = sents.map(function (s, i) {
      return { s: s, i: i, score: scoreSentence(s, freq) };
    }).sort(function (a, b) { return b.score - a.score; });

    const take = Math.min(6, Math.max(3, Math.ceil(sents.length * 0.18)));
    const chosen = ranked.slice(0, take).sort(function (a, b) { return a.i - b.i; });

    // Short abstract (2–3 top sentences)
    const abstract = ranked.slice(0, Math.min(3, ranked.length))
      .sort(function (a, b) { return a.i - b.i; })
      .map(function (x) { return x.s; })
      .join(" ");

    let out = "";
    out += "## Story / text study (offline)\n\n";
    out += "| Metric | Value |\n|--------|--------|\n";
    out += "| Words | **" + words + "** |\n";
    out += "| Sentences | **" + sents.length + "** |\n";
    out += "| Paragraphs (approx.) | **" + Math.max(paras.length, 1) + "** |\n\n";

    out += "### Summary\n" + abstract + "\n\n";

    out += "### Key points\n";
    chosen.forEach(function (x, idx) {
      out += (idx + 1) + ". " + x.s + "\n";
    });
    out += "\n";

    if (chars.length) {
      out += "### People / names mentioned often\n";
      chars.forEach(function (c) { out += "• " + c + "\n"; });
      out += "\n";
    }

    out += "### Keywords\n" + keywords.map(function (k) { return "`" + k + "`"; }).join(", ") + "\n\n";

    out += "### Themes (inferred)\n";
    const themeHints = [];
    const L = text.toLowerCase();
    if (/love|heart|marry|romance/i.test(L)) themeHints.push("relationships / love");
    if (/war|battle|soldier|fight/i.test(L)) themeHints.push("conflict / war");
    if (/school|student|teacher|exam/i.test(L)) themeHints.push("education");
    if (/death|die|grave|mourn/i.test(L)) themeHints.push("loss / mortality");
    if (/journey|travel|road|path/i.test(L)) themeHints.push("journey");
    if (/power|king|rule|govern/i.test(L)) themeHints.push("power / authority");
    if (/fear|danger|escape|dark/i.test(L)) themeHints.push("fear / survival");
    if (/friend|together|help/i.test(L)) themeHints.push("friendship / loyalty");
    if (!themeHints.length) themeHints.push("See keywords and key points above");
    themeHints.forEach(function (th) { out += "• " + th + "\n"; });

    out += "\n_Summary built offline on your device (extractive). For literature essays, still quote the original text._";

    // Remember abstract into knowledge lightly
    if (typeof Knowledge !== "undefined" && abstract.length > 40) {
      try {
        Knowledge.add("Story summary", abstract.slice(0, 500), "literature");
      } catch (e) {}
    }
    if (typeof Neurons !== "undefined" && Neurons.coActivate) {
      try { Neurons.coActivate(["summary"].concat(keywords.slice(0, 4)), 2); } catch (e) {}
    }

    return out;
  }

  function handle(intent) {
    if (!intent || !intent.body) return null;
    if (intent.type === "auto") {
      return "This looks like a long text (" + intent.body.split(/\s+/).length + " words). Studying it offline…\n\n" + study(intent.body);
    }
    return study(intent.body);
  }

  return { detect: detect, study: study, handle: handle };
})();
