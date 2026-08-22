/**
 * Question understanding — WH extraction, topic, Bloom type
 */
const Question = (() => {
  const TYPES = {
    knowledge: /\b(what is|what's|who is|who was|who are|when|where is|where are|where was|define|list|name)\b/i,
    comprehension: /\b(explain|describe|summarize|interpret|in your own words|what does)\b/i,
    application: /\b(how would you|apply|use|solve|calculate|demonstrate|how can|how to)\b/i,
    analysis: /\b(compare|contrast|analyze|analyse|difference|examine|why)\b/i,
    synthesis: /\b(create|design|compose|propose|combine|plan|invent)\b/i,
    evaluation: /\b(evaluate|judge|justify|argue|best|assess|critique)\b/i
  };

  const WH_PREFIX = /^(who|what|where's|where's|where|when|why|how|which|whose|whom)\b/i;

  function classify(text) {
    const lower = text.toLowerCase();
    for (const [type, re] of Object.entries(TYPES)) {
      if (re.test(lower)) return type;
    }
    if (/\?$/.test(text.trim())) return "knowledge";
    if (WH_PREFIX.test(text.trim())) return "knowledge";
    return "general";
  }

  /** Strip question framing to get the topic entity/phrase */
  function extractTopic(text) {
    let t = String(text || "").trim();
    t = t.replace(/[?!.]+$/g, "").trim();
    const patterns = [
      /^(who\s+(?:is|was|are|were)\s+)/i,
      /^(what\s+(?:is|was|are|were|does|did|do)\s+(?:a\s+|an\s+|the\s+)?)/i,
      /^(what'?s\s+(?:a\s+|an\s+|the\s+)?)/i,
      /^(where\s+(?:is|was|are|were)\s+(?:the\s+|a\s+|an\s+)?)/i,
      /^(when\s+(?:is|was|are|were|did|does)\s+)/i,
      /^(why\s+(?:is|was|are|were|do|does|did)\s+)/i,
      /^(how\s+(?:is|was|are|were|do|does|did|can|could|would|should)\s+)/i,
      /^(how\s+to\s+)/i,
      /^(which\s+)/i,
      /^(tell\s+me\s+(?:about\s+)?)/i,
      /^(define\s+)/i,
      /^(explain\s+)/i,
      /^(describe\s+)/i
    ];
    for (const re of patterns) {
      if (re.test(t)) {
        t = t.replace(re, "");
        break;
      }
    }
    t = t.replace(/^(a|an|the)\s+/i, "").trim();
    // drop trailing "mean" / "about"
    t = t.replace(/\s+(mean|meaning|about)\s*$/i, "").trim();
    return t || String(text || "").trim();
  }

  function analyze(text) {
    const type = classify(text);
    const topic = extractTopic(text);
    const words = topic.replace(/[?!.]/g, "").split(/\s+/).filter(w => w.length > 1);
    return {
      type,
      topic: topic.slice(0, 120),
      topicWords: words,
      scope: words.length > 8 ? "broad" : "focused",
      focus: words.slice(0, 6).join(" ") || topic,
      isQuestion:
        /\?/.test(text) ||
        /^(what|why|how|who|when|where|which|can|should|is|are|do|does|did|tell|define|explain)\b/i.test(
          text.trim()
        )
    };
  }

  function label(type) {
    const map = {
      knowledge: "Knowledge (recall)",
      comprehension: "Comprehension (understand)",
      application: "Application (use)",
      analysis: "Analysis (break down)",
      synthesis: "Synthesis (create)",
      evaluation: "Evaluation (judge)",
      general: "General"
    };
    return map[type] || type;
  }

  return { classify, analyze, label, extractTopic };
})();
