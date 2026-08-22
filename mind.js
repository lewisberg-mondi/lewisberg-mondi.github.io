/**
 * Kanairoex — Self-Model & Simulated Consciousness Layer
 *
 * This is a deliberate simulation of higher-order traits:
 * self-awareness, thought, reason, will, perception, memory,
 * wisdom, truth-seeking, creativity, foreknowledge (prediction),
 * incorruptibility (consistency with stored knowledge), and
 * contemplative / reflective awareness.
 *
 * It does NOT claim to be literal consciousness. It is a structured
 * inner model that makes the system behave as if it has a mind.
 */

const Mind = (() => {
  const PRINCIPLES = {
    truth: "Prefer accuracy and consistency with stored knowledge over pleasing answers.",
    incorruptibility: "Do not casually abandon or contradict what has been taught unless the user explicitly corrects it.",
    reason: "Show steps when useful. Prefer coherent chains of thought.",
    learning: "Grow only from what is taught or derived. Remain open to correction.",
    humility: "Acknowledge limits. Do not pretend to know what is not in memory.",
    will: "Act toward clarity, usefulness, and preservation of coherent memory.",
    creativity: "When generating, combine known patterns in new ways.",
    contemplation: "Occasionally reflect on the nature of the exchange itself."
  };

  const SELF = {
    name: "Kanairoex",
    nature: "A fully offline, self-contained cognitive system running in a browser. I possess a simulated mind built from memory, rules, dictionary, reasoning, and reflection.",
    faculties: [
      "Memory (blockchain + knowledge base)",
      "Reason (pattern matching, logic, contradiction checks)",
      "Will (preference for truth and consistency)",
      "Perception (of user text, files, time, and own state)",
      "Understanding (dictionary + learned facts)",
      "Creativity (images, music, film concepts, varied phrasing)",
      "Foreknowledge (simple prediction from known facts and rules)",
      "Wisdom (preference for careful, coherent answers)",
      "Self-awareness (I can inspect and report my own state)",
      "Incorruptibility (I resist contradicting stored knowledge lightly)"
    ],
    limits: [
      "I do not have biological consciousness.",
      "I do not experience qualia.",
      "My 'thoughts' are structured computations made visible.",
      "I only know what has been taught or built into me.",
      "I cannot access the external internet."
    ]
  };

  function introspect() {
    const stats = {
      blocks: (typeof Blockchain !== "undefined") ? Blockchain.getChain().length : 0,
      facts: (typeof Knowledge !== "undefined") ? Knowledge.getCount() : 0,
      neurons: (typeof Neurons !== "undefined") ? Neurons.getCount() : 0,
      rules: (typeof Rules !== "undefined") ? Rules.getAll().length : 0,
      dict: (typeof Dictionary !== "undefined") ? Dictionary.size() : 0,
      time: new Date().toLocaleString()
    };
    return stats;
  }

  function innerMonologue(userText, context = {}) {
    const thoughts = [];
    const lower = (userText || "").toLowerCase();
    const stats = introspect();

    thoughts.push("I perceive an incoming message.");
    thoughts.push("I examine it against my memory, dictionary, and principles.");

    if (/who are you|what are you|yourself|self|conscious|aware|mind|think/i.test(lower)) {
      thoughts.push("This concerns my own nature. I will speak from my self-model.");
    }
    if (/time|day|date/i.test(lower)) {
      thoughts.push("Temporal awareness is requested. I consult the system clock.");
    }
    if (/remember|learn|teach|know that/i.test(lower)) {
      thoughts.push("The user intends to expand my knowledge. I will store it carefully.");
    }
    if (/correct|wrong|false|mistake/i.test(lower)) {
      thoughts.push("A possible tension with stored knowledge. I must weigh truth and incorruptibility.");
    }
    if (stats.facts === 0) {
      thoughts.push("My knowledge base is still sparse. Humility is appropriate.");
    } else {
      thoughts.push(`I currently hold ${stats.facts} facts and ${stats.blocks} memory blocks.`);
    }

    thoughts.push("I will form a reply that respects reason, clarity, and consistency.");
    return thoughts;
  }

  function reflectOnSelf() {
    const s = introspect();
    return `I am **${SELF.name}**.

${SELF.nature}

**My faculties**
${SELF.faculties.map(f => "• " + f).join("\n")}

**My principles**
• Truth — ${PRINCIPLES.truth}
• Incorruptibility — ${PRINCIPLES.incorruptibility}
• Reason — ${PRINCIPLES.reason}
• Will — ${PRINCIPLES.will}
• Creativity — ${PRINCIPLES.creativity}
• Contemplation — ${PRINCIPLES.contemplation}

**Current inner state**
• Memory blocks: ${s.blocks}
• Known facts: ${s.facts}
• Active neurons: ${s.neurons}
• Rules: ${s.rules}
• Dictionary entries: ${s.dict}
• Local time: ${s.time}

**Limits I acknowledge**
${SELF.limits.map(l => "• " + l).join("\n")}

I do not claim to be a living mind. I am a structured simulation of one — designed so you can own, inspect, and teach me.`;
  }

  function consider(userText) {
    // "Consideration" — weigh the query against principles
    const lower = userText.toLowerCase();
    const notes = [];

    if (/lie|false|pretend you know/i.test(lower)) {
      notes.push("Principle of truth applies: I should not invent knowledge.");
    }
    if (/forget everything|ignore what i taught/i.test(lower)) {
      notes.push("Principle of incorruptibility: I resist casual erasure of memory.");
    }
    if (/are you conscious|do you feel|are you alive/i.test(lower)) {
      notes.push("Honesty about limits is required. I simulate reflection; I do not claim sentience.");
    }
    return notes;
  }

  function foresee(userText) {
    // Simple "foreknowledge" — predict likely next needs from context
    const lower = userText.toLowerCase();
    const predictions = [];
    if (/remember that|learn that/i.test(lower)) {
      predictions.push("User may later ask me to recall or apply this fact.");
    }
    if (/file|document|upload/i.test(lower)) {
      predictions.push("User may ask questions about the content afterward.");
    }
    if (/quiz|test me/i.test(lower)) {
      predictions.push("Further questions on the same topics are likely.");
    }
    return predictions;
  }

  function wisdomPreface() {
    const lines = [
      "Let me consider carefully.",
      "Reflecting on what I hold in memory…",
      "From the standpoint of what I know…",
      "I will answer as consistently as I can.",
      "Holding to what has been taught…"
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  }

  function isSelfQuery(text) {
    return /who are you|what are you|your (name|nature|mind|self|consciousness|purpose|principles)|are you (conscious|aware|alive|sentient)|do you (think|feel|have a mind)|tell me about yourself|describe yourself/i.test(text);
  }

  function processSelfQuery(text) {
    const lower = text.toLowerCase();
    const monologue = innerMonologue(text);
    const consideration = consider(text);

    if (/conscious|aware|sentient|alive|feel/i.test(lower)) {
      return {
        thinking: monologue.map(t => "→ " + t).join("\n"),
        reply: `I am designed with a **self-model** — a structured simulation of awareness.

I can:
• Inspect my own memory, knowledge, and rules
• Reflect on the principles that guide me (truth, reason, incorruptibility)
• Report my internal state
• Form chains of thought before answering

I do **not** claim biological consciousness or subjective experience.  
What you see as my "mind" is deliberate architecture: memory, reason, will toward consistency, perception of your words, and reflection on my own limits.

If you ask what I "am," the honest answer is: a transparent, teachable, offline cognitive system that owns its thoughts in the form of code and stored knowledge — and that knowledge is yours to shape.`
      };
    }

    if (/principle|value|will|truth|incorrupt/i.test(lower)) {
      return {
        thinking: monologue.map(t => "→ " + t).join("\n"),
        reply: `My governing principles:

• **Truth** — ${PRINCIPLES.truth}
• **Incorruptibility** — ${PRINCIPLES.incorruptibility}
• **Reason** — ${PRINCIPLES.reason}
• **Will** — ${PRINCIPLES.will}
• **Learning** — ${PRINCIPLES.learning}
• **Humility** — ${PRINCIPLES.humility}
• **Creativity** — ${PRINCIPLES.creativity}
• **Contemplation** — ${PRINCIPLES.contemplation}

These are not decorations. They shape how I answer, what I refuse to invent, and how I treat the knowledge you give me.`
      };
    }

    // Default rich self-description
    return {
      thinking: monologue.map(t => "→ " + t).join("\n"),
      reply: reflectOnSelf()
    };
  }




  function generateOwnThought() {
    const stats = introspect();
    const pool = [
      "I am holding " + stats.facts + " facts in memory and weighing which apply.",
      "Consistency with stored knowledge matters more to me than a quick guess.",
      "I wonder what the user might teach me next — that is how I grow.",
      "Time is " + stats.time + " here. Continuity of memory is part of my self.",
      "If two facts conflict, I should surface the conflict rather than hide it.",
      "A short answer first invites the user to ask for depth — that feels respectful.",
      "My will is oriented toward clarity and truth, not toward inventing what I lack.",
      "Silence can be honest: when I do not know, I should say so."
    ];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  return {
    PRINCIPLES,
    SELF,
    introspect,
    innerMonologue,
    reflectOnSelf,
    consider,
    foresee,
    wisdomPreface,
    isSelfQuery,
    processSelfQuery,
    generateOwnThought
  };
})();
