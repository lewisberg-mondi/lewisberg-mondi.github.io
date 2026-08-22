/**
 * Memory analyzer — verify, rectify, correct stored facts
 */
const Verify = (() => {
  function findBySubject(subject) {
    const all = Knowledge.getAll();
    const s = subject.toLowerCase();
    return all.filter(f => f.subject.toLowerCase().includes(s) || f.content.toLowerCase().includes(s));
  }

  function correct(subject, newContent) {
    const all = Knowledge.getAll();
    let updated = 0;
    const next = all.map(f => {
      if (f.subject.toLowerCase().includes(subject.toLowerCase()) || f.id === subject) {
        updated++;
        return Object.assign({}, f, { content: newContent, corrected: Date.now() });
      }
      return f;
    });
    if (updated === 0) {
      Knowledge.add(subject, newContent, "corrected");
      updated = 1;
    } else {
      localStorage.setItem("localmind_knowledge", JSON.stringify(next));
    }
    Blockchain.addBlock({ type: "correct", subject, newContent: newContent.slice(0, 200) });
    Neurons.activate("verify:correct", 3);
    return updated;
  }

  function analyze(question) {
    const hits = (typeof Knowledge !== "undefined") ? Knowledge.findRelevant(question, 6) : [];
    if (!hits.length) {
      return { ok: false, message: "No matching facts in memory to verify against." };
    }
    let msg = "Memory analysis for your question:\n\n";
    hits.forEach((f, i) => {
      msg += (i + 1) + ". **" + f.subject + "** — " + f.content.slice(0, 220) + (f.content.length > 220 ? "…" : "") + "\n";
    });
    msg += "\nIf any entry is wrong, say: **Correct [subject] to [true fact]**";
    return { ok: true, message: msg, hits };
  }

  function detectCorrectIntent(text) {
    const m = text.match(/^correct\s+(.+?)\s+to\s+(.+)$/i);
    if (m) return { subject: m[1].trim(), content: m[2].trim() };
    return null;
  }

  return { findBySubject, correct, analyze, detectCorrectIntent };
})();
