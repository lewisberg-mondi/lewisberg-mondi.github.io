/**
 * Kanairoex — SubtleCrypto utilities
 * Strong hashing & optional signing for blockchain memory integrity.
 * Falls back to a simple JS hash when SubtleCrypto is unavailable.
 */
const CryptoUtils = (() => {
  function isSupported() {
    return !!(window.crypto && window.crypto.subtle);
  }

  function bufToHex(buf) {
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function strToBuf(str) {
    return new TextEncoder().encode(str);
  }

  /** SHA-256 hex digest */
  async function sha256(text) {
    if (!isSupported()) return fallbackHash(text);
    const dig = await crypto.subtle.digest("SHA-256", strToBuf(String(text)));
    return bufToHex(dig);
  }

  /** Simple non-crypto fallback (FNV-1a style) for older environments */
  function fallbackHash(text) {
    let h = 2166136261;
    const s = String(text);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    // mix to 64-bit-ish hex
    const h2 = Math.imul(h ^ (h >>> 16), 2246822507);
    return (h >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
  }

  /** Hash an object deterministically */
  async function hashObject(obj) {
    const canonical = JSON.stringify(obj, Object.keys(obj || {}).sort());
    return sha256(canonical);
  }

  /**
   * Generate an ECDSA P-256 key pair for optional signing of memory blocks.
   * Keys stay in memory / can be exported as JWK.
   */
  async function generateKeyPair() {
    if (!isSupported()) throw new Error("SubtleCrypto not available");
    return crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"]
    );
  }

  async function exportPublicKey(key) {
    return crypto.subtle.exportKey("jwk", key);
  }

  async function sign(privateKey, text) {
    if (!isSupported()) throw new Error("SubtleCrypto not available");
    const sig = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      privateKey,
      strToBuf(String(text))
    );
    return bufToHex(sig);
  }

  async function verify(publicKey, text, signatureHex) {
    if (!isSupported()) return false;
    const sig = new Uint8Array(signatureHex.match(/.{1,2}/g).map((b) => parseInt(b, 16)));
    return crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      sig,
      strToBuf(String(text))
    );
  }

  /** Convenience: hash a blockchain-style block payload */
  async function hashBlock(block) {
    const { hash, ...rest } = block || {};
    return hashObject(rest);
  }

  function status() {
    return {
      supported: isSupported(),
      algorithms: isSupported() ? ["SHA-256", "ECDSA-P256"] : ["fallback-fnv"]
    };
  }

  return {
    isSupported,
    sha256,
    hashObject,
    hashBlock,
    generateKeyPair,
    exportPublicKey,
    sign,
    verify,
    fallbackHash,
    status
  };
})();

if (typeof window !== "undefined") window.CryptoUtils = CryptoUtils;
