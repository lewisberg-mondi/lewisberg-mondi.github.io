/**
 * File reader — text extraction, store in memory, readable summaries
 */
const Files = (() => {
  let currentContent = null;
  let currentName = null;

  const TEXT_EXTS = [".txt",".md",".json",".csv",".js",".html",".css",".xml",".log",".py",".ts",".jsx",".tsx",".yaml",".yml",".ini",".cfg",".env",".sql",".rtf",".tsv",".htm",".svg"];

  function isTextFile(name, type) {
    const lower = (name || "").toLowerCase();
    if (TEXT_EXTS.some(ext => lower.endsWith(ext))) return true;
    if ((type || "").startsWith("text/")) return true;
    if (type === "application/json" || type === "application/javascript") return true;
    return false;
  }

  function cleanText(raw) {
    if (!raw) return "";
    let s = String(raw);
    // strip nulls and non-printable except newline tab
    s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
    // if mostly garbage (binary misread), detect
    const sample = s.slice(0, 2000);
    const printable = (sample.match(/[\x20-\x7E\n\r\t]/g) || []).length;
    if (sample.length > 50 && printable / sample.length < 0.7) {
      return null; // signal binary
    }
    return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  }

  function loadFile(file) {
    return new Promise((resolve, reject) => {
      if (!file) return reject("No file");
      const isText = isTextFile(file.name, file.type);

      if (isText || !file.type || file.type === "application/octet-stream") {
        const reader = new FileReader();
        reader.onload = () => {
          let content = cleanText(reader.result);
          if (content === null) {
            currentContent = null;
            currentName = file.name;
            Knowledge.add("File: " + file.name, "Binary or unreadable file uploaded (" + file.size + " bytes). Text could not be extracted.", "file");
            resolve({ name: file.name, content: null, size: file.size, type: "binary" });
            return;
          }
          currentContent = content;
          currentName = file.name;
          // Store full text in memory (capped)
          const store = content.slice(0, 50000);
          Knowledge.add("File: " + file.name, store, "file", { source: "file:" + file.name, dedupe: true });
          var sumTxt = makeSummaryText(file.name, content);
          Knowledge.add("Summary of " + file.name, typeof sumTxt === "string" ? sumTxt.slice(0, 3000) : String(sumTxt).slice(0, 3000), "file", { source: "file-summary:" + file.name, dedupe: true });
          if (typeof Blockchain !== "undefined") Blockchain.addBlock({ type: "file", name: file.name, size: file.size, chars: content.length });
          if (typeof Neurons !== "undefined") Neurons.activate("files:load", 3);
          resolve({ name: file.name, content, size: file.size, type: "text" });
        };
        reader.onerror = () => reject("Failed to read file");
        reader.readAsText(file);
      } else if ((file.type || "").startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = () => {
          currentContent = "[Image file — cannot OCR offline without a vision model]";
          currentName = file.name;
          Knowledge.add("Image: " + file.name, "Image uploaded (" + file.size + " bytes). Display only; no offline vision OCR.", "file");
          resolve({ name: file.name, content: reader.result, size: file.size, type: "image", dataUrl: reader.result });
        };
        reader.readAsDataURL(file);
      } else {
        Knowledge.add("File: " + file.name, "Uploaded non-text file (" + file.size + " bytes, type " + (file.type || "unknown") + ").", "file");
        resolve({ name: file.name, content: null, size: file.size, type: "binary" });
      }
    });
  }

  function makeSummaryText(name, content) {
    if (typeof KanairoexThinking !== "undefined") {
      try {
        const study = KanairoexThinking.studyText(name, content, "summarize this document");
        return KanairoexThinking.renderStudy(study);
      } catch (e) {}
    }
    const lines = content.split("\n").filter(l => l.trim());
    const words = content.trim().split(/\s+/).filter(Boolean);
    const preview = content.slice(0, 400).replace(/\s+/g, " ").trim();
    return "File \"" + name + "\" has " + lines.length + " lines and about " + words.length + " words. Preview: " + preview + (content.length > 400 ? "…" : "");
  }

  function getCurrent() {
    return currentContent != null ? { name: currentName, content: currentContent } : null;
  }

  function clear() { currentContent = null; currentName = null; }

  function answerAbout(question) {
    const lower = (question || "").toLowerCase();
    // Prefer current file; else search knowledge for file facts
    let text = currentContent;
    let name = currentName;
    if (!text) {
      const facts = Knowledge.search("File:");
      if (facts && facts.length) {
        // pick best keyword match
        const rel = Knowledge.findRelevant(question, 3).filter(f => f.category === "file" || /^File:|^Summary of/i.test(f.subject));
        if (rel.length) {
          return "From stored file memory:\n\n**" + rel[0].subject + "**\n" + rel[0].content.slice(0, 1500);
        }
      }
      return null;
    }
    if (text.indexOf("[Image file") === 0) {
      return "This is an image file (" + name + "). I can store it as an upload record but cannot read visual content offline.";
    }
    const lines = text.split("\n");
    const words = text.trim().split(/\s+/).filter(Boolean);

    if (/summary|summarize|overview|what is (in )?this|describe (the )?file|what's in/i.test(lower)) {
      return makeSummaryText(name, text) + "\n\nFirst lines:\n" + lines.slice(0, 8).join("\n");
    }
    if (/how many lines|line count/i.test(lower)) return "**" + name + "** has **" + lines.length + "** lines.";
    if (/how many words|word count/i.test(lower)) return "**" + name + "** has about **" + words.length + "** words.";
    if (/full content|show (me )?(the )?content|read (the )?file|print (the )?file/i.test(lower)) {
      return "Content of **" + name + "** (up to 3000 chars):\n\n" + text.slice(0, 3000) + (text.length > 3000 ? "\n…" : "");
    }
    // keyword search
    const qWords = lower.split(/\W+/).filter(w => w.length > 2);
    const matches = lines.map((l, i) => ({ l, i })).filter(({ l }) => qWords.some(w => l.toLowerCase().includes(w))).slice(0, 12);
    if (matches.length) {
      return "In **" + name + "**:\n\n" + matches.map(m => "• (line " + (m.i + 1) + ") " + m.l.trim()).join("\n");
    }
    return makeSummaryText(name, text);
  }

  return { loadFile, getCurrent, clear, answerAbout, isTextFile };
})();
