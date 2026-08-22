const I18n = (() => {
  const KEY = "localmind_lang";
  const dict = {
    en: {
      welcome: "Private study assistant for university and professional work.",
      offline: "Offline",
      online: "Online",
      thinking: "Thinking…"
    },
    sw: {
      welcome: "Msaidizi wa masomo wa faragha kwa chuo na kazi kitaaluma.",
      offline: "Nje ya mtandao",
      online: "Mtandaoni",
      thinking: "Inafikiri…"
    }
  };
  function getLang() {
    try { return localStorage.getItem(KEY) || "en"; } catch { return "en"; }
  }
  function setLang(l) {
    const lang = (l === "sw") ? "sw" : "en";
    try { localStorage.setItem(KEY, lang); } catch (e) {}
    return lang;
  }
  function t(k) {
    const d = dict[getLang()] || dict.en;
    return d[k] || dict.en[k] || k;
  }
  function detect(text) {
    if (/^lang(uage)?\s+(sw|swahili|en|english)\b/i.test(text || "")) {
      const sw = /sw|swahili/i.test(text);
      return { type: "lang", lang: sw ? "sw" : "en" };
    }
    return null;
  }
  function handle(intent) {
    if (!intent) return null;
    const L = setLang(intent.lang);
    return L === "sw"
      ? "Lugha imewekwa **Kiswahili** (UI fupi). Andika: **language en** kurudisha Kiingereza."
      : "Language set to **English**. Say **language sw** for Swahili labels.";
  }
  return { getLang: getLang, setLang: setLang, t: t, detect: detect, handle: handle };
})();
