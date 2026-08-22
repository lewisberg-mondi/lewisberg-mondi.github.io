/**
 * Detect & Predict — pattern detection from memory + simple forecasts
 */
const Predict = (() => {
  function detectFromMemory(text) {
    const facts = (typeof Knowledge !== "undefined") ? Knowledge.getAll() : [];
    if (!facts.length) return null;
    const lower = text.toLowerCase();
    const words = lower.split(/\W+/).filter(w => w.length > 3);
    const hits = [];
    for (const f of facts) {
      let score = 0;
      const blob = (f.subject + " " + f.content).toLowerCase();
      for (const w of words) if (blob.includes(w)) score++;
      if (score > 0) hits.push({ fact: f, score });
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, 5);
  }

  function detectAnomaly(text) {
    // Compare claim against stored facts
    const facts = (typeof Knowledge !== "undefined") ? Knowledge.getAll() : [];
    const lower = text.toLowerCase();
    for (const f of facts) {
      const subj = f.subject.toLowerCase();
      if (subj.length > 3 && lower.includes(subj.split(/\s+/)[0])) {
        // crude opposite detection
        if (/not |isn't |is not |never |no longer/i.test(lower) && !/not |isn't /i.test(f.content)) {
          return {
            type: "contradiction",
            message: `Detected possible conflict with stored knowledge about **${f.subject}**: "${f.content}"`
          };
        }
      }
    }
    return null;
  }

  function predict(text) {
    const lower = text.toLowerCase();
    const hits = detectFromMemory(text) || [];

    // Time-based
    if (/predict|what will|forecast|likely|next/i.test(lower)) {
      if (typeof Calendar !== "undefined" && /holiday/i.test(lower)) {
        const up = Calendar.upcoming(60);
        if (up.length) {
          return `Based on my calendar, a likely next notable day is **${up[0].name}** on ${up[0].date}` +
            (up[0].inDays ? ` (in ${up[0].inDays} days)` : " (today)") + ".";
        }
      }
      if (hits.length) {
        const top = hits[0].fact;
        return `From patterns in my memory, the most relevant thread is **${top.subject}**: ${top.content}\n\n` +
          `**Prediction (low–moderate confidence):** related questions will keep returning to this topic unless new facts are taught.`;
      }
      if (typeof Mind !== "undefined") {
        return "I don't have strong statistical models offline, but from my principles: " +
          "without new data, the best prediction is that my answers will stay limited to what you have taught me. " +
          "Teach more facts to improve future predictions.";
      }
    }

    if (/detect|find pattern|anomaly|conflict/i.test(lower)) {
      const a = detectAnomaly(text);
      if (a) return a.message;
      if (hits.length) {
        return "Detection over memory:\n" + hits.map(h =>
          `• (${h.score} match) **${h.fact.subject}** — ${h.fact.content.slice(0, 120)}`
        ).join("\n");
      }
      return "No strong anomaly detected in stored knowledge for that query.";
    }

    return null;
  }

  return { detectFromMemory, detectAnomaly, predict };
})();
