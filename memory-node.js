/**
 * Kanairoex Memory Node
 * When online (or P2P open), nodes automatically share knowledge + pools
 * so peers protect each other with redundant offline copies.
 */
const MemoryNode = (() => {
  const SETTINGS_KEY = "localmind_node_settings";
  const LAST_SYNC_KEY = "localmind_node_last_sync";
  const SYNC_URL_KEY = "localmind_memory_sync_url";
  const INTERVAL_MS = 45000;
  let timer = null;
  let bc = null;
  let started = false;

  function defaultSettings() {
    return {
      autoShare: true,
      shareKnowledge: true,
      sharePools: true,
      maxFacts: 400
    };
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? Object.assign(defaultSettings(), JSON.parse(raw)) : defaultSettings();
    } catch {
      return defaultSettings();
    }
  }

  function saveSettings(s) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch (e) {}
  }

  function isOnline() {
    return typeof navigator === "undefined" || navigator.onLine !== false;
  }

  function nodeId() {
    try {
      let id = localStorage.getItem("localmind_node_id");
      if (!id) {
        id = "node-" + Math.random().toString(36).slice(2, 10);
        localStorage.setItem("localmind_node_id", id);
      }
      return id;
    } catch {
      return "node-temp";
    }
  }

  function buildPacket() {
    const s = loadSettings();
    const packet = {
      type: "memory-node",
      version: 1,
      nodeId: nodeId(),
      address: typeof LMTWallet !== "undefined" ? LMTWallet.getAddress() : null,
      ts: Date.now(),
      online: isOnline(),
      knowledge: [],
      pools: null
    };
    if (s.shareKnowledge && typeof Knowledge !== "undefined") {
      try {
        const all = Knowledge.exportData() || [];
        packet.knowledge = all.slice(-s.maxFacts);
      } catch (e) {}
    }
    if (s.sharePools && typeof LMTWallet !== "undefined" && LMTWallet.exportPools) {
      try {
        packet.pools = LMTWallet.exportPools();
      } catch (e) {}
    }
    return packet;
  }

  function absorb(packet) {
    if (!packet || packet.type !== "memory-node") {
      return { ok: false, reason: "not a memory-node packet" };
    }
    if (packet.nodeId && packet.nodeId === nodeId()) {
      return { ok: true, skipped: true, reason: "self" };
    }
    const s = loadSettings();
    const result = { ok: true, knowledgeAdded: 0, poolsAdded: 0, poolsUpdated: 0, from: packet.nodeId || packet.address };

    if (s.shareKnowledge && packet.knowledge && packet.knowledge.length && typeof Knowledge !== "undefined") {
      try {
        if (Knowledge.mergeImport) {
          const m = Knowledge.mergeImport(packet.knowledge);
          result.knowledgeAdded = m.added || 0;
        } else if (Knowledge.add) {
          packet.knowledge.forEach(function (f) {
            if (f && f.subject && f.content) Knowledge.add(f.subject, f.content, f.category || "shared");
          });
          result.knowledgeAdded = packet.knowledge.length;
        }
      } catch (e) {
        result.knowledgeError = e.message || String(e);
      }
    }

    if (s.sharePools && packet.pools && typeof LMTWallet !== "undefined" && LMTWallet.mergePools) {
      try {
        const m = LMTWallet.mergePools(packet.pools);
        result.poolsAdded = m.added || 0;
        result.poolsUpdated = m.updated || 0;
      } catch (e) {
        result.poolsError = e.message || String(e);
      }
    }

    try {
      localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
    } catch (e) {}

    return result;
  }

  function sendP2P(packet) {
    if (typeof WebRTCPeer === "undefined" || WebRTCPeer.channelState() !== "open") {
      return { sent: false, reason: "channel not open" };
    }
    try {
      WebRTCPeer.send(packet);
      return { sent: true };
    } catch (e) {
      return { sent: false, reason: e.message || String(e) };
    }
  }

  function sendBroadcast(packet) {
    if (!bc) return { sent: false };
    try {
      bc.postMessage(packet);
      return { sent: true };
    } catch (e) {
      return { sent: false, reason: e.message };
    }
  }

  async function sendHttp(packet) {
    let url = null;
    try {
      url = localStorage.getItem(SYNC_URL_KEY) || localStorage.getItem("localmind_pool_sync_url");
    } catch (e) {}
    if (!url || typeof fetch !== "function") {
      return { ok: false, reason: url ? "fetch unavailable" : "no sync URL" };
    }
    if (!isOnline()) return { ok: false, reason: "offline" };
    try {
      // Pull first
      const getRes = await fetch(url, { method: "GET", cache: "no-store" });
      let merged = null;
      if (getRes.ok) {
        const data = await getRes.json();
        if (data && data.type === "memory-node") merged = absorb(data);
        else if (data && data.type === "pool-registry" && typeof LMTWallet !== "undefined") {
          merged = { pools: LMTWallet.mergePools(data) };
        }
      }
      // Push ours
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(packet)
      });
      return { ok: true, merged: merged };
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    }
  }

  async function shareNow(reason) {
    const s = loadSettings();
    if (!s.autoShare && reason !== "manual") {
      return { skipped: true, reason: "autoShare off" };
    }
    const packet = buildPacket();
    const out = {
      reason: reason || "tick",
      facts: (packet.knowledge || []).length,
      p2p: sendP2P(packet),
      tab: sendBroadcast(packet),
      http: null
    };
    if (isOnline()) {
      out.http = await sendHttp(packet);
    }
    try {
      localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
    } catch (e) {}
    return out;
  }

  function status() {
    const s = loadSettings();
    let last = null;
    try { last = localStorage.getItem(LAST_SYNC_KEY); } catch (e) {}
    let url = null;
    try {
      url = localStorage.getItem(SYNC_URL_KEY) || localStorage.getItem("localmind_pool_sync_url");
    } catch (e) {}
    return {
      nodeId: nodeId(),
      autoShare: s.autoShare,
      shareKnowledge: s.shareKnowledge,
      sharePools: s.sharePools,
      online: isOnline(),
      p2p: typeof WebRTCPeer !== "undefined" ? WebRTCPeer.channelState() : "n/a",
      lastSync: last,
      syncUrl: url,
      facts: typeof Knowledge !== "undefined" ? Knowledge.getCount() : 0
    };
  }

  function setAutoShare(on) {
    const s = loadSettings();
    s.autoShare = !!on;
    saveSettings(s);
    if (s.autoShare) start();
    return s;
  }

  function setSyncUrl(url) {
    const u = String(url || "").trim();
    if (!u || u === "clear" || u === "none") {
      try { localStorage.removeItem(SYNC_URL_KEY); } catch (e) {}
      return { ok: true, url: null };
    }
    if (!/^https?:\/\//i.test(u)) throw new Error("URL must start with http:// or https://");
    localStorage.setItem(SYNC_URL_KEY, u);
    return { ok: true, url: u };
  }

  function onChannelOpen() {
    // Mutual protection as soon as a peer links
    shareNow("p2p-open");
  }

  function start() {
    if (started) return;
    started = true;
    const s = loadSettings();
    if (typeof BroadcastChannel !== "undefined") {
      try {
        bc = new BroadcastChannel("localmind-memory-node");
        bc.onmessage = function (ev) {
          if (ev && ev.data) absorb(ev.data);
        };
      } catch (e) {}
    }
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener("online", function () {
        if (loadSettings().autoShare) shareNow("online");
      });
    }
    // Hook WebRTC open
    if (typeof WebRTCPeer !== "undefined" && WebRTCPeer.setCallbacks) {
      try {
        const prev = WebRTCPeer._memoryNodeHooked;
        if (!prev) {
          WebRTCPeer._memoryNodeHooked = true;
          const existing = WebRTCPeer._callbacks || {};
          // setCallbacks merges in webrtc - we register onOpen via periodic check + app.js
        }
      } catch (e) {}
    }
    if (s.autoShare) {
      timer = setInterval(function () {
        if (!loadSettings().autoShare) return;
        const ch = typeof WebRTCPeer !== "undefined" ? WebRTCPeer.channelState() : "none";
        if (ch === "open" || isOnline()) {
          shareNow("interval");
        }
      }, INTERVAL_MS);
      // Initial mild share after boot
      setTimeout(function () {
        if (loadSettings().autoShare && (isOnline() || (typeof WebRTCPeer !== "undefined" && WebRTCPeer.channelState() === "open"))) {
          shareNow("boot");
        }
      }, 2500);
    }
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    started = false;
    if (bc) {
      try { bc.close(); } catch (e) {}
      bc = null;
    }
  }

  return {
    start,
    stop,
    shareNow,
    absorb,
    buildPacket,
    status,
    setAutoShare,
    setSyncUrl,
    onChannelOpen,
    loadSettings,
    saveSettings,
    nodeId
  };
})();

if (typeof window !== "undefined") {
  window.MemoryNode = MemoryNode;
  // Auto-start node protection
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { MemoryNode.start(); });
  } else {
    setTimeout(function () { MemoryNode.start(); }, 0);
  }
}
