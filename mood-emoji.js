/**
 * Kanairoex Mood & Emoji Sense
 * Detects user mood, enriches replies with fitting emoji, and maps concepts
 * to the right emoji when communication needs one.
 * LMT visual symbol is always 💎.
 */
const MoodEmoji = (() => {
  const LMT_EMOJI = "💎";

  /** Concept → emoji (used when a reply needs the “right” emoji in text) */
  const CONCEPTS = {
    // money / tokens
    money: "💰", cash: "💵", dollar: "💵", euro: "💶", yen: "💴", pound: "💷",
    diamond: "💎", gem: "💎", lmt: "💎", token: "🪙", coin: "🪙", wallet: "👛",
    bank: "🏦", chart: "📈", chart_down: "📉", trade: "💱", pay: "💸", gift: "🎁",
    // tech
    ai: "🧠", brain: "🧠", robot: "🤖", computer: "💻", phone: "📱", code: "💻",
    bug: "🐛", rocket: "🚀", satellite: "🛰️", link: "🔗", lock: "🔒", unlock: "🔓",
    key: "🔑", shield: "🛡️", fire: "🔥", lightning: "⚡", star: "⭐", stars: "✨",
    // communication
    chat: "💬", message: "📩", email: "📧", bell: "🔔", megaphone: "📢",
    // people / emotion
    love: "❤️", heart: "❤️", hearts: "💕", kiss: "💋", hug: "🫂",
    happy: "😊", laugh: "😂", cry: "😢", sad: "😔", angry: "😡", cool: "😎",
    think: "🤔", idea: "💡", celebrate: "🎉", party: "🥳", clap: "👏",
    wave: "👋", pray: "🙏", ok: "👌", thumbs_up: "👍", thumbs_down: "👎",
    // nature / time
    sun: "☀️", moon: "🌙", cloud: "☁️", rain: "🌧️", snow: "❄️", earth: "🌍",
    tree: "🌳", flower: "🌸", water: "💧",
    // status
    success: "✅", error: "❌", warning: "⚠️", stop: "🛑", check: "✔️",
    question: "❓", info: "ℹ️", new: "🆕",
    // files / media
    file: "📄", folder: "📁", book: "📚", image: "🖼️", music: "🎵", video: "🎬",
    camera: "📷", search: "🔍",
    // animals (sample)
    dog: "🐶", cat: "🐱", fox: "🦊", bear: "🐻", panda: "🐼",
    // misc
    coffee: "☕", food: "🍽️", home: "🏠", car: "🚗", plane: "✈️", clock: "⏰",
    calendar: "📅", map: "🗺️", pin: "📍", trophy: "🏆", medal: "🥇",
    zombie: "🧟", ghost: "👻", alien: "👽", skull: "💀", poop: "💩"
  };

  /** Rich mood table with sentinels */
  const moods = {
    happy: { emoji: "😊", sentinel: "🟢", label: "happy", words: /\b(happy|great|awesome|thanks|thank you|love|yay|excellent|wonderful|glad|excited|good news|nice)\b/i },
    sad: { emoji: "😔", sentinel: "🔵", label: "sad", words: /\b(sad|sorry|unhappy|depressed|lonely|miss|cry|crying|hurt|grief)\b/i },
    angry: { emoji: "😤", sentinel: "🔴", label: "frustrated", words: /\b(angry|mad|annoyed|frustrated|hate|stupid|damn|furious)\b/i },
    curious: { emoji: "🤔", sentinel: "🟡", label: "curious", words: /\b(why|how|what if|curious|wonder|explain|tell me)\b/i },
    stressed: { emoji: "😰", sentinel: "🟠", label: "stressed", words: /\b(stress|stressed|anxious|worry|worried|deadline|urgent|panic|overwhelmed)\b/i },
    greeting: { emoji: "👋", sentinel: "🟢", label: "friendly", words: /^(hi|hello|hey|good morning|good evening|good afternoon)\b/i },
    celebrate: { emoji: "🎉", sentinel: "🟣", label: "celebrating", words: /\b(congrats|congratulations|won|success|passed|graduated)\b/i },
    money: { emoji: "💎", sentinel: "🟣", label: "economy", words: /\b(wallet|balance|token|pay|lmt|faucet|swap|price)\b/i },
    neutral: { emoji: "🧠", sentinel: "⚪", label: "neutral", words: /.^/ }
  };

  function sense(text) {
    const t = String(text || "");
    for (const key of ["greeting", "celebrate", "money", "angry", "sad", "stressed", "happy", "curious"]) {
      if (moods[key].words.test(t)) {
        return { mood: key, ...moods[key] };
      }
    }
    return { mood: "neutral", ...moods.neutral };
  }

  /** Pick concept emoji for a free-text phrase */
  function emojiFor(phrase) {
    const s = String(phrase || "").toLowerCase();
    if (/\blmt\b|localmind token/.test(s)) return LMT_EMOJI;
    for (const [k, em] of Object.entries(CONCEPTS)) {
      if (s.includes(k.replace(/_/g, " ")) || new RegExp("\\b" + k.replace(/_/g, "\\s+") + "\\b", "i").test(s)) {
        return em;
      }
    }
    return null;
  }

  /**
   * Inject the right emoji next to key words in a reply when helpful.
   * Avoids double-injecting if emoji already present nearby.
   */
  function enrichText(text) {
    if (!text || text.length > 8000) return text;
    let out = String(text);
    // Always brand LMT with diamond when mentioned as a token
    out = out.replace(/\b(LMT)\b/g, function (m, p1, offset) {
      const before = out.slice(Math.max(0, offset - 2), offset);
      if (before.includes("💎")) return m;
      return "💎 " + m;
    });
    // Light concept injection for common nouns (once each)
    const pairs = [
      [/\b(wallet)\b/i, "👛"],
      [/\b(balance)\b/i, "💰"],
      [/\b(token|tokens)\b/i, "🪙"],
      [/\b(error|failed)\b/i, "❌"],
      [/\b(success|created|done)\b/i, "✅"],
      [/\b(warning|careful)\b/i, "⚠️"],
      [/\b(search|lookup|look up)\b/i, "🔍"],
      [/\b(file|files)\b/i, "📄"],
      [/\b(brain|neuron|neurons)\b/i, "🧠"],
      [/\b(rocket|launch)\b/i, "🚀"],
      [/\b(fire)\b/i, "🔥"],
      [/\b(star|stars)\b/i, "⭐"],
      [/\b(party|celebrate)\b/i, "🎉"]
    ];
    for (const [re, em] of pairs) {
      out = out.replace(re, function (match, _g, offset) {
        const window = out.slice(Math.max(0, offset - 3), offset + match.length + 3);
        if (window.includes(em)) return match;
        return em + " " + match;
      });
    }
    return out;
  }

  function decorateReply(reply, userText) {
    if (reply == null || reply === "") return reply;
    const s = sense(userText);
    let out = String(reply);
    if (/^[🟢🔵🔴🟡🟠🟣⚪😊😔😤🤔😰👋🎉🧠💎]/.test(out.trim())) {
      // already has sentinel — still enrich body
      return enrichText(out);
    }
    if (out.length < 6000 && !out.startsWith("```") && !/^(ONLINE_FETCH|SYNC_NOW)/.test(out)) {
      out = s.sentinel + " " + out;
      if (s.mood === "happy" || s.mood === "greeting" || s.mood === "celebrate") {
        if (!/[😊🎉👋]$/.test(out.trim())) out = out.replace(/\s*$/, " " + s.emoji);
      } else if (s.mood === "curious" && out.length < 800) {
        if (!/🤔/.test(out)) out = out.replace(/\s*$/, " " + s.emoji);
      } else if (s.mood === "money") {
        if (!/💎/.test(out)) out = out.replace(/\s*$/, " " + LMT_EMOJI);
      }
    }
    return enrichText(out);
  }

  function statusLine(userText) {
    const s = sense(userText);
    return s.sentinel + " Mood: **" + s.label + "** " + s.emoji;
  }

  /** Suggest an emoji for a new token based on name */
  function suggestTokenEmoji(name) {
    const em = emojiFor(name);
    if (em && em !== LMT_EMOJI) return em;
    const pool = ["🚀", "🔥", "⭐", "🌟", "⚡", "🌙", "🌊", "🍀", "🦊", "🐉", "🎯", "🏆", "🔮", "💫", "🌈"];
    let h = 0;
    const s = String(name || "token");
    for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    return pool[Math.abs(h) % pool.length];
  }

  return {
    sense,
    decorateReply,
    enrichText,
    emojiFor,
    statusLine,
    suggestTokenEmoji,
    CONCEPTS,
    moods,
    LMT_EMOJI
  };
})();

if (typeof window !== "undefined") window.MoodEmoji = MoodEmoji;
