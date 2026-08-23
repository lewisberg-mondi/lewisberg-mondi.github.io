/**
 * Kanairoex AI Core
 * Orchestrates blockchain, knowledge, neurons, math and reasoning.
 */

const AI = (() => {
  const SETTINGS_KEY = "localmind_settings";
  const HISTORY_KEY = "localmind_history";

  function defaultSettings() {
    return {
      aiName: "Kanairoex",
      responseStyle: "helpful",
      autoLearn: true,
      correctMode: true
    };
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? { ...defaultSettings(), ...JSON.parse(raw) } : defaultSettings();
    } catch {
      return defaultSettings();
    }
  }

  function saveSettings(s) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  }

  function loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveHistory(h) {
    // Keep last 200 messages
    const trimmed = h.slice(-200);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  }

  function process(userText, extraSettings) {
    const settings = Object.assign({}, loadSettings(), extraSettings || {});
    const text = userText.trim();
    if (!text) return null;

    // Record user message in blockchain
    Blockchain.addBlock({
      type: "message",
      role: "user",
      content: text
    });

    // Educational micro-reward for questions (0.001 LMT) — skipped for pure commands
    try {
      if (
        typeof LMTWallet !== "undefined" &&
        LMTWallet.rewardQuestion &&
        text.length > 8 &&
        /\?$|^(what|who|where|when|why|how|explain|define)\b/i.test(text)
      ) {
        LMTWallet.rewardQuestion();
      }
    } catch (_) {}

    // One coherent brain pass: context -> plan -> reasoning -> verification/evidence.
    const brainState = (typeof BrainController !== "undefined" && BrainController.before)
      ? BrainController.before(text, settings)
      : { plan: { types: ["general"], complexity: 1 }, context: {} };

    // Built-in diagnostics are deterministic and do not require network access.
    if (/^diagnose(?:\s+(all|system|brain|image|web|memory))?$/i.test(text) && typeof BrainController !== "undefined") {
      const d = BrainController.diagnose();
      const h = BrainController.health();
      const reply = "**Kanairoex system health**\n\n" +
        "• Brain controller: **" + (d.ok ? "ready" : "degraded") + "**\n" +
        "• Modules available: **" + Object.keys(h.modules).filter(k => h.modules[k]).length + "/" + Object.keys(h.modules).length + "**\n" +
        "• Context turns: **" + ((d.context && d.context.turns) || 0) + "**\n" +
        "• Image fallback: **" + (d.providers && d.providers.image && d.providers.image.jsonpFallback ? "enabled" : "unavailable") + "**\n\n" +
        "Use `diagnose all` for the full diagnostic object in the developer console.";
      const result = { thinking: "→ Brain diagnostics\n→ Checking modules\n→ Checking provider fallbacks", reply, creative: null, brain: { diagnostic: d, health: h } };
      Blockchain.addBlock({ type: "message", role: "assistant", content: reply, thinking: result.thinking });
      const history = loadHistory();
      history.push({ role: "user", content: text, ts: Date.now() });
      history.push({ role: "assistant", content: reply, thinking: result.thinking, ts: Date.now() });
      saveHistory(history);
      return { ...result, settings };
    }

    // Run reasoning
    let result = Reasoning.reason(text, settings);
    if (typeof BrainController !== "undefined" && BrainController.after) {
      result = BrainController.after(text, result, brainState);
    }

    // Async advanced commands (WebRTC, wallet, etc.) — defer history until UI resolves them
    if (result && result._advancedPromise) {
      return {
        thinking: result.thinking || "→ Advanced technology",
        reply: null,
        creative: null,
        online: null,
        syncNow: false,
        _advancedPromise: result._advancedPromise,
        settings
      };
    }

    // Style adjustment
    let reply = result.reply;
    if (reply == null) reply = "";

    if (settings.responseStyle === "concise" && reply) {
      reply = reply.split("\n").slice(0, 6).join("\n");
    } else if (settings.responseStyle === "curious" && reply) {
      reply += "\n\nWhat else would you like me to learn or explore?";
    } else if (settings.responseStyle === "strict") {
      // already corrective by nature
    }

    // Mood sense + emoji (sentinel / emotional cues in text)
    try {
      if (typeof MoodEmoji !== "undefined" && reply) {
        reply = MoodEmoji.decorateReply(reply, text);
      }
    } catch (_) {}

    // Record AI reply
    Blockchain.addBlock({
      type: "message",
      role: "assistant",
      content: reply,
      thinking: result.thinking,
      creativeType: result.creative ? result.creative.type : null
    });

    // Update history
    const history = loadHistory();
    history.push({ role: "user", content: text, ts: Date.now() });
    history.push({ role: "assistant", content: reply, thinking: result.thinking, ts: Date.now() });
    saveHistory(history);
    try {
      if (typeof BrainContext !== "undefined" && BrainContext.rememberTurn) {
        BrainContext.rememberTurn(text, reply, {
          intent: brainState.plan && brainState.plan.types ? brainState.plan.types.join("+") : "general",
          activeTopic: (brainState.context && brainState.context.activeTopic) || ""
        });
      }
    } catch (_) {}

    // Auto-learn simple statements if enabled
    if (settings.autoLearn) {
      const teach = Reasoning.detectTeachIntent(text);
      // already handled inside reason, but also capture plain "X is Y"
      if (!teach) {
        const plain = text.match(/^(.{3,60}?)\s+is\s+(.{3,120})$/i);
        if (plain && !/who|what|where|when|why|how/i.test(plain[1])) {
          Knowledge.add(plain[1].trim(), plain[2].trim(), "general");
        }
      }
    }

    // Append time for context (except pure creative/code dumps)
    if (reply && reply.length < 4000 && !result.creative) {
      const t = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      if (!/Local time/i.test(reply)) reply += "\n\n_[" + t + "]_";
    }

    // Store user question topic lightly into memory for training continuity
    if (settings.autoLearn && text.length > 12 && text.length < 200 && !/^(hi|hello|hey)\b/i.test(text)) {
      try {
        const key = text.slice(0, 60);
        if (typeof Knowledge !== "undefined" && Knowledge.search(key).length === 0) {
          // don't store questions as facts — only clear statements handled above
        }
      } catch (e) {}
    }

    return {
      thinking: result.thinking,
      reply: reply,
      creative: result.creative || null,
      online: result.online || null,
      // Preserve special async-routing metadata so app.js can execute
      // video search (and any future research handlers) after reasoning.
      videoSearch: result.videoSearch || null,
      imageSearch: result.imageSearch || null,
      githubCodeSearch: result.githubCodeSearch || null,
      referenceSearch: result.referenceSearch || null,
      syncNow: result.syncNow || false,
      brain: result.brain || null,
      verification: result.brain && result.brain.verification ? result.brain.verification : null,
      evidence: result.brain && result.brain.evidence ? result.brain.evidence : null,
      settings
    };
  }

  function getStats() {
    return {
      blocks: Blockchain.getChain().length,
      facts: Knowledge.getCount(),
      neurons: Neurons.getCount()
    };
  }

  function exportAll() {
    if (typeof LMUpgrade !== "undefined" && LMUpgrade.fullExport) {
      try { return LMUpgrade.fullExport(); } catch (e) {}
    }
    return {
      version: 9.4,
      exported: new Date().toISOString(),
      settings: loadSettings(),
      knowledge: Knowledge.exportData(),
      chain: Blockchain.getChain(),
      neurons: typeof Neurons !== "undefined" ? Neurons.getAll() : [],
      history: loadHistory(),
      cognitive: typeof KanairoexCognitive !== "undefined" ? {
        working: KanairoexCognitive.WorkingMemory.load(),
        memories: KanairoexCognitive.Memory.all(),
        graphNodes: KanairoexCognitive.Graph.nodes(),
        graphEdges: KanairoexCognitive.Graph.edges()
      } : null
    };
  }

  function importAll(data) {
    try {
      if (data.settings) saveSettings(data.settings);
      if (data.knowledge) Knowledge.importData(data.knowledge);
      if (data.chain) {
        localStorage.setItem("localmind_chain", JSON.stringify(data.chain));
      }
      if (data.neurons) {
        localStorage.setItem("localmind_neurons", JSON.stringify(data.neurons));
      }
      if (data.history) saveHistory(data.history);
      if (data.cognitive && typeof KanairoexCognitive !== "undefined") {
        if (data.cognitive.working) KanairoexCognitive.WorkingMemory.save(data.cognitive.working);
        if (Array.isArray(data.cognitive.memories)) KanairoexCognitive.Memory.save(data.cognitive.memories);
        if (Array.isArray(data.cognitive.graphNodes)) localStorage.setItem("localmind_cognitive_v1_graph_nodes", JSON.stringify(data.cognitive.graphNodes));
        if (Array.isArray(data.cognitive.graphEdges)) localStorage.setItem("localmind_cognitive_v1_graph_edges", JSON.stringify(data.cognitive.graphEdges));
      }
      return true;
    } catch {
      return false;
    }
  }

  function clearAll() {
    Blockchain.clear();
    Knowledge.clear();
    Neurons.clear();
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(SETTINGS_KEY);
    try { if (typeof KanairoexCognitive !== "undefined") { KanairoexCognitive.Memory.clear(); KanairoexCognitive.Graph.clear(); KanairoexCognitive.WorkingMemory.reset(); } } catch (_) {}
  }

  return {
    process,
    loadSettings,
    saveSettings,
    loadHistory,
    saveHistory,
    getStats,
    exportAll,
    importAll,
    clearAll
  };
})();
