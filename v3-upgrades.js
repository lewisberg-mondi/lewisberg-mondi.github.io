/* Kanairoex v3 Upgrade Layer
 * Dashboard, privacy tools, encrypted backup, command palette and storage telemetry.
 * No external dependencies.
 */
(function () {
  "use strict";
  const KEY = "localmind_v3_recent_files";

  function safeJSON(value) { try { return JSON.parse(value); } catch (_) { return null; } }
  function storageBytes() {
    let total = 0;
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); total += (k.length + String(localStorage.getItem(k) || "").length) * 2; } } catch (_) {}
    return total;
  }
  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1024 / 1024).toFixed(2) + " MB";
  }
  function recentFiles() { return safeJSON(localStorage.getItem(KEY) || "[]") || []; }
  function rememberFile(file, preview) {
    const list = recentFiles().filter(x => x.name !== file.name);
    list.unshift({ name: file.name, size: file.size, type: file.type || "", ts: Date.now(), preview: String(preview || "").slice(0, 300) });
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 12)));
  }
  function stats() {
    const s = (typeof AI !== "undefined" && AI.getStats) ? AI.getStats() : {};
    const history = (typeof AI !== "undefined" && AI.loadHistory) ? AI.loadHistory() : [];
    return {
      blocks: Number(s.blocks || 0), facts: Number(s.facts || 0), neurons: Number(s.neurons || 0),
      messages: history.length, storage: storageBytes(), storageLabel: formatBytes(storageBytes()),
      online: navigator.onLine, language: navigator.language || "en", memory: navigator.deviceMemory || null,
      cores: navigator.hardwareConcurrency || null, recentFiles: recentFiles()
    };
  }
  async function digest(text) {
    if (!crypto || !crypto.subtle) return "";
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  }
  async function encryptedBackup(password) {
    if (!password || password.length < 8) throw new Error("Use a password of at least 8 characters.");
    const data = JSON.stringify({ app: "Kanairoex", version: 3, exported: new Date().toISOString(), data: AI.exportAll() });
    if (!crypto || !crypto.subtle) throw new Error("Web Crypto is unavailable in this browser.");
    const enc = new TextEncoder(), salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
    const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(data));
    return { format: "Kanairoex Secure Backup v3", kdf: "PBKDF2-SHA256", iterations: 150000, salt: b64(salt), iv: b64(iv), ciphertext: b64(new Uint8Array(cipher)), checksum: await digest(data) };
  }
  async function decryptBackup(payload, password) {
    if (!payload || payload.format !== "Kanairoex Secure Backup v3") throw new Error("Not a Kanairoex v3 secure backup.");
    const dec = new TextDecoder(), enc = new TextEncoder();
    const salt = ub64(payload.salt), iv = ub64(payload.iv), ciphertext = ub64(payload.ciphertext);
    const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: Number(payload.iterations) || 150000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    const data = JSON.parse(dec.decode(plain));
    if (!data.data) throw new Error("Backup payload is incomplete.");
    return data.data;
  }
  function b64(bytes) { let s = ""; bytes.forEach(b => s += String.fromCharCode(b)); return btoa(s); }
  function ub64(s) { const raw = atob(s); return Uint8Array.from(raw, c => c.charCodeAt(0)); }
  function downloadJSON(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  window.KanairoexV3 = { stats, rememberFile, recentFiles, encryptedBackup, decryptBackup, downloadJSON, formatBytes };
})();
