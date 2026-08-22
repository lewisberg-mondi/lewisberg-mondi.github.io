/* Kanairoex Thinking Engine — 5-stage process + task plans (transparent, labeled steps only). */
(function () {
  'use strict';

  /** Canonical process description (user-facing) */
  const PROCESS_EXPLAIN = [
    {
      stage: 1,
      title: "Receiving the question",
      detail: "You send a message; it is received as text (or speech converted to text). Processing stays on this device by default."
    },
    {
      stage: 2,
      title: "Processing the input",
      detail: "The text is broken into components, capturing words and their order. Models and rules analyze meaning and context of the question."
    },
    {
      stage: 3,
      title: "Understanding the intention",
      detail: "Intent is interpreted from keywords, context, and likely goal. Local pathways recognize dependencies between words and concepts (memory, tools, wallet, files)."
    },
    {
      stage: 4,
      title: "Generating a response",
      detail: "Based on the analysis, the system selects the most suitable answer path — knowledge, file study, swap/create token, P2P, or online learn — assembling a coherent result."
    },
    {
      stage: 5,
      title: "Forming the reply",
      detail: "Selected content is assembled into a fluent reply and returned to you, with a visible thinking pipeline so the path stays transparent."
    }
  ];

  const Thinking = {
    PROCESS_EXPLAIN: PROCESS_EXPLAIN,

    classify(task) {
      const s = String(task || "").toLowerCase();
      if (s.includes("token") || s.includes("wallet") || s.includes("pay") || s.includes("lmt") || s.includes("economy")) return "economy";
      if (s.includes("file") || s.includes("summary") || s.includes("summarize") || s.includes("document") || s.includes("upload")) return "document";
      if (s.includes("search") || s.includes("look up") || s.includes("online") || s.includes("wikipedia") || s.includes("research")) return "research";
      if (s.includes("code") || s.includes("script") || s.includes("function") || s.includes("implement")) return "coding";
      if (s.includes("teach") || s.includes("explain") || s.includes("why") || s.includes("how")) return "teach";
      if (s.includes("calculate") || /\d+\s*[+\-*/%]\s*\d+/.test(s)) return "math";
      if (s.includes("upgrade") || s.includes("evolve") || s.includes("improve myself") || s.includes("self")) return "evolution";
      if (/how do you (think|work|process)|your process|explain your (process|thinking)/i.test(s)) return "meta";
      return "general";
    },

    plan(task) {
      const type = this.classify(task);
      const map = {
        economy: ["Check wallet / token state", "Validate amount & address", "Route transfer or create token", "Confirm balance / outbox", "Report clearly"],
        document: ["Load document content", "Identify structure & key points", "Extract evidence", "Reason about purpose & claims", "Write structured summary"],
        research: ["Clarify the question", "Search offline memory first", "Fetch online if allowed", "Save useful material to memory", "Answer with sources"],
        coding: ["Understand requirements", "Design approach", "Generate implementation", "Check edge cases", "Present runnable result"],
        teach: ["Assess level", "Break into steps", "Give example", "Check understanding", "Summarize"],
        math: ["Parse expression", "Compute", "Verify", "State units/assumptions"],
        evolution: ["Assess current capabilities", "Identify gap", "Propose local upgrade", "Apply safe self-patch", "Log change"],
        meta: ["Receive the meta-question", "Describe the five processing stages", "Relate stages to Kanairoex tools", "Keep explanation honest and local"],
        general: ["Understand request", "Use memory & tools", "Reason step by step", "Verify important claims", "Respond clearly"]
      };
      return { type: type, steps: map[type] || map.general, task: String(task || "").slice(0, 240) };
    },

    /** Five-stage pipeline steps for this turn */
    pipelineSteps(userText) {
      const preview = String(userText || "").trim().slice(0, 80);
      return [
        "1. Receive — input accepted" + (preview ? ' ("' + preview + (userText.length > 80 ? "…" : "") + '")' : ""),
        "2. Process — tokenize & structure words",
        "3. Intent — classify goal (" + this.classify(userText) + ")",
        "4. Generate — use memory, tools, and plan",
        "5. Form reply — assemble clear answer"
      ];
    },

    formatSteps(plan) {
      return (plan.steps || [])
        .map(function (s, i) {
          return "→ " + (i + 1) + ". " + s;
        })
        .join("\n");
    },

    /** Full human explanation of the process */
    explainProcess() {
      let out = "**How Kanairoex processes your message**\n\n";
      PROCESS_EXPLAIN.forEach(function (s) {
        out += "**" + s.stage + ". " + s.title + "**\n" + s.detail + "\n\n";
      });
      out +=
        "These steps run quickly on-device. Kanairoex is not a giant cloud neural net; " +
        "it combines rules, memory, tools (wallet, files, online learn), and structured plans.\n\n" +
        "_Type any question to see the five pipeline steps in the thinking trace._";
      return out;
    },

    async run(task, executor) {
      const p = this.plan(task);
      const log = p.steps.map(function (label, i) {
        return { step: i + 1, label: label, status: "pending" };
      });
      let result = null;
      for (let i = 0; i < log.length; i++) log[i].status = "running";
      if (typeof executor === "function") {
        try {
          result = await executor(p);
          log.forEach(function (x) {
            x.status = "complete";
          });
        } catch (e) {
          log.forEach(function (x) {
            if (x.status === "running") x.status = "error";
          });
          result = { error: e.message || String(e) };
        }
      } else {
        log.forEach(function (x) {
          x.status = "complete";
        });
      }
      return {
        summary: "Plan (" + p.type + "): " + p.steps.join(" → "),
        type: p.type,
        steps: log,
        thinkingText: this.formatSteps(p),
        pipeline: this.pipelineSteps(task),
        result: result
      };
    },

    studyText(name, content, question) {
      const text = String(content || "");
      const words = text.trim().split(/\s+/).filter(Boolean);
      const lines = text.split("\n").filter(function (l) {
        return l.trim();
      });
      const sentences = text.split(/(?<=[.!?])\s+/).filter(function (s) {
        return s.trim().length > 20;
      });
      const stop = {
        the: 1, and: 1, for: 1, that: 1, this: 1, with: 1, from: 1, are: 1, was: 1,
        were: 1, been: 1, have: 1, has: 1, not: 1, but: 1, you: 1, your: 1, can: 1,
        will: 1, all: 1, any: 1, into: 1, about: 1
      };
      const freq = {};
      words.forEach(function (w) {
        const k = w.toLowerCase().replace(/[^a-z0-9\-]/g, "");
        if (k.length < 4 || stop[k]) return;
        freq[k] = (freq[k] || 0) + 1;
      });
      const keywords = Object.keys(freq)
        .sort(function (a, b) {
          return freq[b] - freq[a];
        })
        .slice(0, 12);
      const keyPoints = sentences.slice(0, 6).map(function (s) {
        return s.trim().slice(0, 180);
      });
      const plan = this.plan(question || "study " + name);
      let focused = "";
      if (question) {
        const q = question.toLowerCase();
        const hits = sentences
          .filter(function (s) {
            return q.split(/\s+/).some(function (w) {
              return w.length > 3 && s.toLowerCase().indexOf(w) >= 0;
            });
          })
          .slice(0, 5);
        focused = hits.length
          ? hits.join("\n\n")
          : "(No direct sentence match — using overall summary.)";
      }
      return {
        thinking: this.pipelineSteps(question || name).join("\n") + "\n" + this.formatSteps(plan),
        name: name,
        stats: { words: words.length, lines: lines.length, chars: text.length },
        keywords: keywords,
        keyPoints: keyPoints,
        focused: focused,
        preview: text.slice(0, 500).replace(/\s+/g, " ").trim()
      };
    },

    renderStudy(study) {
      return (
        "**Thinking**\n" +
        study.thinking +
        "\n\n**Study: " +
        study.name +
        "**\n" +
        "• ~" +
        study.stats.words +
        " words · " +
        study.stats.lines +
        " lines · " +
        study.stats.chars +
        " chars\n" +
        "• Keywords: " +
        (study.keywords.join(", ") || "—") +
        "\n\n**Key points**\n" +
        study.keyPoints
          .map(function (p, i) {
            return i + 1 + ". " + p;
          })
          .join("\n") +
        "\n\n" +
        (study.focused ? "**Relevant to your question**\n" + study.focused + "\n\n" : "") +
        "**Preview**\n" +
        study.preview +
        (study.stats.chars > 500 ? "…" : "")
      );
    }
  };

  window.KanairoexThinking = Thinking;
})();
