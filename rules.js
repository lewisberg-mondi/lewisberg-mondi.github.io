/**
 * Simple If-Then rule engine
 */
const Rules = (() => {
  const STORAGE_KEY = "localmind_rules";

  function load() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch { return []; }
  }

  function save(rules) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  }

  function add(condition, action) {
    const rules = load();
    const rule = {
      id: "r_" + Date.now(),
      condition: condition.trim().toLowerCase(),
      action: action.trim(),
      created: Date.now(),
      uses: 0
    };
    rules.push(rule);
    save(rules);
    Blockchain.addBlock({ type: "rule", condition, action });
    Neurons.activate("rules:add", 3);
    return rule;
  }

  function match(text) {
    const lower = text.toLowerCase();
    const rules = load();
    for (const r of rules) {
      if (lower.includes(r.condition)) {
        r.uses++;
        save(rules);
        Neurons.activate("rules:fire", 2);
        return r;
      }
    }
    return null;
  }

  function getAll() { return load(); }
  function clear() { localStorage.removeItem(STORAGE_KEY); }
  function remove(id) {
    save(load().filter(r => r.id !== id));
  }

  return { add, match, getAll, clear, remove };
})();
