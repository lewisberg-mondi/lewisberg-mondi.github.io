/**
 * Kanairoex Blockchain Memory
 * A simple linked-hash chain stored in localStorage.
 * Each block holds conversation turns, learned facts, or system events.
 */

const Blockchain = (() => {
  const STORAGE_KEY = "localmind_chain";

  function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return "0x" + Math.abs(hash).toString(16).padStart(8, "0");
  }

  function createGenesis() {
    const genesis = {
      index: 0,
      timestamp: Date.now(),
      data: { type: "genesis", message: "Kanairoex Blockchain initialized" },
      previousHash: "0x00000000",
      hash: ""
    };
    genesis.hash = simpleHash(JSON.stringify(genesis));
    return [genesis];
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return createGenesis();
      const chain = JSON.parse(raw);
      if (!Array.isArray(chain) || chain.length === 0) return createGenesis();
      return chain;
    } catch {
      return createGenesis();
    }
  }

  const MAX_BLOCKS = 400;

  function save(chain) {
    try {
      // Keep chain bounded so localStorage writes stay fast
      let toSave = chain;
      if (Array.isArray(chain) && chain.length > MAX_BLOCKS) {
        toSave = [chain[0]].concat(chain.slice(-(MAX_BLOCKS - 1)));
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (e) {
      // Quota — drop older half (keep genesis)
      try {
        if (Array.isArray(chain) && chain.length > 20) {
          const trimmed = [chain[0]].concat(chain.slice(-Math.floor(chain.length / 2)));
          localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
        }
      } catch (e2) {}
    }
  }

  function getChain() {
    return load();
  }

  function addBlock(data) {
    const chain = load();
    const previous = chain[chain.length - 1] || {
      hash: "0x0",
      index: -1
    };
    // Avoid storing huge payloads that slow stringify
    let payload = data;
    if (payload && typeof payload === "object" && payload.content && String(payload.content).length > 4000) {
      payload = Object.assign({}, payload, { content: String(payload.content).slice(0, 4000) + "…" });
    }
    const block = {
      index: chain.length,
      timestamp: Date.now(),
      data: payload,
      previousHash: previous.hash,
      hash: ""
    };
    block.hash = simpleHash(JSON.stringify({
      index: block.index,
      timestamp: block.timestamp,
      data: block.data,
      previousHash: block.previousHash
    }));
    chain.push(block);
    save(chain);
    return block;
  }

  function verify() {
    const chain = load();
    if (chain.length === 0) return { valid: false, message: "Empty chain" };

    for (let i = 1; i < chain.length; i++) {
      const current = chain[i];
      const previous = chain[i - 1];

      if (current.previousHash !== previous.hash) {
        return {
          valid: false,
          message: `Broken link at block #${i}: previousHash mismatch`
        };
      }

      const recalculated = simpleHash(JSON.stringify({
        index: current.index,
        timestamp: current.timestamp,
        data: current.data,
        previousHash: current.previousHash
      }));

      if (current.hash !== recalculated) {
        return {
          valid: false,
          message: `Tampered data at block #${i}: hash mismatch`
        };
      }
    }

    return {
      valid: true,
      message: `Chain intact • ${chain.length} blocks verified`
    };
  }

  function getBlocksByType(type) {
    return load().filter(b => b.data && b.data.type === type);
  }

  function clear() {
    localStorage.removeItem(STORAGE_KEY);
    return createGenesis();
  }

  function exportChain() {
    return JSON.stringify(load(), null, 2);
  }

  function importChain(jsonString) {
    try {
      const chain = JSON.parse(jsonString);
      if (!Array.isArray(chain)) throw new Error("Invalid format");
      save(chain);
      return true;
    } catch {
      return false;
    }
  }

  return {
    getChain,
    addBlock,
    verify,
    getBlocksByType,
    clear,
    exportChain,
    importChain,
    simpleHash
  };
})();
