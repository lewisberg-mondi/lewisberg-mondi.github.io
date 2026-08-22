/**
 * Kanairoex Secure Memory
 * Stores knowledge / cognitive data in a machine-oriented format:
 *   1. Structured serialize
 *   2. Compress (gzip via CompressionStream or fallback)
 *   3. Encrypt (AES-GCM via Web Crypto)
 * Result is opaque binary (base64) — not human-readable.
 *
 * Realistic compression: text/knowledge often 3–10×; not 10,000×.
 * Encryption makes content unreadable without the key.
 */
(function (root) {
  'use strict';

  const NS = 'localmind_securemem_v1_';
  const STORE_KEY = NS + 'vault';
  const META_KEY = NS + 'meta';
  const SALT_KEY = NS + 'salt';

  const state = {
    unlocked: false,
    key: null,          // CryptoKey
    salt: null,         // Uint8Array
    cache: null         // decrypted object after unlock
  };

  function u8ToB64(u8) {
    let s = '';
    const chunk = 0x8000;
    for (let i = 0; i < u8.length; i += chunk) {
      s += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
    }
    return btoa(s);
  }
  function b64ToU8(b64) {
    const s = atob(b64);
    const u8 = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
    return u8;
  }
  function randBytes(n) {
    const a = new Uint8Array(n);
    crypto.getRandomValues(a);
    return a;
  }

  async function deriveKey(password, salt) {
    const enc = new TextEncoder();
    const base = await crypto.subtle.importKey(
      'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt, iterations: 120000, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function compress(u8) {
    if (typeof CompressionStream !== 'undefined') {
      const cs = new CompressionStream('gzip');
      const writer = cs.writable.getWriter();
      writer.write(u8);
      writer.close();
      const ab = await new Response(cs.readable).arrayBuffer();
      return new Uint8Array(ab);
    }
    // Minimal fallback: store uncompressed (still encrypted)
    return u8;
  }

  async function decompress(u8) {
    if (typeof DecompressionStream !== 'undefined') {
      try {
        const ds = new DecompressionStream('gzip');
        const writer = ds.writable.getWriter();
        writer.write(u8);
        writer.close();
        const ab = await new Response(ds.readable).arrayBuffer();
        return new Uint8Array(ab);
      } catch (_) {
        // maybe stored uncompressed
        return u8;
      }
    }
    return u8;
  }

  async function encrypt(u8, key) {
    const iv = randBytes(12);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, u8);
    // layout: iv(12) + ciphertext
    const out = new Uint8Array(12 + ct.byteLength);
    out.set(iv, 0);
    out.set(new Uint8Array(ct), 12);
    return out;
  }

  async function decrypt(blob, key) {
    const iv = blob.subarray(0, 12);
    const ct = blob.subarray(12);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ct);
    return new Uint8Array(pt);
  }

  function loadSalt() {
    try {
      const b64 = localStorage.getItem(SALT_KEY);
      if (b64) return b64ToU8(b64);
    } catch (_) {}
    const salt = randBytes(16);
    try { localStorage.setItem(SALT_KEY, u8ToB64(salt)); } catch (_) {}
    return salt;
  }

  /**
   * Collect current Kanairoex memory snapshot (knowledge + cognitive + space logs).
   */
  function collectSnapshot() {
    const snap = {
      v: 1,
      ts: new Date().toISOString(),
      knowledge: null,
      cognitive: null,
      space: null,
      history: null
    };
    try {
      if (root.Knowledge && typeof root.Knowledge.exportAll === 'function') {
        snap.knowledge = root.Knowledge.exportAll();
      } else if (root.Knowledge && root.Knowledge.all) {
        snap.knowledge = root.Knowledge.all();
      }
    } catch (_) {}
    try {
      if (root.CognitiveEngine && root.CognitiveEngine.snapshot) {
        snap.cognitive = root.CognitiveEngine.snapshot();
      }
    } catch (_) {}
    try {
      if (root.SpaceComms && root.SpaceComms._state) {
        const s = root.SpaceComms._state;
        snap.space = {
          callsign: s.callsign,
          tmLog: (s.tmLog || []).slice(-50),
          cmdLog: (s.cmdLog || []).slice(-30),
          outbox: s.outbox || []
        };
      }
    } catch (_) {}
    try {
      if (root.AI && root.AI.loadHistory) snap.history = root.AI.loadHistory().slice(-100);
    } catch (_) {}
    return snap;
  }

  function applySnapshot(snap) {
    if (!snap || typeof snap !== 'object') return { ok: false, error: 'Invalid snapshot' };
    let restored = [];
    try {
      if (snap.knowledge && root.Knowledge && root.Knowledge.importAll) {
        root.Knowledge.importAll(snap.knowledge);
        restored.push('knowledge');
      }
    } catch (_) {}
    // Cognitive / space / history are best-effort restore via existing APIs if present
    try {
      if (snap.history && root.AI && root.AI.saveHistory) {
        root.AI.saveHistory(snap.history);
        restored.push('history');
      }
    } catch (_) {}
    return { ok: true, restored: restored };
  }

  async function lockWithPassword(password) {
    if (!password || password.length < 4) {
      return { ok: false, error: 'Password too short (min 4)' };
    }
    if (!root.crypto || !crypto.subtle) {
      return { ok: false, error: 'Web Crypto not available' };
    }
    const salt = loadSalt();
    const key = await deriveKey(password, salt);
    const snap = collectSnapshot();
    const json = JSON.stringify(snap);
    const plain = new TextEncoder().encode(json);
    const compressed = await compress(plain);
    const sealed = await encrypt(compressed, key);

    const ratio = plain.length ? (compressed.length / plain.length) : 1;
    const meta = {
      ts: new Date().toISOString(),
      plainBytes: plain.length,
      compressedBytes: compressed.length,
      sealedBytes: sealed.length,
      ratio: Math.round(ratio * 1000) / 1000,
      alg: 'AES-GCM-256 + gzip + PBKDF2-120k'
    };

    try {
      localStorage.setItem(STORE_KEY, u8ToB64(sealed));
      localStorage.setItem(META_KEY, JSON.stringify(meta));
    } catch (e) {
      return { ok: false, error: 'Storage failed: ' + (e.message || e) };
    }

    state.unlocked = false;
    state.key = null;
    state.cache = null;
    state.salt = salt;

    return {
      ok: true,
      meta: meta,
      message: 'Memory sealed. Plain ' + meta.plainBytes + ' B → compressed ' +
        meta.compressedBytes + ' B → encrypted ' + meta.sealedBytes + ' B (' +
        (meta.ratio * 100).toFixed(1) + '% of original before encryption).'
    };
  }

  async function unlockWithPassword(password) {
    if (!password) return { ok: false, error: 'Password required' };
    if (!root.crypto || !crypto.subtle) return { ok: false, error: 'Web Crypto not available' };

    const sealedB64 = localStorage.getItem(STORE_KEY);
    if (!sealedB64) return { ok: false, error: 'No sealed vault found' };

    const salt = loadSalt();
    const key = await deriveKey(password, salt);
    try {
      const sealed = b64ToU8(sealedB64);
      const compressed = await decrypt(sealed, key);
      const plain = await decompress(compressed);
      const json = new TextDecoder().decode(plain);
      const snap = JSON.parse(json);
      state.key = key;
      state.unlocked = true;
      state.cache = snap;
      state.salt = salt;
      return { ok: true, snapshot: snap, meta: getMeta() };
    } catch (e) {
      return { ok: false, error: 'Unlock failed (wrong password or corrupt data)' };
    }
  }

  async function saveUnlocked() {
    if (!state.unlocked || !state.key) {
      return { ok: false, error: 'Vault is locked' };
    }
    const snap = collectSnapshot();
    const json = JSON.stringify(snap);
    const plain = new TextEncoder().encode(json);
    const compressed = await compress(plain);
    const sealed = await encrypt(compressed, state.key);
    const ratio = plain.length ? (compressed.length / plain.length) : 1;
    const meta = {
      ts: new Date().toISOString(),
      plainBytes: plain.length,
      compressedBytes: compressed.length,
      sealedBytes: sealed.length,
      ratio: Math.round(ratio * 1000) / 1000,
      alg: 'AES-GCM-256 + gzip + PBKDF2-120k'
    };
    try {
      localStorage.setItem(STORE_KEY, u8ToB64(sealed));
      localStorage.setItem(META_KEY, JSON.stringify(meta));
    } catch (e) {
      return { ok: false, error: 'Storage failed' };
    }
    state.cache = snap;
    return { ok: true, meta: meta };
  }

  function lock() {
    state.unlocked = false;
    state.key = null;
    state.cache = null;
    return { ok: true };
  }

  function getMeta() {
    try {
      const raw = localStorage.getItem(META_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  function status() {
    const meta = getMeta();
    return {
      hasVault: !!localStorage.getItem(STORE_KEY),
      unlocked: state.unlocked,
      meta: meta,
      webCrypto: !!(root.crypto && crypto.subtle),
      compression: typeof CompressionStream !== 'undefined'
    };
  }

  function isSecureCommand(text) {
    const t = String(text || '').trim().toLowerCase();
    return /^(seal memory|encrypt memory|lock memory|unlock memory|secure status|vault status|save vault)/i.test(t);
  }

  async function handleSecureCommand(text) {
    const t = String(text || '').trim();
    const lower = t.toLowerCase();

    if (/^(secure status|vault status)/i.test(lower)) {
      const s = status();
      const lines = [
        '**Secure Memory Status**',
        '- Vault present: ' + (s.hasVault ? 'yes' : 'no'),
        '- Unlocked: ' + (s.unlocked ? 'yes' : 'no'),
        '- Web Crypto: ' + (s.webCrypto ? 'yes' : 'no'),
        '- Compression: ' + (s.compression ? 'gzip available' : 'fallback'),
      ];
      if (s.meta) {
        lines.push('- Last seal: ' + s.meta.ts);
        lines.push('- Plain: ' + s.meta.plainBytes + ' B');
        lines.push('- Compressed: ' + s.meta.compressedBytes + ' B (' + (s.meta.ratio * 100).toFixed(1) + '%)');
        lines.push('- Encrypted blob: ' + s.meta.sealedBytes + ' B');
        lines.push('- Algorithm: ' + s.meta.alg);
      }
      lines.push('');
      lines.push('Commands: `seal memory <password>` · `unlock memory <password>` · `lock memory` · `save vault`');
      return { reply: lines.join('\n') };
    }

    if (/^lock memory$/i.test(lower)) {
      lock();
      return { reply: 'Vault locked. In-memory key cleared.' };
    }

    if (/^save vault$/i.test(lower)) {
      const r = await saveUnlocked();
      if (!r.ok) return { reply: 'Save failed: ' + r.error };
      return { reply: 'Vault updated.\n' + r.meta.plainBytes + ' B → ' + r.meta.compressedBytes + ' B compressed → ' + r.meta.sealedBytes + ' B sealed.' };
    }

    const sealMatch = t.match(/^seal memory\s+(.+)$/i) || t.match(/^encrypt memory\s+(.+)$/i);
    if (sealMatch) {
      const password = sealMatch[1].trim();
      const r = await lockWithPassword(password);
      if (!r.ok) return { reply: 'Seal failed: ' + r.error };
      return { reply: r.message + '\n\nVault is now locked. Use `unlock memory <password>` to open later.' };
    }

    const unlockMatch = t.match(/^unlock memory\s+(.+)$/i);
    if (unlockMatch) {
      const password = unlockMatch[1].trim();
      const r = await unlockWithPassword(password);
      if (!r.ok) return { reply: 'Unlock failed: ' + r.error };
      const applied = applySnapshot(r.snapshot);
      return {
        reply: 'Vault unlocked.' +
          (applied.restored && applied.restored.length ? ' Restored: ' + applied.restored.join(', ') + '.' : '') +
          (r.meta ? '\nBlob: ' + r.meta.sealedBytes + ' B (was ' + r.meta.plainBytes + ' B plain).' : '')
      };
    }

    return {
      reply: 'Secure memory commands:\n' +
        '- `seal memory <password>` — compress + encrypt current memory\n' +
        '- `unlock memory <password>` — decrypt and restore\n' +
        '- `lock memory` — clear key from RAM\n' +
        '- `save vault` — re-seal while unlocked\n' +
        '- `secure status` — vault info'
    };
  }

  root.SecureMemory = {
    lockWithPassword,
    unlockWithPassword,
    saveUnlocked,
    lock,
    status,
    getMeta,
    collectSnapshot,
    isSecureCommand,
    handleSecureCommand,
    _state: state
  };
})(typeof window !== 'undefined' ? window : globalThis);
