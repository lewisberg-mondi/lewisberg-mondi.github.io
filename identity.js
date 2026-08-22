/**
 * Kanairoex Identity — DID (did:jwk with P-256) + sign/verify
 * Offline-first. Private key in localStorage (same device trust model as wallet).
 */
const Identity = (() => {
  const STORE_KEY = "localmind_did_identity_v1";
  const ALG = { name: "ECDSA", namedCurve: "P-256" };
  const SIGN_ALG = { name: "ECDSA", hash: "SHA-256" };

  function b64url(buf) {
    const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function b64urlDecode(str) {
    const s = String(str).replace(/-/g, "+").replace(/_/g, "/");
    const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
    const bin = atob(s + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function loadStore() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    } catch (_) {
      return null;
    }
  }

  function saveStore(obj) {
    localStorage.setItem(STORE_KEY, JSON.stringify(obj));
  }

  function jwkToDid(publicJwk) {
    const minimal = {
      kty: publicJwk.kty,
      crv: publicJwk.crv,
      x: publicJwk.x,
      y: publicJwk.y
    };
    const json = JSON.stringify(minimal);
    const bytes = new TextEncoder().encode(json);
    return "did:jwk:" + b64url(bytes);
  }

  function didToJwk(did) {
    if (!did || !String(did).startsWith("did:jwk:")) return null;
    try {
      const raw = b64urlDecode(String(did).slice("did:jwk:".length));
      return JSON.parse(new TextDecoder().decode(raw));
    } catch (_) {
      return null;
    }
  }

  async function create() {
    if (!crypto || !crypto.subtle) throw new Error("Web Crypto not available");
    const pair = await crypto.subtle.generateKey(ALG, true, ["sign", "verify"]);
    const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
    const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    const did = jwkToDid(publicJwk);
    const rec = {
      did: did,
      publicJwk: {
        kty: publicJwk.kty,
        crv: publicJwk.crv,
        x: publicJwk.x,
        y: publicJwk.y
      },
      privateJwk: privateJwk,
      createdAt: Date.now(),
      method: "did:jwk",
      curve: "P-256"
    };
    saveStore(rec);
    return { did: rec.did, createdAt: rec.createdAt, method: rec.method };
  }

  function getDid() {
    const s = loadStore();
    return s && s.did ? s.did : null;
  }

  function hasIdentity() {
    return !!getDid();
  }

  async function ensure() {
    if (hasIdentity()) {
      const s = loadStore();
      return { did: s.did, createdAt: s.createdAt, method: s.method, existed: true };
    }
    const c = await create();
    return Object.assign(c, { existed: false });
  }

  async function importPrivateKey() {
    const s = loadStore();
    if (!s || !s.privateJwk) throw new Error("No DID on this device. Run: did create");
    return crypto.subtle.importKey("jwk", s.privateJwk, ALG, false, ["sign"]);
  }

  async function importPublicKeyFromDid(did) {
    const jwk = didToJwk(did);
    if (!jwk) throw new Error("Unsupported DID (need did:jwk)");
    return crypto.subtle.importKey(
      "jwk",
      { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, ext: true },
      ALG,
      true,
      ["verify"]
    );
  }

  function canonicalPayload(obj) {
    // Stable-ish JSON for signing (sorted top-level keys, no proof field)
    const copy = {};
    Object.keys(obj || {})
      .filter(function (k) {
        return k !== "proof" && k !== "signature" && k !== "fromDid";
      })
      .sort()
      .forEach(function (k) {
        copy[k] = obj[k];
      });
    return JSON.stringify(copy);
  }

  async function signObject(obj) {
    const did = getDid();
    if (!did) throw new Error("No DID. Run: did create");
    const key = await importPrivateKey();
    const payload = canonicalPayload(obj);
    const sig = await crypto.subtle.sign(SIGN_ALG, key, new TextEncoder().encode(payload));
    return {
      type: "EcdsaSecp256r1Signature2019",
      created: new Date().toISOString(),
      verificationMethod: did + "#0",
      did: did,
      signatureValue: b64url(sig)
    };
  }

  async function attachProof(obj) {
    const proof = await signObject(obj);
    return Object.assign({}, obj, { proof: proof, fromDid: proof.did });
  }

  async function verifyObject(obj) {
    try {
      if (!obj || !obj.proof || !obj.proof.signatureValue) {
        return { ok: false, reason: "no-proof" };
      }
      const did = obj.proof.did || obj.fromDid;
      if (!did) return { ok: false, reason: "no-did" };
      const key = await importPublicKeyFromDid(did);
      const payload = canonicalPayload(obj);
      const sig = b64urlDecode(obj.proof.signatureValue);
      const ok = await crypto.subtle.verify(
        SIGN_ALG,
        key,
        sig,
        new TextEncoder().encode(payload)
      );
      return { ok: !!ok, did: did, reason: ok ? "valid" : "bad-signature" };
    } catch (e) {
      return { ok: false, reason: e.message || String(e) };
    }
  }

  function exportBundle() {
    const s = loadStore();
    if (!s) throw new Error("No DID to export");
    return {
      app: "Kanairoex",
      type: "did-export",
      exportedAt: new Date().toISOString(),
      identity: s
    };
  }

  function importBundle(obj) {
    if (!obj || !obj.identity || !obj.identity.did || !obj.identity.privateJwk) {
      throw new Error("Invalid DID export");
    }
    saveStore(obj.identity);
    return { did: obj.identity.did };
  }

  function clear() {
    try {
      localStorage.removeItem(STORE_KEY);
    } catch (_) {}
  }

  function shortDid(did) {
    const d = did || getDid() || "";
    if (d.length < 24) return d;
    return d.slice(0, 18) + "…" + d.slice(-8);
  }

  function status() {
    const s = loadStore();
    return {
      hasDid: !!s,
      did: s ? s.did : null,
      short: s ? shortDid(s.did) : null,
      method: s ? s.method : null,
      createdAt: s ? s.createdAt : null
    };
  }

  function summaryText() {
    const st = status();
    if (!st.hasDid) {
      return (
        "**No DID yet**\n\nCreate one: `did create`\n\n" +
        "Your DID is a portable identity used to sign profile, chat, files, and token transfers over P2P/DWN."
      );
    }
    return (
      "**Decentralized Identity**\n\n" +
      "• DID: `" +
      st.did +
      "`\n" +
      "• Method: **" +
      st.method +
      "** (P-256)\n" +
      "• Created: " +
      (st.createdAt ? new Date(st.createdAt).toLocaleString() : "—") +
      "\n\n" +
      "Commands: `did show` · `did export` · `dwn status` · `share profile`"
    );
  }

  return {
    create: create,
    ensure: ensure,
    getDid: getDid,
    hasIdentity: hasIdentity,
    signObject: signObject,
    attachProof: attachProof,
    verifyObject: verifyObject,
    exportBundle: exportBundle,
    importBundle: importBundle,
    clear: clear,
    status: status,
    shortDid: shortDid,
    summaryText: summaryText,
    didToJwk: didToJwk,
    jwkToDid: jwkToDid
  };
})();

if (typeof window !== "undefined") window.Identity = Identity;
