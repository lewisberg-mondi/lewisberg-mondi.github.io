/**
 * Kanairoex Response Formatter
 * Hint → Summary → Sections (continue)
 * Emotional tone + uncertainty / probability language
 */

const ResponseFmt = (() => {
  const emotions = {
    neutral: { prefix: "", tone: "clear", emoji: "🧠" },
    curious: { prefix: "Hmm… ", tone: "curious", emoji: "🤔" },
    warm: { prefix: "", tone: "warm", emoji: "😊" },
    careful: { prefix: "Carefully: ", tone: "careful", emoji: "⚠️" },
    confident: { prefix: "", tone: "confident", emoji: "✨" },
    uncertain: { prefix: "I'm not fully sure, but ", tone: "uncertain", emoji: "❔" },
    concerned: { prefix: "I notice a tension here. ", tone: "concerned", emoji: "😟" },
    reflective: { prefix: "Reflecting… ", tone: "reflective", emoji: "🪞" }
  };

  function pickEmotion(text, hasContradiction, hasKnowledge, isSelf) {
    if (hasContradiction) return "concerned";
    if (isSelf) return "reflective";
    if (!hasKnowledge) return "uncertain";
    if (/thank|please|hello|hi|hey/i.test(text)) return "warm";
    if (/why|how|explain/i.test(text)) return "curious";
    if (/correct|wrong|sure|certain/i.test(text)) return "careful";
    return "confident";
  }

  function splitIntoSections(fullText, maxChunk = 320) {
    if (!fullText || fullText.length <= maxChunk) {
      return [fullText];
    }
    const parts = [];
    // Prefer splitting on paragraphs / sentences
    const paras = fullText.split(/\n\n+/);
    let buf = "";
    for (const p of paras) {
      if ((buf + "\n\n" + p).length > maxChunk && buf) {
        parts.push(buf.trim());
        buf = p;
      } else {
        buf = buf ? buf + "\n\n" + p : p;
      }
    }
    if (buf.trim()) parts.push(buf.trim());

    // If still one huge block, split by sentences
    if (parts.length === 1 && parts[0].length > maxChunk * 1.5) {
      const sentences = parts[0].match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [parts[0]];
      const out = [];
      let b = "";
      for (const s of sentences) {
        if ((b + s).length > maxChunk && b) {
          out.push(b.trim());
          b = s;
        } else b += s;
      }
      if (b.trim()) out.push(b.trim());
      return out;
    }
    return parts;
  }

  function makeHint(topic, emotion) {
    const hints = [
      "I have something on this — want a short take first?",
      "There's an answer in my memory. I'll start small.",
      "I can speak to that. Here's a hint of where I'll go.",
      "Let me open this carefully.",
      "A thread from my knowledge applies here."
    ];
    return hints[Math.floor(Math.random() * hints.length)];
  }

  function makeSummary(core, emotion) {
    // First ~1-2 sentences or first 180 chars
    const clean = core.replace(/\*\*/g, "").trim();
    const m = clean.match(/^[^.!?\n]+[.!?]/);
    if (m && m[0].length < 220) return m[0].trim();
    if (clean.length <= 200) return clean;
    return clean.slice(0, 180).trim() + "…";
  }

  /**
   * Build staged response object stored for "continue"
   */
  function stage(fullReply, userText, meta = {}) {
    const emotion = pickEmotion(
      userText,
      !!meta.contradiction,
      !!meta.hasKnowledge,
      !!meta.isSelf
    );
    const emo = emotions[emotion];
    const sections = splitIntoSections(fullReply);
    const summary = makeSummary(sections[0] || fullReply, emotion);
    const hint = makeHint(userText, emotion);

    return {
      id: "r_" + Date.now(),
      emotion,
      hint: emo.prefix + hint,
      summary: summary,
      sections: sections,
      index: 0, // 0 = only hint+summary shown; continue advances
      complete: sections.length <= 1 && (sections[0] || "").length < 280,
      meta
    };
  }

  function renderStage(staged, level) {
    // level 0: hint + summary
    // level 1+: section by section
    if (level <= 0) {
      let out = staged.hint + "\n\n**Summary:** " + staged.summary;
      if (!staged.complete) {
        out += "\n\n_Ask **more** or **continue** for the full answer._";
      } else if (staged.sections[0] && staged.sections[0] !== staged.summary) {
        out += "\n\n" + staged.sections[0];
      }
      return out;
    }
    const idx = Math.min(level - 1, staged.sections.length - 1);
    let out = staged.sections[idx];
    if (idx < staged.sections.length - 1) {
      out += "\n\n_… **continue** for the next part (" + (idx + 2) + "/" + staged.sections.length + ")._";
    } else {
      out += "\n\n_(End of answer.)_";
    }
    return out;
  }

  function uncertaintyWrapper(text, confidence) {
    // confidence 0..1
    if (confidence >= 0.75) return text;
    if (confidence >= 0.45) {
      return text + "\n\n_(Confidence: moderate — based on partial matches in memory.)_";
    }
    return "I don't have a strong match in memory. My **best estimate** (low confidence):\n\n" + text +
      "\n\nYou can teach me the correct fact with: _Remember that …_";
  }

  return {
    stage,
    renderStage,
    uncertaintyWrapper,
    pickEmotion,
    splitIntoSections
  };
})();
