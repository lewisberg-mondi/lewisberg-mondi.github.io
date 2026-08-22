/**
 * Kanairoex Dictionary
 * Compact offline dictionary for word understanding, definitions, and synonyms.
 * Helps the AI better interpret user messages.
 */

const Dictionary = (() => {
  // Core lexicon: word → { def, synonyms, type }
  const lexicon = {
    // Time & calendar
    "today": { def: "the present day", synonyms: ["this day", "now"], type: "time" },
    "tomorrow": { def: "the day after today", synonyms: ["next day"], type: "time" },
    "yesterday": { def: "the day before today", synonyms: ["previous day"], type: "time" },
    "day": { def: "a period of 24 hours; also daytime", synonyms: ["date", "weekday"], type: "time" },
    "time": { def: "the measured progress of existence; clock reading", synonyms: ["hour", "moment", "period"], type: "time" },
    "hour": { def: "a period of 60 minutes", synonyms: ["hr"], type: "time" },
    "minute": { def: "a period of 60 seconds", synonyms: ["min"], type: "time" },
    "second": { def: "a unit of time; also next in order", synonyms: ["sec", "moment"], type: "time" },
    "week": { def: "a period of seven days", synonyms: ["seven days"], type: "time" },
    "month": { def: "one of the twelve divisions of a year", synonyms: [], type: "time" },
    "year": { def: "a period of 365 or 366 days", synonyms: ["annum"], type: "time" },
    "morning": { def: "the early part of the day", synonyms: ["am", "dawn"], type: "time" },
    "afternoon": { def: "the time between noon and evening", synonyms: ["pm"], type: "time" },
    "evening": { def: "the later part of the day", synonyms: ["dusk", "nightfall"], type: "time" },
    "night": { def: "the time of darkness between sunset and sunrise", synonyms: ["nighttime"], type: "time" },
    "date": { def: "a particular day of the month or year", synonyms: ["day"], type: "time" },
    "clock": { def: "a device that shows the time", synonyms: ["timepiece"], type: "time" },
    "calendar": { def: "a system for organizing days and months", synonyms: [], type: "time" },

    // Common verbs & understanding
    "what": { def: "asking for information or identity", synonyms: ["which", "how"], type: "question" },
    "when": { def: "asking about time", synonyms: [], type: "question" },
    "where": { def: "asking about place", synonyms: [], type: "question" },
    "who": { def: "asking about a person", synonyms: [], type: "question" },
    "why": { def: "asking for reason", synonyms: ["how come"], type: "question" },
    "how": { def: "asking about manner or method", synonyms: ["in what way"], type: "question" },
    "define": { def: "to state the meaning of a word", synonyms: ["explain", "meaning"], type: "verb" },
    "meaning": { def: "what a word or phrase expresses", synonyms: ["definition", "sense"], type: "noun" },
    "understand": { def: "to grasp the meaning of", synonyms: ["comprehend", "get"], type: "verb" },
    "know": { def: "to be aware of through observation or teaching", synonyms: ["aware", "recognize"], type: "verb" },
    "remember": { def: "to keep in memory", synonyms: ["recall", "retain"], type: "verb" },
    "learn": { def: "to gain knowledge", synonyms: ["study", "acquire"], type: "verb" },
    "teach": { def: "to give knowledge to someone", synonyms: ["instruct", "educate"], type: "verb" },
    "help": { def: "to assist or make easier", synonyms: ["aid", "support"], type: "verb" },
    "create": { def: "to bring into existence", synonyms: ["make", "generate", "produce"], type: "verb" },
    "draw": { def: "to produce a picture; also to pull", synonyms: ["sketch", "illustrate"], type: "verb" },
    "write": { def: "to form letters or words", synonyms: ["compose", "type"], type: "verb" },
    "read": { def: "to look at and understand written words", synonyms: ["examine", "peruse"], type: "verb" },
    "calculate": { def: "to determine mathematically", synonyms: ["compute", "work out"], type: "verb" },
    "solve": { def: "to find an answer to a problem", synonyms: ["resolve", "figure out"], type: "verb" },
    "explain": { def: "to make clear or understandable", synonyms: ["clarify", "describe"], type: "verb" },
    "correct": { def: "to make free from error; also right", synonyms: ["fix", "right"], type: "verb" },
    "answer": { def: "a reply to a question", synonyms: ["response", "reply"], type: "noun" },
    "question": { def: "a sentence asking for information", synonyms: ["query", "inquiry"], type: "noun" },

    // Core concepts
    "ai": { def: "artificial intelligence — computer systems that perform tasks normally requiring human intelligence", synonyms: ["artificial intelligence"], type: "noun" },
    "memory": { def: "the ability to store and recall information", synonyms: ["recall", "storage"], type: "noun" },
    "knowledge": { def: "information and skills acquired through experience or education", synonyms: ["information", "wisdom"], type: "noun" },
    "fact": { def: "something that is known to be true", synonyms: ["truth", "reality"], type: "noun" },
    "file": { def: "a collection of data stored on a computer", synonyms: ["document", "record"], type: "noun" },
    "image": { def: "a picture or visual representation", synonyms: ["picture", "photo"], type: "noun" },
    "song": { def: "a piece of music with words or melody", synonyms: ["tune", "melody", "music"], type: "noun" },
    "movie": { def: "a motion picture; a film", synonyms: ["film", "video"], type: "noun" },
    "code": { def: "instructions written for a computer", synonyms: ["program", "script"], type: "noun" },
    "rule": { def: "a principle that guides behavior or decisions", synonyms: ["law", "principle"], type: "noun" },
    "quiz": { def: "a short test of knowledge", synonyms: ["test", "exam"], type: "noun" },
    "dictionary": { def: "a book or resource that lists words and their meanings", synonyms: ["lexicon", "glossary"], type: "noun" },
    "hello": { def: "a greeting", synonyms: ["hi", "hey", "greetings"], type: "interjection" },
    "goodbye": { def: "a farewell", synonyms: ["bye", "farewell", "see you"], type: "interjection" },
    "yes": { def: "an affirmative response", synonyms: ["yeah", "yep", "affirmative"], type: "interjection" },
    "no": { def: "a negative response", synonyms: ["nope", "negative"], type: "interjection" },
    "please": { def: "used as a polite request", synonyms: [], type: "adverb" },
    "thanks": { def: "expression of gratitude", synonyms: ["thank you", "ty"], type: "interjection" },
    "sorry": { def: "expression of regret or apology", synonyms: ["apologies"], type: "interjection" },
    "name": { def: "a word by which a person or thing is known", synonyms: ["title", "label"], type: "noun" },
    "person": { def: "a human being", synonyms: ["human", "individual"], type: "noun" },
    "place": { def: "a particular position or location", synonyms: ["location", "spot"], type: "noun" },
    "thing": { def: "an object or entity", synonyms: ["object", "item"], type: "noun" },
    "number": { def: "a mathematical value used for counting", synonyms: ["figure", "digit"], type: "noun" },
    "word": { def: "a unit of language with meaning", synonyms: ["term"], type: "noun" },
    "sentence": { def: "a group of words that expresses a complete thought", synonyms: [], type: "noun" },
    "language": { def: "a system of communication using words", synonyms: ["tongue", "speech"], type: "noun" },
    "math": { def: "the study of numbers, quantities, and shapes", synonyms: ["mathematics"], type: "noun" },
    "science": { def: "systematic study of the natural world", synonyms: [], type: "noun" },
    "history": { def: "the study of past events", synonyms: [], type: "noun" },
    "computer": { def: "an electronic device that processes data", synonyms: ["pc", "machine"], type: "noun" },
    "internet": { def: "a global network of connected computers", synonyms: ["web", "net"], type: "noun" },
    "offline": { def: "not connected to the internet", synonyms: ["disconnected", "local"], type: "adj" },
    "online": { def: "connected to the internet", synonyms: ["connected"], type: "adj" },
    "true": { def: "in accordance with fact", synonyms: ["correct", "accurate"], type: "adj" },
    "false": { def: "not true", synonyms: ["incorrect", "wrong"], type: "adj" },
    "good": { def: "of high quality or desirable", synonyms: ["great", "fine", "nice"], type: "adj" },
    "bad": { def: "of poor quality or undesirable", synonyms: ["poor", "negative"], type: "adj" },
    "big": { def: "large in size", synonyms: ["large", "huge"], type: "adj" },
    "small": { def: "little in size", synonyms: ["tiny", "little"], type: "adj" },
    "happy": { def: "feeling or showing pleasure", synonyms: ["glad", "joyful"], type: "adj" },
    "sad": { def: "feeling sorrow", synonyms: ["unhappy", "sorrowful"], type: "adj" },
    "new": { def: "recently made or discovered", synonyms: ["fresh", "recent"], type: "adj" },
    "old": { def: "having lived or existed for a long time", synonyms: ["aged", "ancient"], type: "adj" },
    "fast": { def: "moving or happening quickly", synonyms: ["quick", "rapid"], type: "adj" },
    "slow": { def: "moving or happening with little speed", synonyms: ["sluggish"], type: "adj" },
    "hot": { def: "having a high temperature", synonyms: ["warm", "heated"], type: "adj" },
    "cold": { def: "having a low temperature", synonyms: ["chilly", "cool"], type: "adj" },
    "yes": { def: "used to express agreement", synonyms: ["yeah", "yep"], type: "interjection" }
  };

  // Extra common words for recognition (no full def needed)
  const common = [
    "the","a","an","is","are","was","were","be","been","being","have","has","had","do","does","did",
    "will","would","could","should","may","might","must","can","shall","i","you","he","she","it","we","they",
    "me","him","her","us","them","my","your","his","its","our","their","this","that","these","those",
    "and","or","but","if","then","because","so","as","of","in","on","at","to","for","with","from","by",
    "about","into","over","after","before","between","under","again","further","once","here","there",
    "all","any","both","each","few","more","most","other","some","such","no","nor","not","only","own",
    "same","than","too","very","just","also","now","even","still","already","always","never","often",
    "sometimes","usually","really","actually","maybe","perhaps","please","thank","hello","hi","hey"
  ];

  function normalize(w) {
    return String(w || "").toLowerCase().replace(/[^a-z0-9'-]/g, "");
  }

  function lookup(word) {
    const w = normalize(word);
    if (lexicon[w]) return { word: w, ...lexicon[w] };
    // try simple stemming
    if (w.endsWith("ing") && lexicon[w.slice(0, -3)]) return { word: w, ...lexicon[w.slice(0, -3)], note: "base form" };
    if (w.endsWith("ed") && lexicon[w.slice(0, -2)]) return { word: w, ...lexicon[w.slice(0, -2)], note: "base form" };
    if (w.endsWith("s") && lexicon[w.slice(0, -1)]) return { word: w, ...lexicon[w.slice(0, -1)], note: "base form" };
    if (common.includes(w)) return { word: w, def: "(common function word)", synonyms: [], type: "common" };
    return null;
  }

  function define(word) {
    const entry = lookup(word);
    if (!entry || entry.type === "common") return null;
    let out = `**${entry.word}** (${entry.type}): ${entry.def}`;
    if (entry.synonyms && entry.synonyms.length) {
      out += `\nSynonyms: ${entry.synonyms.join(", ")}`;
    }
    return out;
  }

  function understand(text) {
    // Extract meaningful words and map them via dictionary
    const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 1);
    const known = [];
    const unknown = [];
    const concepts = [];

    for (const w of words) {
      const entry = lookup(w);
      if (entry && entry.type !== "common") {
        known.push(entry);
        if (entry.type === "time") concepts.push("time");
        if (entry.type === "question") concepts.push("question");
        if (["file","image","song","movie","code","rule","quiz","memory","knowledge"].includes(entry.word)) {
          concepts.push(entry.word);
        }
      } else if (w.length > 2 && !common.includes(w)) {
        unknown.push(w);
      }
    }

    return {
      known,
      unknown: [...new Set(unknown)],
      concepts: [...new Set(concepts)],
      isQuestion: /^(what|when|where|who|why|how|is|are|do|does|can|could|would|should)\b/i.test(text.trim()) || text.includes("?")
    };
  }

  function getAllWords() {
    return Object.keys(lexicon).sort();
  }

  function addWord(word, def, synonyms = [], type = "noun") {
    const w = normalize(word);
    if (!w) return false;
    lexicon[w] = { def, synonyms, type };
    Neurons.activate("dictionary:learn", 2);
    Blockchain.addBlock({ type: "dictionary", word: w, def });
    return true;
  }

  return {
    lookup,
    define,
    understand,
    getAllWords,
    addWord,
    size: () => Object.keys(lexicon).length
  };
})();
