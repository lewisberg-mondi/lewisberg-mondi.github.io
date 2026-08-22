/**
 * Kanairoex local DWN — personal data vault in IndexedDB
 * Protocols: profile, chat, file, media, token
 * Records can be signed with Identity (DID) and sent over WebRTC.
 */
const DWN = (() => {
  const DB_NAME = "localmind_dwn_v1";
  const DB_VER = 1;
  const STORE = "records";
  const PEERS = "peer_dids";

  let _db = null;

  function openDb() {
    if (_db) return Promise.resolve(_db);
    return new Promise(function (resolve, reject) {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = function (ev) {
        const db = ev.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const os = db.createObjectStore(STORE, { keyPath: "recordId" });
          os.createIndex("protocol", "protocol", { unique: false });
          os.createIndex("author", "author", { unique: false });
          os.createIndex("dateCreated", "dateCreated", { unique: false });
          os.createIndex("protocolPath", "protocolPath", { unique: false });
        }
        if (!db.objectStoreNames.contains(PEERS)) {
          db.createObjectStore(PEERS, { keyPath: "did" });
        }
      };
      req.onsuccess = function () {
        _db = req.result;
        resolve(_db);
      };
      req.onerror = function () {
        reject(req.error || new Error("IDB open failed"));
      };
    });
  }

  function uuid() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return "rec-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  async function putRecord(rec) {
    const db = await openDb();
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(rec);
      tx.oncomplete = function () {
        resolve(rec);
      };
      tx.onerror = function () {
        reject(tx.error);
      };
    });
  }

  async function getRecord(id) {
    const db = await openDb();
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(STORE, "readonly");
      const r = tx.objectStore(STORE).get(id);
      r.onsuccess = function () {
        resolve(r.result || null);
      };
      r.onerror = function () {
        reject(r.error);
      };
    });
  }

  async function query(opts) {
    opts = opts || {};
    const db = await openDb();
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(STORE, "readonly");
      const os = tx.objectStore(STORE);
      const r = os.getAll();
      r.onsuccess = function () {
        let rows = r.result || [];
        if (opts.protocol) {
          rows = rows.filter(function (x) {
            return x.protocol === opts.protocol;
          });
        }
        if (opts.author) {
          rows = rows.filter(function (x) {
            return x.author === opts.author;
          });
        }
        if (opts.protocolPath) {
          rows = rows.filter(function (x) {
            return x.protocolPath === opts.protocolPath;
          });
        }
        rows.sort(function (a, b) {
          return (b.dateCreated || 0) - (a.dateCreated || 0);
        });
        if (opts.limit) rows = rows.slice(0, opts.limit);
        resolve(rows);
      };
      r.onerror = function () {
        reject(r.error);
      };
    });
  }

  async function rememberPeer(did, meta) {
    if (!did) return;
    const db = await openDb();
    const row = Object.assign(
      { did: did, updatedAt: Date.now() },
      meta || {}
    );
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(PEERS, "readwrite");
      tx.objectStore(PEERS).put(row);
      tx.oncomplete = function () {
        resolve(row);
      };
      tx.onerror = function () {
        reject(tx.error);
      };
    });
  }

  async function listPeers() {
    const db = await openDb();
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(PEERS, "readonly");
      const r = tx.objectStore(PEERS).getAll();
      r.onsuccess = function () {
        resolve(r.result || []);
      };
      r.onerror = function () {
        reject(r.error);
      };
    });
  }

  /**
   * Write a signed DWN record (author = local DID).
   */
  async function write(protocol, protocolPath, data, dataFormat) {
    if (typeof Identity === "undefined" || !Identity.hasIdentity()) {
      await Identity.ensure();
    }
    const author = Identity.getDid();
    const base = {
      recordId: uuid(),
      protocol: protocol,
      protocolPath: protocolPath || protocol,
      schema: "https://localmind.app/schemas/" + protocol,
      dataFormat: dataFormat || "application/json",
      data: data,
      author: author,
      dateCreated: Date.now(),
      type: "dwn-record"
    };
    const signed = await Identity.attachProof(base);
    await putRecord(signed);
    return signed;
  }

  async function ingestRemote(msg) {
    // Accept signed dwn-record or envelope with type dwn-record
    const rec = msg && msg.type === "dwn-record" ? msg : msg;
    if (!rec || !rec.recordId) throw new Error("Invalid DWN record");
    let verify = { ok: true, reason: "unsigned" };
    if (typeof Identity !== "undefined" && rec.proof) {
      verify = await Identity.verifyObject(rec);
    }
    const stored = Object.assign({}, rec, {
      _verified: verify.ok,
      _verifyReason: verify.reason,
      _receivedAt: Date.now()
    });
    await putRecord(stored);
    if (rec.author) {
      await rememberPeer(rec.author, {
        lastProtocol: rec.protocol,
        verified: verify.ok
      });
    }
    return { record: stored, verify: verify };
  }

  async function writeProfileSnapshot() {
    let name = "";
    let bio = "";
    let address = "";
    let hasAvatar = false;
    try {
      if (typeof Profile !== "undefined") {
        name = Profile.getName() || "";
        bio = Profile.getBio ? Profile.getBio() : "";
        const meta = Profile.loadMeta ? Profile.loadMeta() : {};
        hasAvatar = !!(meta && meta.hasAvatar);
      }
    } catch (_) {}
    try {
      if (typeof LMTWallet !== "undefined" && LMTWallet.getAddress) {
        address = LMTWallet.getAddress() || "";
      }
    } catch (_) {}
    return write("profile", "profile", {
      name: name,
      bio: bio,
      lmtAddress: address,
      hasAvatar: hasAvatar
    });
  }

  async function writeChat(text, toDid) {
    return write("chat", "message", {
      text: String(text || "").slice(0, 8000),
      toDid: toDid || null,
      ts: Date.now()
    });
  }

  async function writeTokenReceipt(tx) {
    return write("token", "transfer", {
      amount: tx.amount,
      asset: tx.asset || "LMT",
      to: tx.to,
      from: tx.from,
      note: tx.note || "",
      ts: Date.now()
    });
  }

  async function writeFileMeta(info) {
    return write(
      info.isMedia ? "media" : "file",
      info.kind || "file",
      {
        name: info.name,
        size: info.size,
        mime: info.mime,
        kind: info.kind || "file",
        ts: Date.now()
      }
    );
  }

  /**
   * Send a DWN record (or any payload) over WebRTC with DID proof.
   */
  async function sendOverP2P(payload) {
    if (typeof WebRTCPeer === "undefined") throw new Error("WebRTC not loaded");
    if (WebRTCPeer.channelState() !== "open") {
      throw new Error("P2P channel not open. Run p2p offer / answer first.");
    }
    let msg = payload;
    if (!msg.proof && typeof Identity !== "undefined") {
      await Identity.ensure();
      msg = await Identity.attachProof(msg);
    }
    WebRTCPeer.send(msg);
    return msg;
  }

  async function shareProfileOverP2P() {
    const rec = await writeProfileSnapshot();
    // Also attach avatar data URL if small enough
    let avatarDataUrl = null;
    try {
      if (typeof Profile !== "undefined" && Profile.getAvatar) {
        const av = await Profile.getAvatar();
        if (av && av.dataUrl && av.dataUrl.length < 120000) {
          avatarDataUrl = av.dataUrl;
        }
      }
    } catch (_) {}
    const envelope = {
      type: "dwn-record",
      recordId: rec.recordId,
      protocol: rec.protocol,
      protocolPath: rec.protocolPath,
      dataFormat: rec.dataFormat,
      data: Object.assign({}, rec.data, avatarDataUrl ? { avatarDataUrl: avatarDataUrl } : {}),
      author: rec.author,
      dateCreated: rec.dateCreated,
      schema: rec.schema
    };
    const signed = await Identity.attachProof(envelope);
    await putRecord(signed);
    await sendOverP2P(signed);
    // Keep classic profile-share for older peers
    try {
      if (typeof Profile !== "undefined" && Profile.snapshot) {
        const snap = await Profile.snapshot(true);
        snap.fromDid = Identity.getDid();
        const signedSnap = await Identity.attachProof(snap);
        WebRTCPeer.send(signedSnap);
      }
    } catch (_) {}
    return signed;
  }

  async function sendChatOverP2P(text) {
    const rec = await writeChat(text);
    const envelope = {
      type: "dwn-record",
      recordId: rec.recordId,
      protocol: "chat",
      protocolPath: "message",
      dataFormat: "application/json",
      data: rec.data,
      author: rec.author,
      dateCreated: rec.dateCreated
    };
    const signed = await Identity.attachProof(envelope);
    await putRecord(signed);
    await sendOverP2P(signed);
    // dual-send classic chat for compatibility
    try {
      WebRTCPeer.send({
        type: "chat",
        text: text,
        fromDid: Identity.getDid(),
        ts: Date.now(),
        proof: signed.proof
      });
    } catch (_) {}
    return signed;
  }

  async function status() {
    const all = await query({ limit: 5000 });
    const by = {};
    all.forEach(function (r) {
      by[r.protocol] = (by[r.protocol] || 0) + 1;
    });
    const peers = await listPeers();
    const did =
      typeof Identity !== "undefined" ? Identity.getDid() : null;
    return {
      did: did,
      records: all.length,
      byProtocol: by,
      peers: peers.length
    };
  }

  function statusText(st) {
    st = st || {};
    const lines = [
      "**Local DWN**\n",
      "• DID: `" + (st.did ? st.did.slice(0, 28) + "…" : "(none — did create)") + "`",
      "• Records: **" + (st.records || 0) + "**",
      "• Peer DIDs seen: **" + (st.peers || 0) + "**"
    ];
    const by = st.byProtocol || {};
    Object.keys(by).forEach(function (k) {
      lines.push("  – " + k + ": " + by[k]);
    });
    lines.push(
      "\n**Send (P2P channel open):**\n" +
        "• `dwn send chat Hello`\n" +
        "• `dwn share profile`\n" +
        "• `p2p file` / `p2p send …` / `p2p pay …` (auto-signed when DID exists)\n\n" +
        "`dwn query chat` · `dwn query profile` · `dwn query token`"
    );
    return lines.join("\n");
  }

  async function handleCommand(text) {
    const raw = String(text || "").trim();
    const t = raw.toLowerCase();

    if (t === "did" || t === "did show" || t === "my did" || t === "show did") {
      if (typeof Identity === "undefined") return { reply: "Identity module missing." };
      return { reply: Identity.summaryText() };
    }
    if (t === "did create" || t === "create did" || t === "did new") {
      if (typeof Identity === "undefined") return { reply: "Identity module missing." };
      const r = await Identity.ensure();
      return {
        reply:
          (r.existed ? "DID already exists.\n\n" : "**DID created** ✅\n\n") +
          Identity.summaryText()
      };
    }
    if (t === "did export") {
      const data = Identity.exportBundle();
      return {
        reply: "**DID export** ready (keep private — contains your key).",
        _downloadJSON: { filename: "localmind-did.json", data: data }
      };
    }
    if (t === "did clear" || t === "did reset") {
      Identity.clear();
      return { reply: "Local DID cleared. `did create` to make a new one." };
    }
    if (/^did import\s*\{/i.test(raw)) {
      try {
        const json = raw.replace(/^did import\s*/i, "");
        Identity.importBundle(JSON.parse(json));
        return { reply: "DID imported: `" + Identity.getDid() + "`" };
      } catch (e) {
        return { reply: "Import failed: " + (e.message || e) };
      }
    }

    if (t === "dwn" || t === "dwn status" || t === "my dwn") {
      const st = await status();
      return { reply: statusText(st) };
    }
    if (t === "dwn write profile" || t === "dwn save profile") {
      const rec = await writeProfileSnapshot();
      return {
        reply:
          "Profile written to DWN ✅\n\n• Record: `" +
          rec.recordId +
          "`\n• Author: `" +
          Identity.shortDid(rec.author) +
          "`"
      };
    }
    if (/^dwn send chat\s+/i.test(raw) || /^dwn chat\s+/i.test(raw)) {
      const msg = raw.replace(/^(?:dwn send chat|dwn chat)\s+/i, "").trim();
      if (!msg) return { reply: "Usage: `dwn send chat Hello`" };
      try {
        const rec = await sendChatOverP2P(msg);
        return {
          reply:
            "Signed chat sent via DWN/P2P ✅\n\n_" +
            msg.slice(0, 200) +
            "_\n\nRecord `" +
            rec.recordId.slice(0, 8) +
            "…`"
        };
      } catch (e) {
        // offline / no channel — still store locally
        const rec = await writeChat(msg);
        return {
          reply:
            "Saved to local DWN (P2P not open): `" +
            rec.recordId.slice(0, 8) +
            "…`\n\nOpen channel then `dwn send chat …`\nError: " +
            (e.message || e)
        };
      }
    }
    if (t === "dwn share profile" || t === "dwn send profile") {
      try {
        const rec = await shareProfileOverP2P();
        return {
          reply:
            "**Profile DWN record shared** over P2P ✅\n\n• DID: `" +
            Identity.shortDid(rec.author) +
            "`\n• Record: `" +
            rec.recordId.slice(0, 12) +
            "…`"
        };
      } catch (e) {
        return { reply: "Share failed: " + (e.message || e) };
      }
    }
    if (/^dwn query\s+/i.test(raw) || t === "dwn query") {
      const proto = raw.replace(/^dwn query\s*/i, "").trim().toLowerCase() || null;
      const rows = await query({
        protocol: proto || undefined,
        limit: 15
      });
      if (!rows.length) {
        return { reply: "No DWN records" + (proto ? " for **" + proto + "**" : "") + "." };
      }
      const lines = rows.map(function (r) {
        const bit =
          r.protocol === "chat"
            ? (r.data && r.data.text ? r.data.text.slice(0, 60) : "")
            : r.protocol === "profile"
              ? (r.data && r.data.name) || ""
              : r.protocol === "token"
                ? String((r.data && r.data.amount) || "") + " " + ((r.data && r.data.asset) || "")
                : (r.data && r.data.name) || r.protocolPath || "";
        const v = r._verified === false ? " ⚠️" : r.proof ? " 🔐" : "";
        return (
          "• **" +
          r.protocol +
          "** " +
          bit +
          v +
          " `" +
          (r.recordId || "").slice(0, 8) +
          "`"
        );
      });
      return { reply: "**DWN query**" + (proto ? " (" + proto + ")" : "") + "\n\n" + lines.join("\n") };
    }

    return null;
  }

  function isDidDwnCommand(text) {
    const t = String(text || "").trim().toLowerCase();
    if (!t) return false;
    return (
      /^(did|did show|my did|show did|did create|create did|did new|did export|did clear|did reset|dwn|dwn status|my dwn|dwn write profile|dwn save profile|dwn share profile|dwn send profile|dwn query)(\s|$)/i.test(
        t
      ) ||
      /^dwn send chat\s+/i.test(t) ||
      /^dwn chat\s+/i.test(t) ||
      /^dwn query\s+/i.test(t) ||
      /^did import\s*\{/i.test(t)
    );
  }

  return {
    write: write,
    query: query,
    ingestRemote: ingestRemote,
    writeProfileSnapshot: writeProfileSnapshot,
    writeChat: writeChat,
    writeTokenReceipt: writeTokenReceipt,
    writeFileMeta: writeFileMeta,
    sendOverP2P: sendOverP2P,
    shareProfileOverP2P: shareProfileOverP2P,
    sendChatOverP2P: sendChatOverP2P,
    status: status,
    statusText: statusText,
    handleCommand: handleCommand,
    isDidDwnCommand: isDidDwnCommand,
    rememberPeer: rememberPeer,
    listPeers: listPeers
  };
})();

if (typeof window !== "undefined") window.DWN = DWN;
