/**
 * Multiple named conversations
 */
const Chats = (() => {
  const STORAGE_KEY = "localmind_chats";
  function load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
  }
  function save(all) { localStorage.setItem(STORAGE_KEY, JSON.stringify(all)); }
  function list() { return Object.keys(load()); }
  function get(name) { return load()[name] || []; }
  function saveChat(name, messages) {
    const all = load();
    all[name] = messages.slice(-100);
    save(all);
  }
  function remove(name) {
    const all = load();
    delete all[name];
    save(all);
  }
  return { list, get, saveChat, remove };
})();
