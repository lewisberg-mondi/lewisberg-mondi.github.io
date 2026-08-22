/**
 * Kanairoex Multi-Token Wallet (LMT + created tokens)
 * Kanairoex system economy: create tokens, price them, transfer between users over P2P.
 * LMT is the base utility token. Custom tokens share the same wallet, outbox,
 * history, explorer and WebRTC delivery path.
 * NOT real cryptocurrency / NOT on a public blockchain.
 *
 * Security: optional Sudoku-derived wallet password (only a hash is stored).
 * Pricing / FX: system display rates for swaps (not a public exchange).
 */
const LMTWallet = (() => {
  const SYMBOL = "LMT";
  const EMOJI = "💎"; // public display symbol for LMT; "LMT" remains the internal ticker for compatibility
  const NAME = "Kanairoex Token";
  const MAX_SUPPLY = 33000000000;
  const MIN_SEND = 0.001;
  const MAX_SEND = 1000000;
  const STORAGE_KEY = "localmind_lmt_wallet_v2";
  const AUTH_KEY = "localmind_lmt_auth_v1";
  const OUTBOX_KEY = "localmind_lmt_outbox_v1";
  const PRICE_KEY = "localmind_lmt_price_v1";
  const REGISTRY_KEY = "localmind_token_registry_v1";
  const DECIMALS = 3;
  const GENESIS = 1; // every new wallet starts with 1 LMT (must buy/earn more to create tokens)
  const QUESTION_REWARD = 0.001;
  const BASE_USD_PER_LMT = 0.01; // 0.01 USDT per LMT at genesis
  const DAILY_GROWTH = 0.001; // 0.1% per day compound
  const GENESIS_DAY = "2026-01-01"; // price epoch (UTC date string)
  const CREATE_FEE_LMT = 10000; // LMT required to create a new token (fee seeds the AMM pool)
  const SESSION_MS = 15 * 60 * 1000; // unlocked session 15 min
  const LEDGER_KEY = "localmind_lmt_ledger_v1";
  const WALLET_ENC_KEY = "localmind_lmt_wallet_enc_v1";
  const IDENTITY_ENC_HINT = "localmind_did_identity_enc_v1";

  // Educational FX anchors (KES per unit) — display only
  const FX = {
    USD: 129.38,
    GBP: 174.96,
    EUR: 149.4,
    JPY: 0.814 // 100 JPY = 81.4 KES → 1 JPY = 0.814 KES
  };

  // ── Concurrent / atomic transaction guard ──
  // JS is single-threaded; this reentrancy guard prevents nested mutations and
  // serialises async callers that await withLock(...).
  let _txBusy = false;
  let _txWaiters = [];
  function withLock(fn) {
    if (_txBusy) {
      // Queue for async callers
      return new Promise(function (resolve, reject) {
        _txWaiters.push(function () {
          try { resolve(withLock(fn)); } catch (e) { reject(e); }
        });
      });
    }
    _txBusy = true;
    try {
      const result = fn();
      if (result && typeof result.then === "function") {
        return result.then(
          function (v) { _txBusy = false; _drainWaiters(); return v; },
          function (e) { _txBusy = false; _drainWaiters(); throw e; }
        );
      }
      _txBusy = false;
      _drainWaiters();
      return result;
    } catch (e) {
      _txBusy = false;
      _drainWaiters();
      throw e;
    }
  }
  function _drainWaiters() {
    if (_txWaiters.length && !_txBusy) {
      const next = _txWaiters.shift();
      next();
    }
  }

  // ── AES-GCM helpers for encrypted wallet / key storage ──
  function bytesToB64(bytes) {
    let s = "";
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return btoa(s);
  }
  function b64ToBytes(b64) {
    const raw = atob(String(b64));
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  async function deriveAesKey(password, salt, usages) {
    const enc = new TextEncoder();
    const base = await crypto.subtle.importKey("raw", enc.encode(String(password)), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: 120000, hash: "SHA-256" },
      base,
      { name: "AES-GCM", length: 256 },
      false,
      usages
    );
  }
  async function aesEncrypt(plaintext, password) {
    if (!crypto || !crypto.subtle) throw new Error("Web Crypto unavailable");
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveAesKey(password, salt, ["encrypt"]);
    const cipher = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(String(plaintext))
    );
    return {
      v: 1,
      kdf: "PBKDF2-SHA256",
      iterations: 120000,
      salt: bytesToB64(salt),
      iv: bytesToB64(iv),
      ciphertext: bytesToB64(new Uint8Array(cipher))
    };
  }
  async function aesDecrypt(payload, password) {
    if (!payload || !payload.ciphertext) throw new Error("Invalid encrypted payload");
    if (!crypto || !crypto.subtle) throw new Error("Web Crypto unavailable");
    const salt = b64ToBytes(payload.salt);
    const iv = b64ToBytes(payload.iv);
    const ciphertext = b64ToBytes(payload.ciphertext);
    const key = await deriveAesKey(password, salt, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return new TextDecoder().decode(plain);
  }

  // In-memory session key material (cleared on lock)
  let _sessionPassword = null; // the solved Sudoku string while unlocked


  // ── Multi-token registry (ecosystem) ─────────────────
  function defaultRegistry() {
    return {
      LMT: {
        symbol: "LMT",
        emoji: "💎",
        name: "Kanairoex Token",
        maxSupply: MAX_SUPPLY,
        decimals: DECIMALS,
        baseUsd: BASE_USD_PER_LMT,
        dailyGrowth: DAILY_GROWTH,
        genesisDay: GENESIS_DAY,
        createdAt: Date.parse(GENESIS_DAY + "T00:00:00Z"),
        creator: "system",
        transferable: true
      }
    };
  }

  function loadRegistry() {
    try {
      const raw = localStorage.getItem(REGISTRY_KEY);
      const reg = raw ? JSON.parse(raw) : defaultRegistry();
      if (!reg.LMT) reg.LMT = defaultRegistry().LMT;
      if (reg.LMT && !reg.LMT.emoji) reg.LMT.emoji = "💎";
      return reg;
    } catch {
      return defaultRegistry();
    }
  }

  function saveRegistry(reg) {
    try {
      localStorage.setItem(REGISTRY_KEY, JSON.stringify(reg));
    } catch (e) {
      console.warn("Registry save failed", e);
    }
  }

  function getTokenMeta(symbol) {
    const sym = String(symbol || "LMT").toUpperCase();
    const reg = loadRegistry();
    return reg[sym] || null;
  }

  function listTokens() {
    return Object.values(loadRegistry());
  }

  /**
   * Pool-backed pricing. LMT is the system stable unit of account.
   * Constant-product pool: price(token in LMT) = pool.lmt / pool.token
   * USD = that * priceUsdPerLmt().
   * Fallback to baseUsd if pool missing (legacy tokens).
   */
  function ensurePool(meta) {
    if (!meta) return null;
    if (meta.symbol === "LMT") return null;
    if (!meta.pool || typeof meta.pool !== "object") {
      meta.pool = { lmt: 0, token: 0, volumeLmt: 0, swaps: 0, lpSupply: 0, feeLmt: 0 };
    }
    if (meta.pool.lpSupply == null) meta.pool.lpSupply = 0;
    if (meta.pool.feeLmt == null) meta.pool.feeLmt = 0;
    if (meta.pool.lmt == null) meta.pool.lmt = 0;
    if (meta.pool.token == null) meta.pool.token = 0;
    if (meta.pool.volumeLmt == null) meta.pool.volumeLmt = 0;
    if (meta.pool.swaps == null) meta.pool.swaps = 0;
    return meta.pool;
  }

  function priceInLmt(symbol) {
    const meta = getTokenMeta(symbol);
    if (!meta) return 0;
    if (meta.symbol === "LMT") return 1;
    const pool = ensurePool(meta);
    if (pool && pool.token > 0 && pool.lmt > 0) {
      return pool.lmt / pool.token;
    }
    // Legacy / empty pool: derive from baseUsd vs LMT USD
    const lmtPx = priceUsdPerLmt() || BASE_USD_PER_LMT;
    const base = meta.baseUsd > 0 ? meta.baseUsd : 0.0001;
    return base / lmtPx;
  }

  function priceUsdPerToken(symbol) {
    const meta = getTokenMeta(symbol);
    if (!meta) return 0;
    if (meta.symbol === "LMT") return priceUsdPerLmt();
    return roundMoney(priceInLmt(symbol) * priceUsdPerLmt(), 8);
  }

  /** Circulation = maxSupply - tokens locked in pool */
  function circulatingSupply(symbol) {
    const meta = getTokenMeta(symbol);
    if (!meta) return 0;
    if (meta.symbol === "LMT") return MAX_SUPPLY; // informational
    const pool = ensurePool(meta);
    const locked = pool ? (pool.token || 0) : 0;
    return round(Math.max(0, (meta.maxSupply || 0) - locked));
  }

  function marketCapUsd(symbol) {
    return roundMoney(circulatingSupply(symbol) * priceUsdPerToken(symbol), 6);
  }

  /** Full market snapshot for one token */
  function tokenStats(symbol) {
    const sym = String(symbol || "LMT").toUpperCase();
    const meta = getTokenMeta(sym);
    if (!meta) return null;
    const pool = ensurePool(meta);
    const pxLmt = priceInLmt(sym);
    const pxUsd = priceUsdPerToken(sym);
    const circ = circulatingSupply(sym);
    return {
      symbol: sym,
      emoji: meta.emoji || (sym === "LMT" ? EMOJI : ""),
      name: meta.name || sym,
      maxSupply: meta.maxSupply || 0,
      circulating: circ,
      poolLmt: pool ? round(pool.lmt) : 0,
      poolToken: pool ? round(pool.token) : 0,
      priceLmt: roundMoney(pxLmt, 8),
      priceUsd: pxUsd,
      marketCapUsd: marketCapUsd(sym),
      volumeLmt: pool ? round(pool.volumeLmt || 0) : 0,
      swaps: pool ? (pool.swaps || 0) : 0,
      lpSupply: pool ? round(pool.lpSupply || 0) : 0,
      lpBalance: getLpBalance(sym),
      feeLmt: pool ? round(pool.feeLmt || 0) : 0,
      availableInPool: pool ? round(pool.token || 0) : 0,
      creator: meta.creator || "system",
      createdAt: meta.createdAt || null,
      transferable: meta.transferable !== false,
      syncedFrom: meta.syncedFrom || null,
      syncedAt: meta.syncedAt || null
    };
  }

  function allTokenStats() {
    return listTokens()
      .filter(function (t) { return t.symbol !== "LMT"; })
      .map(function (t) { return tokenStats(t.symbol); })
      .filter(Boolean);
  }

  /** Snapshot of all non-LMT pools for P2P / online sync */
  function exportPools() {
    const reg = loadRegistry();
    const tokens = {};
    for (const k of Object.keys(reg)) {
      if (k === "LMT") continue;
      const m = reg[k];
      tokens[k] = {
        symbol: m.symbol,
        emoji: m.emoji,
        name: m.name,
        maxSupply: m.maxSupply,
        baseUsd: m.baseUsd,
        createdAt: m.createdAt,
        creator: m.creator,
        transferable: m.transferable,
        createFeeLmt: m.createFeeLmt,
        pool: ensurePool(m) ? { ...m.pool } : null
      };
    }
    return {
      type: "pool-registry",
      version: 2,
      exported: Date.now(),
      address: getAddress(),
      tokens: tokens
    };
  }

  /**
   * Merge a remote pool registry into local.
   * Same symbol: prefer the snapshot with more activity (swaps/volume);
   * if remote has deeper LMT liquidity and equal/more activity, adopt remote pool.
   * New symbols from peers become available to buy locally.
   */
  function mergePools(remotePayload) {
    if (!remotePayload || !remotePayload.tokens) {
      return { ok: false, reason: "Invalid pool payload", added: 0, updated: 0 };
    }
    const reg = loadRegistry();
    let added = 0, updated = 0;
    for (const sym of Object.keys(remotePayload.tokens)) {
      const remote = remotePayload.tokens[sym];
      if (!remote || !remote.symbol || remote.symbol === "LMT") continue;
      if (!/^[A-Z][A-Z0-9]{1,7}$/.test(String(remote.symbol).toUpperCase())) continue;
      if (!isEmojiSymbol(remote.emoji) || remote.emoji === EMOJI) continue;
      const local = reg[sym];
      if (!local) {
        reg[sym] = {
          symbol: remote.symbol,
          emoji: remote.emoji,
          name: remote.name || remote.symbol,
          maxSupply: remote.maxSupply || 0,
          decimals: DECIMALS,
          baseUsd: remote.baseUsd || 0.0001,
          dailyGrowth: 0.0003,
          createdAt: remote.createdAt || Date.now(),
          creator: remote.creator || remotePayload.address || "peer",
          transferable: remote.transferable !== false,
          createFeeLmt: remote.createFeeLmt || CREATE_FEE_LMT,
          pool: remote.pool || { lmt: 0, token: 0, volumeLmt: 0, swaps: 0, lpSupply: 0, feeLmt: 0 },
          syncedFrom: remotePayload.address || "peer",
          syncedAt: Date.now()
        };
        ensurePool(reg[sym]);
        added++;
        continue;
      }
      // Merge pool state
      const lp = ensurePool(local) || { lmt: 0, token: 0, volumeLmt: 0, swaps: 0, lpSupply: 0, feeLmt: 0 };
      const rp = remote.pool || { lmt: 0, token: 0, volumeLmt: 0, swaps: 0, lpSupply: 0, feeLmt: 0 };
      const localScore = (lp.swaps || 0) * 10 + (lp.volumeLmt || 0);
      const remoteScore = (rp.swaps || 0) * 10 + (rp.volumeLmt || 0);
      if (remoteScore > localScore || (remoteScore === localScore && (rp.lmt || 0) > (lp.lmt || 0))) {
        local.pool = {
          lmt: round(rp.lmt || 0),
          token: round(rp.token || 0),
          volumeLmt: round(Math.max(lp.volumeLmt || 0, rp.volumeLmt || 0)),
          swaps: Math.max(lp.swaps || 0, rp.swaps || 0),
          lpSupply: round(rp.lpSupply || lp.lpSupply || 0),
          feeLmt: round(Math.max(lp.feeLmt || 0, rp.feeLmt || 0))
        };
        if (remote.emoji && !local.emoji) local.emoji = remote.emoji;
        if (remote.name) local.name = remote.name;
        local.syncedFrom = remotePayload.address || "peer";
        local.syncedAt = Date.now();
        reg[sym] = local;
        updated++;
      } else if ((rp.lmt || 0) > (lp.lmt || 0) && (rp.token || 0) > 0) {
        // Remote has more LMT in pool — blend upward without wiping token side ratio badly
        const ratio = lp.token > 0 ? lp.lmt / lp.token : 0;
        local.pool = {
          lmt: round(rp.lmt),
          token: ratio > 0 ? round(rp.lmt / ratio) : round(rp.token || lp.token),
          volumeLmt: round(Math.max(lp.volumeLmt || 0, rp.volumeLmt || 0)),
          swaps: Math.max(lp.swaps || 0, rp.swaps || 0),
          lpSupply: round(rp.lpSupply || lp.lpSupply || 0),
          feeLmt: round(Math.max(lp.feeLmt || 0, rp.feeLmt || 0))
        };
        reg[sym] = local;
        updated++;
      }
    }
    saveRegistry(reg);
    return { ok: true, added, updated, total: Object.keys(reg).length - 1 };
  }

  /** Broadcast pool registry over open WebRTC channel (offline-first P2P) */
  function broadcastPools() {
    if (typeof WebRTCPeer === "undefined" || WebRTCPeer.channelState() !== "open") {
      return { sent: false, reason: "channel not open" };
    }
    try {
      WebRTCPeer.send(exportPools());
      return { sent: true };
    } catch (e) {
      return { sent: false, reason: e.message || String(e) };
    }
  }

  /**
   * Online global pool pull — tries optional sync URL, then P2P broadcast.
   * syncUrl in localStorage key localmind_pool_sync_url (optional).
   */
  async function syncPoolsOnline() {
    const results = { p2p: null, http: null, merged: null };
    results.p2p = broadcastPools();
    let url = null;
    try { url = localStorage.getItem("localmind_pool_sync_url"); } catch (e) {}
    if (url && typeof fetch === "function") {
      try {
        const res = await fetch(url, { method: "GET", cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          results.http = { ok: true };
          results.merged = mergePools(data);
          // push our state if endpoint accepts POST
          try {
            await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(exportPools())
            });
          } catch (e2) {}
        } else {
          results.http = { ok: false, status: res.status };
        }
      } catch (e) {
        results.http = { ok: false, error: e.message || String(e) };
      }
    } else {
      results.http = { ok: false, reason: url ? "fetch unavailable" : "no sync URL (set with: pool sync url https://…)" };
    }
    return results;
  }

  function setPoolSyncUrl(url) {
    const u = String(url || "").trim();
    if (!u) {
      try { localStorage.removeItem("localmind_pool_sync_url"); } catch (e) {}
      return { ok: true, url: null };
    }
    if (!/^https?:\/\//i.test(u)) throw new Error("URL must start with http:// or https://");
    localStorage.setItem("localmind_pool_sync_url", u);
    return { ok: true, url: u };
  }

  function getPoolSyncUrl() {
    try { return localStorage.getItem("localmind_pool_sync_url"); } catch (e) { return null; }
  }


  function ensureLpAsset(w, symbol) {
    const sym = String(symbol || "").toUpperCase();
    if (!w.lp || typeof w.lp !== "object") w.lp = {};
    if (w.lp[sym] == null) w.lp[sym] = 0;
    return sym;
  }

  function getLpBalance(symbol) {
    const sym = String(symbol || "").toUpperCase();
    const w = load();
    return round((w.lp && w.lp[sym]) || 0);
  }

  function getAssetBalance(symbol) {
    const sym = String(symbol || "LMT").toUpperCase();
    const w = load();
    return round(w.assets[sym] || 0);
  }

  function ensureAsset(w, symbol) {
    const sym = String(symbol || "LMT").toUpperCase();
    if (w.assets[sym] == null) w.assets[sym] = 0;
    return sym;
  }

  /**
   * Validate a real emoji grapheme, not merely any non-ASCII character.
   * This prevents names such as "Café" or currency/math symbols from being
   * accidentally accepted as token symbols.
   */
  function isEmojiSymbol(value) {
    const t = String(value || "").trim();
    if (!t || t.length > 32 || /\s/.test(t)) return false;
    try {
      const segments = typeof Intl !== "undefined" && Intl.Segmenter
        ? Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(t), x => x.segment)
        : [t];
      if (segments.length !== 1) return false;
      const hasEmojiPresentation = /\p{Emoji_Presentation}/u.test(t);
      const hasEmojiVariation = /\p{Extended_Pictographic}\uFE0F/u.test(t);
      const hasKeycap = /[#*0-9]\uFE0F?\u20E3/u.test(t);
      const hasFlag = /^(?:\p{Regional_Indicator}){2}$/u.test(t);
      const hasModifier = /\p{Emoji_Modifier}/u.test(t);
      const hasZwjEmoji = /\u200D(?:\p{Emoji_Presentation}|\p{Extended_Pictographic})/u.test(t);
      return hasEmojiPresentation || hasEmojiVariation || hasKeycap || hasFlag || hasModifier || hasZwjEmoji;
    } catch (e) {
      return /^[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]\uFE0F?(?:[\u{1F3FB}-\u{1F3FF}])?(?:\u200D[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]\uFE0F?)*$/u.test(t);
    }
  }

  /** Extract only a whitespace-delimited trailing emoji token from a command. */
  function extractEmojiFromText(text) {
    const parts = String(text || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "";
    const last = parts[parts.length - 1];
    return isEmojiSymbol(last) ? last : "";
  }

  /** Public display symbol: LMT is always represented by 💎; custom tokens use their emoji. */
  function displaySymbol(symbol) {
    const meta = getTokenMeta(symbol);
    const sym = String(symbol || "LMT").toUpperCase();
    if (sym === "LMT") return EMOJI;
    const em = (meta && isEmojiSymbol(meta.emoji)) ? meta.emoji : "";
    return em || sym;
  }

  /** Create a system token — costs CREATE_FEE_LMT (10000 LMT). Emoji is required. */
  function tokenCreationQuote(symbol, supply, baseUsd) {
    symbol = String(symbol || "").toUpperCase();
    supply = Number(supply);
    const usd = Number(baseUsd);
    if (!Number.isFinite(supply) || supply <= 0) throw new Error("Invalid supply");
    if (!Number.isFinite(usd) || usd < 0) throw new Error("Invalid starting USD price");
    const userTokens = round(Math.max(1, supply * 0.1));
    const seedToken = round(Math.max(1, supply - userTokens));
    const base = usd > 0 ? usd : 0.0001;
    const lmtPx = priceUsdPerLmt() || BASE_USD_PER_LMT;
    const desiredPriceLmt = base / lmtPx;
    let poolLmt = round(Math.max(CREATE_FEE_LMT, seedToken * desiredPriceLmt));
    const MAX_POOL_LMT = Math.max(CREATE_FEE_LMT * 50, 50000);
    if (poolLmt > MAX_POOL_LMT) poolLmt = MAX_POOL_LMT;
    const extraLmt = round(Math.max(0, poolLmt - CREATE_FEE_LMT));
    return {
      symbol, supply, baseUsd: base, creatorShare: userTokens,
      poolToken: seedToken, creationFeeLmt: CREATE_FEE_LMT,
      initialLiquidityLmt: extraLmt,
      totalRequiredLmt: round(CREATE_FEE_LMT + extraLmt),
      priceLmt: roundMoney(poolLmt / seedToken, 8)
    };
  }

  function createToken(symbol, name, supply, baseUsd, emoji) {
    requireUnlocked();
    symbol = String(symbol || "").toUpperCase();
    if (!/^[A-Z][A-Z0-9]{1,7}$/.test(symbol)) {
      throw new Error("Symbol must be 2–8 chars, start with a letter (A–Z)");
    }
    if (symbol === "LMT" || symbol === "USD" || symbol === "KES" || symbol === "GBP" || symbol === "EUR" || symbol === "JPY") {
      throw new Error("Reserved symbol: " + symbol);
    }
    emoji = String(emoji || "").trim();
    if (!isEmojiSymbol(emoji)) {
      throw new Error(
        "Emoji symbol required when creating a token.\n" +
        "Example: `create token MYT MyToken 1000000 0.01 🚀`\n" +
        "Pick any emoji (🚀 🔥 ⭐ 🌟 …). LMT itself uses 💎."
      );
    }
    if (emoji === "💎" || emoji === EMOJI) {
      throw new Error("💎 is reserved for LMT. Choose a different emoji.");
    }
    const reg = loadRegistry();
    if (reg[symbol]) throw new Error("Token already exists: " + symbol);
    // Unique emoji across registry
    for (const k of Object.keys(reg)) {
      if (reg[k] && reg[k].emoji === emoji) {
        throw new Error("Emoji " + emoji + " is already used by token " + k);
      }
    }
    supply = Number(supply);
    if (!Number.isFinite(supply) || !(supply > 0) || supply > 1e15) throw new Error("Invalid supply");
    const usd = Number(baseUsd);
    if (!Number.isFinite(usd) || usd < 0) throw new Error("Invalid starting USD price");
    const tokenName = String(name || symbol).trim().slice(0, 48);
    if (!tokenName) throw new Error("Token name is required");

    const w = load();
    ensureAsset(w, "LMT");
    const fee = CREATE_FEE_LMT;

    // Creator (owner) gets 10% of supply; 90% sits in the AMM pool for others to buy via swap
    const userTokens = round(Math.max(1, supply * 0.1));
    const seedToken = round(Math.max(1, supply - userTokens));
    const base = usd > 0 ? usd : 0.0001;

    // Seed pool so initial AMM price ≈ requested baseUsd (charting / markets stay reasonable).
    // fee is the minimum LMT locked; if baseUsd implies more LMT, require the extra from the creator.
    const lmtPx = priceUsdPerLmt() || BASE_USD_PER_LMT;
    const desiredPriceLmt = base / lmtPx; // LMT per 1 token
    let poolLmt = round(Math.max(fee, seedToken * desiredPriceLmt));
    // Cap extreme seeds so create doesn't require absurd balances
    const MAX_POOL_LMT = Math.max(fee * 50, 50000);
    if (poolLmt > MAX_POOL_LMT) poolLmt = MAX_POOL_LMT;
    const extraLmt = round(Math.max(0, poolLmt - fee));
    const totalRequiredLmt = round(fee + extraLmt);
    const availableLmt = round(w.assets.LMT || 0);
    if (availableLmt < totalRequiredLmt) {
      throw new Error(
        "Need " + totalRequiredLmt + " 💎 LMT to create this token " +
        "(creation fee " + fee + " + initial liquidity " + extraLmt +
        "; balance: " + availableLmt + ")."
      );
    }

    // Apply the debit only after every validation/preflight succeeds.
    w.assets.LMT = round(availableLmt - totalRequiredLmt);
    w.balance = w.assets.LMT;

    const meta = {
      symbol,
      emoji,
      name: tokenName,
      maxSupply: supply,
      decimals: DECIMALS,
      baseUsd: base,
      dailyGrowth: 0.0003,
      createdAt: Date.now(),
      creator: getAddress(),
      transferable: true,
      createFeeLmt: fee,
      // Constant-product AMM pool vs 💎 LMT — seeded near baseUsd
      pool: {
        lmt: poolLmt,
        token: seedToken,
        volumeLmt: 0,
        swaps: 0,
        lpSupply: Math.sqrt(poolLmt * seedToken),
        feeLmt: 0
      }
    };
    reg[symbol] = meta;
    saveRegistry(reg);

    ensureAsset(w, symbol);
    ensureLpAsset(w, symbol);
    w.assets[symbol] = round((w.assets[symbol] || 0) + userTokens);
    // Creator receives the initial LP position representing the seeded pool.
    w.lp[symbol] = round((w.lp[symbol] || 0) + meta.pool.lpSupply);
    addHistory(w, {
      id: "tx-create-" + symbol + "-" + Date.now(),
      type: "create-token",
      amount: userTokens,
      asset: symbol,
      emoji: emoji,
      feeLmt: fee,
      poolLmt: poolLmt,
      poolToken: seedToken,
      note: "Created " + emoji + " " + meta.name + " — " + poolLmt + " 💎 LMT → pool (fee " + fee + ") · " + seedToken + " for sale · creator " + userTokens + " (10%) · ~$" + base + "/token",
      ts: Date.now()
    });
    save(w);

    if (typeof Blockchain !== "undefined" && Blockchain.addBlock) {
      try {
        Blockchain.addBlock({
          type: "token-create",
          symbol: symbol,
          emoji: emoji,
          name: meta.name,
          supply: supply,
          feeLmt: fee,
          poolLmt: poolLmt,
          poolToken: seedToken,
          circulating: userTokens,
          creator: w.address,
          baseUsd: meta.baseUsd
        });
      } catch (e) {}
    }

    try {
      if (typeof KanairoexToken !== "undefined" && KanairoexToken.createSymbol) {
        if (!KanairoexToken.status().tokens[symbol]) {
          KanairoexToken.createSymbol(symbol, meta.name, supply, "Pool-backed token " + emoji, emoji);
        }
        KanairoexToken.mint(symbol, w.address, userTokens);
      }
    } catch (e) {}

    const stats = tokenStats(symbol);
    // Share new listing with peers so others can buy from the global pool view
    try { broadcastPools(); } catch (e) {}
    return {
      meta,
      balance: w.assets[symbol],
      feeLmt: fee,
      initialLiquidityLmt: extraLmt,
      totalRequiredLmt: totalRequiredLmt,
      lmtBalance: w.assets.LMT,
      address: w.address,
      emoji: emoji,
      pool: meta.pool,
      creatorShare: userTokens,
      availableInPool: seedToken,
      lpBalance: w.lp[symbol],
      lpSupply: meta.pool.lpSupply,
      circulating: userTokens,
      priceLmt: stats && stats.priceLmt,
      priceUsd: stats && stats.priceUsd
    };
  }

  /**
   * Swap using constant-product AMM against 💎 LMT pools.
   * LMT ↔ TOKEN: moves reserves in that token's pool (price changes).
   * TOKEN ↔ TOKEN: route through LMT (two pool hops).
   */
  function swapAgainstPool(tokenSym, amountIn, tokenInIsLmt) {
    const reg = loadRegistry();
    const meta = reg[tokenSym];
    if (!meta || meta.symbol === "LMT") throw new Error("No pool for " + tokenSym);
    const pool = ensurePool(meta);
    if (!(pool.lmt > 0) || !(pool.token > 0)) throw new Error("Empty pool for " + tokenSym);

    const feeBps = 30; // 0.30% pool fee stays in pool
    const amountInAfterFee = amountIn * (1 - feeBps / 10000);
    let amountOut = 0;

    if (tokenInIsLmt) {
      // User pays LMT, receives TOKEN. Add LMT to pool, remove TOKEN.
      // x*y = k → out = token - k/(lmt+in)
      const k = pool.lmt * pool.token;
      const newLmt = pool.lmt + amountInAfterFee;
      const newToken = k / newLmt;
      amountOut = pool.token - newToken;
      if (!(amountOut > 0)) throw new Error("Swap output too small");
      pool.lmt = round(pool.lmt + amountIn); // full input incl. fee stays in pool
      pool.token = round(newToken);
      pool.volumeLmt = round((pool.volumeLmt || 0) + amountIn);
    } else {
      // User pays TOKEN, receives LMT
      const k = pool.lmt * pool.token;
      const newToken = pool.token + amountInAfterFee;
      const newLmt = k / newToken;
      amountOut = pool.lmt - newLmt;
      if (!(amountOut > 0)) throw new Error("Swap output too small");
      pool.token = round(pool.token + amountIn);
      pool.lmt = round(newLmt);
      pool.volumeLmt = round((pool.volumeLmt || 0) + amountOut);
    }
    pool.swaps = (pool.swaps || 0) + 1;
    // Accrue protocol fee leg in LMT terms (used to fund learning rewards)
    try {
      const feeLmtPart = tokenInIsLmt
        ? amountIn * (feeBps / 10000)
        : amountOut * (feeBps / 10000);
      pool.feeLmt = round((pool.feeLmt || 0) + feeLmtPart);
    } catch (_) {}
    reg[tokenSym] = meta;
    saveRegistry(reg);
    return round(amountOut);
  }

  /** Add proportional liquidity to a TOKEN/💎 LMT pool and mint LP shares. */
  function addLiquidity(amountLmt, tokenSym, amountToken) {
    requireUnlocked();
    const sym = String(tokenSym || "").toUpperCase();
    const meta = getTokenMeta(sym);
    if (!meta || sym === "LMT") throw new Error("Unknown custom token " + sym);
    const pool = ensurePool(meta);
    amountLmt = Number(amountLmt);
    amountToken = Number(amountToken);
    if (!(amountLmt > 0) || !(amountToken > 0)) throw new Error("Both liquidity amounts must be positive");
    const w = load(); ensureAsset(w, "LMT"); ensureAsset(w, sym); ensureLpAsset(w, sym);
    if (w.assets.LMT < amountLmt) throw new Error("Insufficient 💎 LMT");
    if (w.assets[sym] < amountToken) throw new Error("Insufficient " + sym);
    const oldL = Number(pool.lmt || 0), oldT = Number(pool.token || 0);
    let shares;
    if (oldL > 0 && oldT > 0 && pool.lpSupply > 0) {
      const ratioL = amountLmt / oldL, ratioT = amountToken / oldT;
      const tolerance = Math.max(1e-9, Math.max(ratioL, ratioT) * 1e-6);
      if (Math.abs(ratioL - ratioT) > tolerance) throw new Error("Liquidity must match the pool ratio: " + round(oldL) + " 💎 : " + round(oldT) + " " + sym);
      shares = Math.min(ratioL, ratioT) * pool.lpSupply;
    } else {
      shares = Math.sqrt(amountLmt * amountToken);
    }
    if (!(shares > 0)) throw new Error("Liquidity is too small");
    w.assets.LMT = round(w.assets.LMT - amountLmt);
    w.assets[sym] = round(w.assets[sym] - amountToken);
    pool.lmt = round(oldL + amountLmt); pool.token = round(oldT + amountToken);
    pool.lpSupply = round((pool.lpSupply || 0) + shares);
    w.lp[sym] = round((w.lp[sym] || 0) + shares);
    addHistory(w, { id:"tx-lp-add-"+Date.now(), type:"liquidity-add", asset:sym, amountLmt, amountToken, lpShares:shares, ts:Date.now() });
    saveRegistry(Object.assign(loadRegistry(), {[sym]:meta})); save(w);
    try { broadcastPools(); } catch(e) {}
    return { token:sym, amountLmt:round(amountLmt), amountToken:round(amountToken), lpShares:round(shares), lpBalance:w.lp[sym], pool:tokenStats(sym) };
  }

  /** Burn LP shares and withdraw the proportional TOKEN + 💎 LMT reserves. */
  function removeLiquidity(tokenSym, shares) {
    requireUnlocked();
    const sym = String(tokenSym || "").toUpperCase();
    const meta = getTokenMeta(sym);
    if (!meta || sym === "LMT") throw new Error("Unknown custom token " + sym);
    const pool = ensurePool(meta);
    shares = Number(shares);
    const w = load(); ensureLpAsset(w, sym);
    const owned = Number(w.lp[sym] || 0);
    if (!(shares > 0) || shares > owned) throw new Error("Invalid LP share amount");
    if (!(pool.lpSupply > 0)) throw new Error("Pool has no LP shares");
    const ratio = shares / pool.lpSupply;
    const outLmt = pool.lmt * ratio, outToken = pool.token * ratio;
    pool.lmt = round(pool.lmt - outLmt); pool.token = round(pool.token - outToken); pool.lpSupply = round(pool.lpSupply - shares);
    w.lp[sym] = round(owned - shares); ensureAsset(w,"LMT"); ensureAsset(w,sym);
    w.assets.LMT = round(w.assets.LMT + outLmt); w.assets[sym] = round(w.assets[sym] + outToken);
    addHistory(w, { id:"tx-lp-remove-"+Date.now(), type:"liquidity-remove", asset:sym, amountLmt:round(outLmt), amountToken:round(outToken), lpShares:round(shares), ts:Date.now() });
    saveRegistry(Object.assign(loadRegistry(), {[sym]:meta})); save(w);
    try { broadcastPools(); } catch(e) {}
    return { token:sym, amountLmt:round(outLmt), amountToken:round(outToken), lpShares:round(shares), lpBalance:w.lp[sym], pool:tokenStats(sym) };
  }

  function swap(amount, fromSymbol, toSymbol) {
    requireUnlocked();
    const from = String(fromSymbol || "").toUpperCase();
    const to = String(toSymbol || "").toUpperCase();
    amount = Number(amount);
    if (!(amount > 0)) throw new Error("Amount must be positive");
    if (from === to) throw new Error("Cannot swap a token for itself");

    const w = load();
    ensureAsset(w, from);
    ensureAsset(w, to);
    if ((w.assets[from] || 0) < amount) {
      throw new Error("Insufficient " + from + " (have " + round(w.assets[from] || 0) + ")");
    }

    let received = 0;
    let route = from + "→" + to;
    const registryBeforeSwap = JSON.parse(JSON.stringify(loadRegistry()));

    try {
      if (from === "LMT" && to !== "LMT") {
        if (!getTokenMeta(to)) throw new Error("Unknown token " + to);
        received = swapAgainstPool(to, amount, true);
        route = "💎 LMT → pool → " + to;
      } else if (to === "LMT" && from !== "LMT") {
        if (!getTokenMeta(from)) throw new Error("Unknown token " + from);
        received = swapAgainstPool(from, amount, false);
        route = from + " → pool → 💎 LMT";
      } else {
        // TOKEN → LMT → TOKEN. Both pool mutations must succeed atomically.
        if (!getTokenMeta(from) || !getTokenMeta(to)) throw new Error("Unknown token pair");
        const midLmt = swapAgainstPool(from, amount, false);
        if (!(midLmt > 0)) throw new Error("First hop produced zero LMT");
        received = swapAgainstPool(to, midLmt, true);
        route = from + " → 💎 → " + to;
      }
    } catch (e) {
      saveRegistry(registryBeforeSwap);
      throw e;
    }

    if (!(received > 0)) throw new Error("Swap amount too small");

    w.assets[from] = round((w.assets[from] || 0) - amount);
    w.assets[to] = round((w.assets[to] || 0) + received);
    if (from === "LMT" || to === "LMT") w.balance = w.assets.LMT || 0;

    const usdValue = roundMoney(amount * priceUsdPerToken(from), 6);
    addHistory(w, {
      id: "tx-swap-" + Date.now(),
      type: "swap",
      amount: amount,
      asset: from,
      received: received,
      toAsset: to,
      note: "Pool swap " + amount + " " + from + " → " + received + " " + to + " (" + route + ")",
      ts: Date.now()
    });
    save(w);

    if (typeof Blockchain !== "undefined" && Blockchain.addBlock) {
      try {
        Blockchain.addBlock({
          type: "token-swap",
          from: from,
          to: to,
          amountIn: amount,
          amountOut: received,
          usdValue: usdValue,
          route: route,
          address: w.address
        });
      } catch (e) {}
    }
    try { broadcastPools(); } catch (e) {}
    return {
      from: from,
      to: to,
      amountIn: amount,
      amountOut: received,
      usdValue: usdValue,
      route: route,
      priceAfter: {
        from: priceUsdPerToken(from),
        to: priceUsdPerToken(to)
      },
      balances: { [from]: w.assets[from], [to]: w.assets[to] },
      pool: to === "LMT" ? tokenStats(from) : tokenStats(to)
    };
  }

  let sessionUnlockedUntil = 0;
  let pendingSudoku = null; // { puzzle, solutionHash, grid }


  function round(n) {
    return Math.round(Number(n) * Math.pow(10, DECIMALS)) / Math.pow(10, DECIMALS);
  }

  function roundMoney(n, d) {
    const p = Math.pow(10, d == null ? 6 : d);
    return Math.round(Number(n) * p) / p;
  }

  async function sha256(text) {
    if (typeof CryptoUtils !== "undefined" && CryptoUtils.sha256) {
      return CryptoUtils.sha256(String(text));
    }
    if (window.crypto && window.crypto.subtle) {
      const data = new TextEncoder().encode(String(text));
      const buf = await window.crypto.subtle.digest("SHA-256", data);
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }
    // Weak fallback (not for production security)
    let h = 0;
    const s = String(text);
    for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    return "fallback-" + Math.abs(h).toString(16);
  }

  // ── Sudoku (4×4 educational lock) ─────────────────────
  function generateSudoku4() {
    // Fixed valid 4×4 templates; shuffle digits/rows lightly
    const base = [
      [1, 2, 3, 4],
      [3, 4, 1, 2],
      [2, 1, 4, 3],
      [4, 3, 2, 1]
    ];
    const map = [1, 2, 3, 4].sort(() => Math.random() - 0.5);
    const sol = base.map((row) => row.map((v) => map[v - 1]));
    const puzzle = sol.map((row) => row.slice());
    // Remove ~8 cells
    let removed = 0;
    while (removed < 8) {
      const r = Math.floor(Math.random() * 4);
      const c = Math.floor(Math.random() * 4);
      if (puzzle[r][c] !== 0) {
        puzzle[r][c] = 0;
        removed++;
      }
    }
    return { puzzle, solution: sol };
  }

  function formatGrid(grid) {
    return grid
      .map((row) => row.map((v) => (v === 0 ? "." : String(v))).join(" "))
      .join("\n");
  }

  function parseSolutionInput(text) {
    // Accept "1 2 3 4 / 3 4 1 2 / ..." or 16 digits
    const nums = String(text)
      .replace(/[^\d]/g, " ")
      .trim()
      .split(/\s+/)
      .map((x) => parseInt(x, 10))
      .filter((n) => n >= 1 && n <= 4);
    if (nums.length !== 16) return null;
    const g = [];
    for (let i = 0; i < 4; i++) g.push(nums.slice(i * 4, i * 4 + 4));
    return g;
  }

  function solutionString(grid) {
    return grid.map((r) => r.join("")).join("");
  }

  function loadAuth() {
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveAuth(obj) {
    try {
      localStorage.setItem(AUTH_KEY, JSON.stringify(obj));
    } catch (e) {
      console.warn("Auth save failed", e);
    }
  }

  function isLocked() {
    const auth = loadAuth();
    if (!auth || !auth.hash) return false; // no password set
    return Date.now() > sessionUnlockedUntil;
  }

  function requireUnlocked() {
    if (isLocked()) {
      throw new Error(
        "Wallet locked. Type `wallet unlock` and solve the Sudoku, or `wallet password` to set one."
      );
    }
  }

  async function startSetPassword() {
    const { puzzle, solution } = generateSudoku4();
    const solutionHash = await sha256(solutionString(solution));
    pendingSudoku = { mode: "set", puzzle, solutionHash, solutionHint: null };
    return {
      mode: "set",
      puzzleText: formatGrid(puzzle),
      instructions:
        "**Set wallet password (Sudoku)**\n\n" +
        "Solve this 4×4 Sudoku (digits 1–4, each row/col/box unique).\n" +
        "Empty cells are `.`\n\n```\n" +
        formatGrid(puzzle) +
        "\n```\n\n" +
        "Reply with: `wallet solve 1 2 3 4 3 4 1 2 2 1 4 3 4 3 2 1`\n" +
        "(16 digits, row by row).\n\n" +
        "_Only a hash of your solution is stored — the puzzle answer is never saved in readable form._"
    };
  }

  async function startUnlock() {
    const auth = loadAuth();
    if (!auth || !auth.hash) {
      return { ok: false, message: "No password set. Use `wallet password` first." };
    }
    const { puzzle, solution } = generateSudoku4();
    // Unlock challenge is a NEW sudoku each time; user must enter the
    // original password digits they chose at set-time, not this puzzle.
    // Better UX: unlock by entering the 16-digit password they set.
    pendingSudoku = { mode: "unlock", puzzle: null, solutionHash: auth.hash };
    return {
      ok: true,
      mode: "unlock",
      instructions:
        "**Unlock wallet**\n\n" +
        "Enter the 16-digit Sudoku solution you set as password:\n" +
        "`wallet solve d1 d2 … d16`\n\n" +
        "_Password hash only is stored locally. Plain solution is never kept._"
    };
  }

  async function submitSolve(text) {
    const grid = parseSolutionInput(text);
    if (!grid) {
      return { ok: false, message: "Need exactly 16 digits (1–4). Example: `wallet solve 1 2 3 4 3 4 1 2 2 1 4 3 4 3 2 1`" };
    }
    const sol = solutionString(grid);
    const hash = await sha256(sol);
    if (!pendingSudoku) {
      // Allow direct unlock attempt if auth exists
      const auth = loadAuth();
      if (auth && auth.hash && hash === auth.hash) {
        _sessionPassword = sol;
        sessionUnlockedUntil = Date.now() + SESSION_MS;
        await hydrateFromEncrypted(sol);
        return { ok: true, message: "Wallet unlocked for 15 minutes (encrypted session active)." };
      }
      return { ok: false, message: "No pending challenge. Type `wallet unlock` or `wallet password`." };
    }
    if (pendingSudoku.mode === "set") {
      // Verify they solved the shown puzzle
      if (hash !== pendingSudoku.solutionHash) {
        return { ok: false, message: "Incorrect Sudoku solution. Try again or `wallet password` for a new puzzle." };
      }
      saveAuth({
        hash: hash,
        setAt: Date.now(),
        note: "Sudoku-derived password hash only — solution not stored",
        encrypted: true
      });
      pendingSudoku = null;
      _sessionPassword = sol;
      sessionUnlockedUntil = Date.now() + SESSION_MS;
      // Encrypt existing wallet under the new password
      try {
        await hydrateFromEncrypted(sol);
        const w = load();
        await persistEncryptedIfPossible(w);
      } catch (e) {
        console.warn("Initial encrypt failed", e);
      }
      return {
        ok: true,
        message:
          "Password set. Wallet storage is now AES-GCM encrypted.\nUnlocked for 15 minutes.\n" +
          "**Remember your 16-digit solution** — it cannot be recovered from the device."
      };
    }
    if (pendingSudoku.mode === "unlock") {
      if (hash !== pendingSudoku.solutionHash) {
        return { ok: false, message: "Wrong password. Try again." };
      }
      pendingSudoku = null;
      _sessionPassword = sol;
      sessionUnlockedUntil = Date.now() + SESSION_MS;
      await hydrateFromEncrypted(sol);
      return { ok: true, message: "Wallet unlocked for 15 minutes (encrypted session active)." };
    }
    return { ok: false, message: "Unknown auth state." };
  }

  function lock() {
    sessionUnlockedUntil = 0;
    pendingSudoku = null;
    _sessionPassword = null;
    return "Wallet locked. Session key cleared.";
  }

  function clearPassword() {
    requireUnlocked();
    localStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(WALLET_ENC_KEY);
    sessionUnlockedUntil = 0;
    _sessionPassword = null;
    // Leave plaintext STORAGE_KEY as-is for open access
    return "Password removed. Wallet is open (unencrypted) on this device.";
  }

  // ── Authoritative ledger helpers ──────────────────────
  function loadLedger() {
    try {
      const raw = localStorage.getItem(LEDGER_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function saveLedger(entries) {
    try {
      // Keep last 2000 entries to bound storage
      const trimmed = Array.isArray(entries) ? entries.slice(-2000) : [];
      localStorage.setItem(LEDGER_KEY, JSON.stringify(trimmed));
    } catch (e) {
      console.warn("Ledger save failed", e);
    }
  }

  /** Append a single authoritative ledger entry (source of truth). */
  function appendLedger(entry) {
    const list = loadLedger();
    const e = Object.assign({
      seq: list.length,
      ts: Date.now(),
      id: entry.id || ("led-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7))
    }, entry);
    list.push(e);
    saveLedger(list);
    return e;
  }

  /**
   * Global 33B supply enforcement for LMT.
   * Tracks cumulative issued amount on this device (genesis + purchases + rewards + receives that mint).
   * Prevents any credit that would push device-tracked issued past MAX_SUPPLY.
   */
  function getIssuedLmt() {
    try {
      const w = _rawLoad();
      return Number(w.issuedLmt != null ? w.issuedLmt : (w.totalReceived || 0));
    } catch {
      return 0;
    }
  }

  function checkSupplyHeadroom(extra) {
    const issued = getIssuedLmt();
    const next = round(issued + Number(extra || 0));
    if (next > MAX_SUPPLY) {
      return {
        ok: false,
        reason: "Global 33B LMT supply limit reached (issued " + issued + " / " + MAX_SUPPLY + "). Cannot issue more."
      };
    }
    return { ok: true, issued, next };
  }

  // ── Wallet core ───────────────────────────────────────
  function defaultWallet() {
    const id = "LMT-" + Math.random().toString(36).slice(2, 10).toUpperCase();
    const genesisEntry = {
      id: "tx-genesis",
      type: "genesis",
      amount: GENESIS,
      asset: "LMT",
      note: "Genesis allocation — " + GENESIS + " LMT (authoritative ledger)",
      ts: Date.now()
    };
    // Seed ledger
    appendLedger({
      kind: "mint",
      asset: "LMT",
      amount: GENESIS,
      to: id,
      reason: "genesis",
      txId: genesisEntry.id
    });
    return {
      address: id,
      balance: GENESIS,
      assets: { LMT: GENESIS, USD: 0, KES: 0, GBP: 0, EUR: 0, JPY: 0 },
      created: Date.now(),
      history: [genesisEntry],
      totalReceived: GENESIS,
      totalSent: 0,
      questionsRewarded: 0,
      issuedLmt: GENESIS, // device-tracked issued against global 33B cap
      ledgerHead: 1
    };
  }

  /** Low-level plaintext load (no side effects). */
  function _rawLoad() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const w = JSON.parse(raw);
      if (!w.assets) {
        w.assets = { LMT: w.balance || 0, USD: 0, KES: 0, GBP: 0, EUR: 0, JPY: 0 };
      }
      if (w.assets.LMT == null) w.assets.LMT = w.balance || 0;
      if (w.issuedLmt == null) w.issuedLmt = w.totalReceived || w.assets.LMT || 0;
      return w;
    } catch {
      return null;
    }
  }

  async function hydrateFromEncrypted(password) {
    const pwd = password || _sessionPassword;
    if (!pwd) return null;
    try {
      const encRaw = localStorage.getItem(WALLET_ENC_KEY);
      if (encRaw) {
        const payload = JSON.parse(encRaw);
        const json = await aesDecrypt(payload, pwd);
        const w = JSON.parse(json);
        if (w && w.address) {
          if (!w.assets) w.assets = { LMT: w.balance || 0 };
          if (w.issuedLmt == null) w.issuedLmt = w.totalReceived || w.assets.LMT || 0;
          _cachedWallet = w;
          return w;
        }
      }
    } catch (e) {
      console.warn("Decrypt hydrate failed", e);
    }
    // Fall back to plaintext if present
    const plain = _rawLoad();
    if (plain && !plain.encrypted) {
      _cachedWallet = plain;
      return plain;
    }
    return null;
  }

  async function persistEncryptedIfPossible(w) {
    if (!_sessionPassword || !crypto || !crypto.subtle) {
      // Fallback: plaintext
      _plainSave(w);
      return;
    }
    try {
      const payload = await aesEncrypt(JSON.stringify(w), _sessionPassword);
      localStorage.setItem(WALLET_ENC_KEY, JSON.stringify(payload));
      // Keep a minimal plaintext stub so address is discoverable when locked
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        address: w.address,
        encrypted: true,
        v: 2,
        updated: Date.now()
      }));
      _cachedWallet = w;
    } catch (e) {
      console.warn("Encrypt persist failed, falling back to plaintext", e);
      _plainSave(w);
    }
  }

  function _plainSave(w) {
    try {
      w.balance = round(w.assets && w.assets.LMT != null ? w.assets.LMT : w.balance);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(w));
    } catch (e) {
      console.warn("LMT save failed", e);
    }
  }

  function load() {
    // Prefer encrypted blob when session password is available
    if (_sessionPassword) {
      try {
        const encRaw = localStorage.getItem(WALLET_ENC_KEY);
        if (encRaw) {
          // Synchronous path cannot await; callers that need decrypt after unlock
          // already called persist. For in-session loads we keep a soft cache.
          if (_cachedWallet) return _cachedWallet;
        }
      } catch (_) {}
    }
    let w = _rawLoad();
    if (!w || w.encrypted) {
      // Encrypted stub or missing → create or require unlock
      if (!w) {
        w = defaultWallet();
        save(w);
        return w;
      }
      // Stub only: try to use cache or return minimal
      if (_cachedWallet) return _cachedWallet;
      // Cannot decrypt without password; return stub-safe object
      return {
        address: w.address || "LMT-LOCKED",
        balance: 0,
        assets: { LMT: 0 },
        history: [],
        totalReceived: 0,
        totalSent: 0,
        questionsRewarded: 0,
        issuedLmt: 0,
        lockedEncrypted: true
      };
    }
    if (w.assets.LMT > MAX_SUPPLY) w.assets.LMT = MAX_SUPPLY;
    return w;
  }

  let _cachedWallet = null;

  function save(w) {
    if (w && w.lockedEncrypted) return;
    // Soft cap individual wallet
    if (w.assets && w.assets.LMT > MAX_SUPPLY) w.assets.LMT = MAX_SUPPLY;
    w.balance = round(w.assets && w.assets.LMT != null ? w.assets.LMT : w.balance);
    _cachedWallet = w;
    if (_sessionPassword) {
      // Fire-and-forget encrypt (async)
      persistEncryptedIfPossible(w).catch(() => _plainSave(w));
    } else {
      _plainSave(w);
    }
  }

  function getBalance(symbol) {
    return getAssetBalance(symbol || "LMT");
  }

  function getAddress() {
    return load().address;
  }

  // ── Simulated price (educational) ─────────────────────
  function daysSinceEpoch() {
    const t0 = Date.parse(GENESIS_DAY + "T00:00:00Z");
    const now = Date.now();
    return Math.max(0, Math.floor((now - t0) / 86400000));
  }

  function priceUsdPerLmt() {
    const days = daysSinceEpoch();
    // compound daily 0.1%
    return roundMoney(BASE_USD_PER_LMT * Math.pow(1 + DAILY_GROWTH, days), 8);
  }

  function convertLmtTo(amountLmt, currency) {
    const usd = amountLmt * priceUsdPerLmt();
    const c = String(currency || "USD").toUpperCase();
    if (c === "USD") return { amount: roundMoney(usd, 6), currency: "USD", usdPerLmt: priceUsdPerLmt() };
    if (c === "KES") return { amount: roundMoney(usd * FX.USD, 4), currency: "KES", usdPerLmt: priceUsdPerLmt() };
    if (c === "GBP") return { amount: roundMoney((usd * FX.USD) / FX.GBP, 6), currency: "GBP", usdPerLmt: priceUsdPerLmt() };
    if (c === "EUR") return { amount: roundMoney((usd * FX.USD) / FX.EUR, 6), currency: "EUR", usdPerLmt: priceUsdPerLmt() };
    if (c === "JPY") return { amount: roundMoney((usd * FX.USD) / FX.JPY, 4), currency: "JPY", usdPerLmt: priceUsdPerLmt() };
    return { amount: roundMoney(usd, 6), currency: "USD", usdPerLmt: priceUsdPerLmt() };
  }

  /** Educational in-wallet convert LMT → fiat balance bucket (not real money). */
  function exchangeLmt(amount, currency) {
    requireUnlocked();
    const a = round(amount);
    if (!(a >= MIN_SEND)) throw new Error("Amount too small");
    const w = load();
    if (a > (w.assets.LMT || 0)) throw new Error("Insufficient LMT");
    const conv = convertLmtTo(a, currency);
    w.assets.LMT = round(w.assets.LMT - a);
    w.assets[conv.currency] = roundMoney((w.assets[conv.currency] || 0) + conv.amount, 6);
    w.balance = w.assets.LMT;
    addHistory(w, {
      id: "tx-xchg-" + Date.now(),
      type: "exchange",
      amount: a,
      asset: "LMT",
      toAsset: conv.currency,
      toAmount: conv.amount,
      note: "Educational convert @ " + conv.usdPerLmt + " USD/LMT",
      ts: Date.now()
    });
    save(w);
    return { spentLmt: a, received: conv.amount, currency: conv.currency, rate: conv.usdPerLmt, balances: w.assets };
  }

  function info() {
    const w = load();
    const px = priceUsdPerLmt();
    const usdVal = roundMoney((w.assets.LMT || 0) * px, 6);
    const reg = loadRegistry();
    const portfolio = [];
    let portfolioUsd = 0;
    for (const sym of Object.keys(w.assets || {})) {
      if (["USD", "KES", "GBP", "EUR", "JPY"].includes(sym)) continue;
      const bal = round(w.assets[sym] || 0);
      if (bal <= 0 && sym !== "LMT") continue;
      const p = priceUsdPerToken(sym);
      const val = roundMoney(bal * p, 6);
      portfolioUsd += val;
      const meta = reg[sym] || { name: sym };
      portfolio.push({
        symbol: sym,
        emoji: meta.emoji || (sym === "LMT" ? "💎" : ""),
        name: meta.name || sym,
        balance: bal,
        priceUsd: p,
        valueUsd: val,
        valueKes: roundMoney(val * FX.USD, 4)
      });
    }
    return {
      name: NAME,
      symbol: SYMBOL,
      emoji: EMOJI,
      address: w.address,
      balance: round(w.assets.LMT || 0),
      assets: w.assets,
      portfolio,
      portfolioUsd: roundMoney(portfolioUsd, 6),
      portfolioKes: roundMoney(portfolioUsd * FX.USD, 4),
      tokens: listTokens(),
      maxSupply: MAX_SUPPLY,
      minSend: MIN_SEND,
      maxSend: MAX_SEND,
      decimals: DECIMALS,
      totalSent: round(w.totalSent || 0),
      totalReceived: round(w.totalReceived || 0),
      historyCount: (w.history || []).length,
      priceUsdPerLmt: px,
      valueUsd: usdVal,
      valueKes: roundMoney(usdVal * FX.USD, 4),
      locked: isLocked(),
      heldLmt: round((load().heldLmt) || 0),
      passwordSet: !!(loadAuth() && loadAuth().hash),
      note: "Kanairoex system multi-token economy. Transfer between users with pay / p2p pay. Create with `create token …`. Buy: `buy lmt …`. Withdraw USDT (min 100): `withdraw usdt …`."
    };
  }

  function history(limit = 20) {
    const w = load();
    return (w.history || []).slice().reverse().slice(0, limit);
  }

  function addHistory(w, entry) {
    w.history = w.history || [];
    w.history.push(entry);
    if (w.history.length > 300) w.history = w.history.slice(-300);
  }

  function isValidAddress(addr) {
    return /^LMT-[A-Z0-9]{6,16}$/i.test(String(addr || "").trim());
  }

  function normalizeAddress(addr) {
    return String(addr || "").trim().toUpperCase();
  }

  function canSend(amount, toAddress, symbol) {
    requireUnlocked();
    const sym = String(symbol || "LMT").toUpperCase();
    const meta = getTokenMeta(sym);
    if (!meta) {
      return { ok: false, reason: "Unknown token `" + sym + "`. Create it first: `create token " + sym + " Name 1000000`" };
    }
    if (!meta.transferable) {
      return { ok: false, reason: "Token " + sym + " is not transferable" };
    }
    const a = round(amount);
    if (!(a >= MIN_SEND && a <= MAX_SEND)) {
      return {
        ok: false,
        reason: "Amount must be between " + MIN_SEND + " and " + MAX_SEND + " " + sym
      };
    }
    if (!isValidAddress(toAddress)) {
      return {
        ok: false,
        reason:
          "Recipient wallet address required. Format: LMT-XXXXXXXX\n" +
          "Example: `pay 20 LMT-ABCD1234` · `pay 10 MYT LMT-ABCD1234` · `p2p pay 5 MYT LMT-ABCD1234`"
      };
    }
    const to = normalizeAddress(toAddress);
    const from = getAddress();
    if (to === from) {
      return { ok: false, reason: "Cannot send to your own wallet address." };
    }
    const bal = getAssetBalance(sym);
    if (a > bal) {
      return { ok: false, reason: "Insufficient balance (" + bal + " " + sym + ")" };
    }
    return { ok: true, amount: a, to: to, symbol: sym };
  }

  function createTransfer(amount, toAddress, note, symbol) {
    const check = canSend(amount, toAddress, symbol);
    if (!check.ok) throw new Error(check.reason);
    const w = load();
    return {
      type: "lmt-transfer", // kept for backward compatibility; symbol field carries asset
      symbol: check.symbol,
      amount: check.amount,
      from: w.address,
      to: check.to,
      note: note || "",
      txId: "tx-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      ts: Date.now(),
      verified: true,
      priceUsd: priceUsdPerToken(check.symbol),
      tokenName: (getTokenMeta(check.symbol) || {}).name || check.symbol,
      emoji: (getTokenMeta(check.symbol) || {}).emoji || (check.symbol === "LMT" ? EMOJI : ""),
      maxSupply: (getTokenMeta(check.symbol) || {}).maxSupply || null,
      creator: (getTokenMeta(check.symbol) || {}).creator || null
    };
  }

  function loadOutbox() {
    try {
      const raw = localStorage.getItem(OUTBOX_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveOutbox(list) {
    try {
      localStorage.setItem(OUTBOX_KEY, JSON.stringify(list.slice(-100)));
    } catch (e) {}
  }

  function queueOutgoing(tx) {
    const list = loadOutbox();
    list.push({ ...tx, queuedAt: Date.now(), status: "queued" });
    saveOutbox(list);
  }

  /** Try to flush outbox over open P2P channel. Also retries on online event. */
  function flushOutbox() {
    const list = loadOutbox();
    if (!list.length) return { sent: 0, remaining: 0, reason: "empty" };
    if (typeof WebRTCPeer === "undefined") {
      return { sent: 0, remaining: list.length, reason: "WebRTCPeer not loaded" };
    }
    if (WebRTCPeer.channelState() !== "open") {
      return { sent: 0, remaining: list.length, reason: "channel not open (" + WebRTCPeer.channelState() + ")" };
    }
    const kept = [];
    let sent = 0;
    for (const item of list) {
      try {
        // mark attempt
        item.attempts = (item.attempts || 0) + 1;
        item.lastAttempt = Date.now();
        WebRTCPeer.send(item);
        sent++;
      } catch (e) {
        item.lastError = e.message || String(e);
        kept.push(item);
      }
    }
    saveOutbox(kept);
    return { sent, remaining: kept.length, reason: sent ? "ok" : "send errors" };
  }

  async function send(amount, toAddress, note, viaP2P, symbol) {
    requireUnlocked();
    let tx = createTransfer(amount, toAddress, note, symbol);
    // Sign P2P token transfers with the device DID when available.
    if (typeof Identity !== "undefined" && Identity.attachProof) {
      try {
        await Identity.ensure();
        tx = await Identity.attachProof(tx);
      } catch (e) {
        if (viaP2P) throw new Error("Cannot sign P2P transfer: " + (e.message || e));
      }
    }
    await withLock(function () {
      const w = load();
      const sym = tx.symbol;
      ensureAsset(w, sym);
      const bal = w.assets[sym] || 0;
      if (tx.amount > bal) throw new Error("Insufficient balance (" + bal + " " + sym + ")");
      w.assets[sym] = round(bal - tx.amount);
      if (sym === "LMT") {
        w.balance = w.assets.LMT;
        w.totalSent = round((w.totalSent || 0) + tx.amount);
      }
      addHistory(w, {
        id: tx.txId,
        type: viaP2P ? "send-p2p" : "send",
        amount: tx.amount,
        asset: sym,
        to: tx.to,
        note: tx.note,
        ts: tx.ts,
        verified: true,
        priceUsd: tx.priceUsd
      });
      appendLedger({
        kind: "transfer-out",
        asset: sym,
        amount: tx.amount,
        from: w.address,
        to: tx.to,
        txId: tx.txId,
        viaP2P: !!viaP2P
      });
      save(w);
    });

    // Mirror into KanairoexToken lab if present
    try {
      if (typeof KanairoexToken !== "undefined" && KanairoexToken.transfer) {
        KanairoexToken.transfer(tx.symbol, tx.from, tx.to, tx.amount);
      }
    } catch (e) { /* ignore lab sync errors */ }

    if (viaP2P) {
      const open = typeof WebRTCPeer !== "undefined" && WebRTCPeer.channelState() === "open";
      if (open) {
        try {
          WebRTCPeer.send(tx);
          // also try immediate flush of any older queued items
          flushOutbox();
        } catch (e) {
          queueOutgoing(tx);
          const w2 = load();
          addHistory(w2, {
            id: tx.txId + "-queued",
            type: "queued",
            amount: tx.amount,
            to: tx.to,
            note: "P2P send failed — queued for retry: " + (e.message || e),
            ts: Date.now()
          });
          save(w2);
        }
      } else {
        queueOutgoing(tx);
        const w2 = load();
        addHistory(w2, {
          id: tx.txId + "-queued",
          type: "queued",
          amount: tx.amount,
          to: tx.to,
          note: "P2P channel not open — tx queued. Run `webrtc offer`/`webrtc answer` then `flush outbox`. Auto-sends when channel opens.",
          ts: Date.now()
        });
        save(w2);
      }
    }
    return tx;
  }

  /**
   * Secure P2P receive path. Signed transfers are verified before any balance
   * mutation. Legacy unsigned transfers are rejected by this async path.
   */
  async function receiveAsync(tx) {
    if (!tx || (tx.type !== "lmt-transfer" && tx.type !== "token-transfer")) {
      return { ok: false, reason: "Not a token transfer" };
    }
    if (typeof Identity === "undefined" || !Identity.verifyObject) {
      return { ok: false, reason: "Identity verification unavailable" };
    }
    const verified = await Identity.verifyObject(tx);
    if (!verified.ok) return { ok: false, reason: "Invalid transfer signature: " + verified.reason };
    return receive(tx, { verifiedProof: true });
  }

  function receive(tx, opts) {
    return withLock(function () {
    opts = opts || {};
    if (!tx || (tx.type !== "lmt-transfer" && tx.type !== "token-transfer")) {
      return { ok: false, reason: "Not a token transfer" };
    }
    const sym = String(tx.symbol || "LMT").toUpperCase();
    if (sym !== "LMT" && !/^[A-Z][A-Z0-9]{1,7}$/.test(sym)) {
      return { ok: false, reason: "Invalid token symbol" };
    }
    // Auto-register unknown inbound tokens, but sanitize peer-supplied metadata.
    let meta = getTokenMeta(sym);
    if (!meta) {
      if (sym === "LMT") {
        meta = defaultRegistry().LMT;
      } else {
        const remoteEmoji = String(tx.emoji || "").trim();
        if (!isEmojiSymbol(remoteEmoji) || remoteEmoji === EMOJI) {
          return { ok: false, reason: "Unknown token requires a valid non-reserved emoji symbol" };
        }
        const reg = loadRegistry();
        meta = {
          symbol: sym,
          emoji: remoteEmoji,
          name: String(tx.tokenName || sym).trim().slice(0, 48) || sym,
          maxSupply: Number.isFinite(Number(tx.maxSupply)) && Number(tx.maxSupply) > 0 ? Number(tx.maxSupply) : 1e15,
          decimals: DECIMALS,
          baseUsd: Number.isFinite(Number(tx.priceUsd)) && Number(tx.priceUsd) >= 0 ? Number(tx.priceUsd) : 0.0001,
          dailyGrowth: 0.0003,
          createdAt: Date.now(),
          creator: tx.creator || tx.from || "peer",
          transferable: true,
          receivedFromPeer: true
        };
        reg[sym] = meta;
        saveRegistry(reg);
      }
    }
    const amount = round(tx.amount);
    if (!(amount >= MIN_SEND && amount <= MAX_SEND)) {
      return { ok: false, reason: "Invalid amount" };
    }
    const w = load();
    const myAddr = normalizeAddress(w.address);
    const dest = normalizeAddress(tx.to);
    if (!isValidAddress(dest) || dest !== myAddr) {
      return {
        ok: false,
        reason: "Transfer not for this wallet (to=" + (tx.to || "?") + ", mine=" + w.address + ")"
      };
    }
    if ((w.history || []).some((h) => h.id === tx.txId)) {
      return { ok: false, reason: "Already received" };
    }
    if (!tx.txId || !tx.from || !tx.ts) {
      return { ok: false, reason: "Failed verification: missing fields" };
    }
    ensureAsset(w, sym);
    w.assets[sym] = round((w.assets[sym] || 0) + amount);
    if (sym === "LMT") {
      if (w.assets.LMT > MAX_SUPPLY) w.assets.LMT = MAX_SUPPLY;
      w.balance = w.assets.LMT;
      w.totalReceived = round((w.totalReceived || 0) + amount);
      // Receives are transfers (not new issuance against the global 33B cap)
    }
    addHistory(w, {
      id: tx.txId,
      type: "receive",
      amount: amount,
      asset: sym,
      from: tx.from || "peer",
      note: tx.note || "",
      ts: tx.ts || Date.now(),
      verified: true,
      priceUsd: tx.priceUsd || priceUsdPerToken(sym)
    });
    appendLedger({
      kind: "transfer-in",
      asset: sym,
      amount: amount,
      from: tx.from || "peer",
      to: w.address,
      txId: tx.txId,
      verified: true
    });
    save(w);
    // Mirror lab
    try {
      if (typeof KanairoexToken !== "undefined") {
        if (!KanairoexToken.status().tokens[sym] && KanairoexToken.createSymbol) {
          KanairoexToken.createSymbol(sym, meta.name, 0, "Received via P2P " + (meta.emoji || "🪙"), meta.emoji || "🪙");
        }
        if (KanairoexToken.mint) KanairoexToken.mint(sym, w.address, amount);
      }
    } catch (e) {}
    return { ok: true, amount, symbol: sym, balance: w.assets[sym], verified: true };
    }); // end withLock
  }

  /** Credit LMT from confirmed USDT purchase (online buy flow) */

  /** Escrow LMT for a USDT withdrawal request (cannot spend while held). */
  function holdLmtForWithdraw(amount, meta) {
    requireUnlocked();
    meta = meta || {};
    const a = round(Math.max(0, Number(amount) || 0));
    if (!(a > 0)) throw new Error("Invalid hold amount");
    const w = load();
    ensureAsset(w, "LMT");
    const avail = round(w.assets.LMT || 0);
    if (a > avail) throw new Error("Insufficient LMT (available " + avail + ", need " + a + ")");
    w.assets.LMT = round(avail - a);
    w.balance = w.assets.LMT;
    w.heldLmt = round((w.heldLmt || 0) + a);
    w.holds = w.holds || {};
    const hid = meta.holdId || ("hold_" + Date.now());
    w.holds[hid] = {
      amount: a,
      type: "usdt-withdraw",
      orderId: meta.orderId || null,
      network: meta.network || null,
      externalAddress: meta.externalAddress || null,
      ts: Date.now()
    };
    addHistory(w, {
      id: "tx-hold-" + Date.now(),
      type: "withdraw-hold",
      amount: a,
      asset: "LMT",
      holdId: hid,
      orderId: meta.orderId || null,
      note: "Held for USDT withdraw (" + (meta.network || "") + ")",
      ts: Date.now()
    });
    save(w);
    return { ok: true, holdId: hid, amount: a, available: w.assets.LMT, held: w.heldLmt };
  }

  /** Cancel hold — return LMT to spendable balance */
  function releaseHoldToUser(holdId) {
    requireUnlocked();
    const w = load();
    w.holds = w.holds || {};
    const h = w.holds[holdId];
    if (!h) throw new Error("Hold not found: " + holdId);
    const a = round(h.amount || 0);
    ensureAsset(w, "LMT");
    w.assets.LMT = round((w.assets.LMT || 0) + a);
    w.balance = w.assets.LMT;
    w.heldLmt = round(Math.max(0, (w.heldLmt || 0) - a));
    delete w.holds[holdId];
    addHistory(w, {
      id: "tx-hold-release-" + Date.now(),
      type: "withdraw-hold-release",
      amount: a,
      asset: "LMT",
      holdId: holdId,
      note: "Withdraw cancelled — LMT returned",
      ts: Date.now()
    });
    save(w);
    return { ok: true, amount: a, available: w.assets.LMT, held: w.heldLmt };
  }

  /** Complete withdraw — held LMT leaves user and returns to system (burn from escrow) */
  function completeHoldToSystem(holdId, meta) {
    meta = meta || {};
    const w = load();
    w.holds = w.holds || {};
    const h = w.holds[holdId];
    if (!h) throw new Error("Hold not found: " + holdId);
    const a = round(h.amount || 0);
    w.heldLmt = round(Math.max(0, (w.heldLmt || 0) - a));
    delete w.holds[holdId];
    w.totalWithdrawnLmt = round((w.totalWithdrawnLmt || 0) + a);
    addHistory(w, {
      id: "tx-withdraw-done-" + Date.now(),
      type: "usdt-withdraw-complete",
      amount: a,
      asset: "LMT",
      holdId: holdId,
      orderId: meta.orderId || h.orderId || null,
      note: "USDT paid — held LMT returned to system",
      ts: Date.now()
    });
    save(w);
    return { ok: true, amount: a, available: w.assets.LMT, held: w.heldLmt };
  }

  function getHeldLmt() {
    const w = load();
    return round(w.heldLmt || 0);
  }


  /** Debit spendable LMT for Money Market Fund deposit */
  function debitForMmf(amount, note) {
    requireUnlocked();
    const a = round(Math.max(0, Number(amount) || 0));
    if (!(a > 0)) throw new Error("Invalid MMF debit");
    const w = load();
    ensureAsset(w, "LMT");
    if ((w.assets.LMT || 0) < a) throw new Error("Insufficient LMT for MMF deposit");
    w.assets.LMT = round((w.assets.LMT || 0) - a);
    w.balance = w.assets.LMT;
    w.mmfPrincipal = round((w.mmfPrincipal || 0) + a);
    addHistory(w, {
      id: "tx-mmf-in-" + Date.now(),
      type: "mmf-deposit",
      amount: a,
      asset: "LMT",
      note: note || "MMF deposit",
      ts: Date.now()
    });
    save(w);
    return { ok: true, amount: a, available: w.assets.LMT, mmfPrincipal: w.mmfPrincipal };
  }

  /** Credit LMT from MMF withdraw (principal and/or interest) */
  function creditForMmf(amount, note) {
    requireUnlocked();
    const a = round(Math.max(0, Number(amount) || 0));
    if (!(a > 0)) return { ok: true, amount: 0 };
    const w = load();
    ensureAsset(w, "LMT");
    w.assets.LMT = round((w.assets.LMT || 0) + a);
    w.balance = w.assets.LMT;
    // Reduce tracked principal if withdrawing (best-effort)
    if (/interest/i.test(String(note || ""))) {
      w.mmfInterestEarned = round((w.mmfInterestEarned || 0) + a);
    } else {
      w.mmfPrincipal = round(Math.max(0, (w.mmfPrincipal || 0) - a));
    }
    addHistory(w, {
      id: "tx-mmf-out-" + Date.now(),
      type: "mmf-withdraw",
      amount: a,
      asset: "LMT",
      note: note || "MMF withdraw",
      ts: Date.now()
    });
    save(w);
    return { ok: true, amount: a, available: w.assets.LMT };
  }

  function creditPurchase(amount, meta) {
    return withLock(function () {
      meta = meta || {};
      const a = round(Math.max(0, Number(amount) || 0));
      if (!(a > 0)) throw new Error("Invalid credit amount");
      const supply = checkSupplyHeadroom(a);
      if (!supply.ok) throw new Error(supply.reason);
      const w = load();
      w.assets = w.assets || {};
      w.assets.LMT = round((w.assets.LMT || 0) + a);
      if (w.assets.LMT > MAX_SUPPLY) w.assets.LMT = MAX_SUPPLY;
      w.balance = w.assets.LMT;
      w.totalReceived = round((w.totalReceived || 0) + a);
      w.issuedLmt = round((w.issuedLmt || 0) + a);
      const txId = "tx-usdt-buy-" + Date.now();
      addHistory(w, {
        id: txId,
        type: "usdt-purchase",
        amount: a,
        asset: "LMT",
        note: "USDT buy " + (meta.network || "") + " order " + (meta.orderId || "") + (meta.txId ? " tx " + meta.txId : ""),
        usdt: meta.usdt || null,
        network: meta.network || null,
        orderId: meta.orderId || null,
        txId: meta.txId || null,
        ts: Date.now()
      });
      appendLedger({
        kind: "mint",
        asset: "LMT",
        amount: a,
        to: w.address,
        reason: "usdt-purchase",
        txId: txId,
        orderId: meta.orderId || null
      });
      save(w);
      return { ok: true, amount: a, balance: w.balance, address: w.address, issued: w.issuedLmt };
    });
  }

  function faucet(amount) {
    return withLock(function () {
      requireUnlocked();
      const a = round(Math.min(amount || 1, 10)); // small test drip only; use USDT buy for real LMT
      const supply = checkSupplyHeadroom(a);
      if (!supply.ok) throw new Error(supply.reason);
      const w = load();
      w.assets.LMT = round((w.assets.LMT || 0) + a);
      if (w.assets.LMT > MAX_SUPPLY) w.assets.LMT = MAX_SUPPLY;
      w.balance = w.assets.LMT;
      w.issuedLmt = round((w.issuedLmt || 0) + a);
      const txId = "tx-faucet-" + Date.now();
      addHistory(w, {
        id: txId,
        type: "faucet",
        amount: a,
        asset: "LMT",
        note: "System faucet",
        ts: Date.now()
      });
      appendLedger({
        kind: "mint",
        asset: "LMT",
        amount: a,
        to: w.address,
        reason: "faucet",
        txId: txId
      });
      save(w);
      return w.balance;
    });
  }

  /**
   * Pay learning/question rewards from token pool fees (and a thin slice of pool LMT).
   * Create-fee LMT and swap fees seed pools; rewards drain feeLmt first, then tiny pool LMT.
   * Returns { paid, source } or null if debounced / nothing available.
   */
  function takeRewardFromPools(want) {
    want = round(Math.max(0, Number(want) || 0));
    if (!(want > 0)) return { paid: 0, source: "none" };
    const reg = loadRegistry();
    let remaining = want;
    let fromFees = 0;
    let fromPool = 0;
    const syms = Object.keys(reg).filter(function (s) { return s !== "LMT"; });

    // 1) Spend accrued feeLmt
    for (let i = 0; i < syms.length && remaining > 0; i++) {
      const meta = reg[syms[i]];
      const pool = ensurePool(meta);
      if (!(pool.feeLmt > 0)) continue;
      const take = Math.min(pool.feeLmt, remaining);
      pool.feeLmt = round(pool.feeLmt - take);
      remaining = round(remaining - take);
      fromFees = round(fromFees + take);
    }

    // 2) Thin slice of pool LMT (max 0.05% of each pool per claim, keep pool alive)
    for (let i = 0; i < syms.length && remaining > 0; i++) {
      const meta = reg[syms[i]];
      const pool = ensurePool(meta);
      if (!(pool.lmt > 10)) continue;
      const cap = Math.max(0, pool.lmt * 0.0005);
      const take = Math.min(cap, remaining, pool.lmt - 1);
      if (!(take > 0)) continue;
      pool.lmt = round(pool.lmt - take);
      remaining = round(remaining - take);
      fromPool = round(fromPool + take);
    }

    saveRegistry(reg);
    const paid = round(want - remaining);
    const source = fromFees > 0 && fromPool > 0 ? "pool-fees+liquidity" : (fromFees > 0 ? "pool-fees" : (fromPool > 0 ? "pool-liquidity" : "none"));
    return { paid: paid, source: source, fromFees: fromFees, fromPool: fromPool };
  }

  function creditReward(amount, type, note) {
    amount = round(amount);
    if (!(amount > 0)) return null;
    const w = load();
    ensureAsset(w, "LMT");
    w.assets.LMT = round((w.assets.LMT || 0) + amount);
    w.balance = w.assets.LMT;
    w.totalReceived = round((w.totalReceived || 0) + amount);
    if (type === "question-reward") {
      w.questionsRewarded = (w.questionsRewarded || 0) + 1;
      w.lastQuestionReward = Date.now();
    } else {
      w.learningRewarded = (w.learningRewarded || 0) + 1;
      w.lastLearningReward = Date.now();
    }
    addHistory(w, {
      id: "tx-" + type + "-" + Date.now(),
      type: type,
      amount: amount,
      asset: "LMT",
      note: note || type,
      ts: Date.now()
    });
    save(w);
    return amount;
  }

  /** Reward after a user question — funded by token pools when possible */
  function rewardQuestion() {
    try {
      const w = load();
      const last = w.lastQuestionReward || 0;
      if (Date.now() - last < 2000) return null;
      const pulled = takeRewardFromPools(QUESTION_REWARD);
      let paid = pulled.paid;
      let note = "Question reward from " + pulled.source;
      if (!(paid > 0)) {
        // No pool liquidity yet — tiny system drip so UX still works at launch
        paid = QUESTION_REWARD;
        note = "Question reward (system seed — create tokens to fund pools)";
      }
      creditReward(paid, "question-reward", note);
      return paid;
    } catch (_) {
      return null;
    }
  }

  /** Reward after teaching / learning — funded by token pools */
  function rewardLearning(kind) {
    try {
      const w = load();
      const last = w.lastLearningReward || 0;
      if (Date.now() - last < 1500) return null;
      const want = round(QUESTION_REWARD * 2); // teaching pays a bit more
      const pulled = takeRewardFromPools(want);
      let paid = pulled.paid;
      let note = "Learning reward (" + (kind || "teach") + ") from " + pulled.source;
      if (!(paid > 0)) {
        paid = want;
        note = "Learning reward (system seed — pools fund this after token creates/swaps)";
      }
      creditReward(paid, "learning-reward", note);
      return paid;
    } catch (_) {
      return null;
    }
  }


  function resetWallet() {
    localStorage.removeItem(STORAGE_KEY);
    return load();
  }

  function format(amount, symbol) {
    const sym = String(symbol || "LMT").toUpperCase();
    const label = displaySymbol(sym);
    return (
      round(amount).toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: DECIMALS
      }) +
      " " +
      label +
      (label === sym ? "" : " " + sym)
    );
  }

  /** Local explorer snapshot (this device only) */
  function explorer() {
    const w = load();
    const px = priceUsdPerLmt();
    return {
      network: "Kanairoex system ledger (device + P2P)",
      address: w.address,
      balanceLmt: round(w.assets.LMT || 0),
      assets: w.assets,
      priceUsdPerLmt: px,
      valueUsd: roundMoney((w.assets.LMT || 0) * px, 6),
      valueKes: roundMoney((w.assets.LMT || 0) * px * FX.USD, 4),
      txCount: (w.history || []).length,
      totalSent: round(w.totalSent || 0),
      totalReceived: round(w.totalReceived || 0),
      outbox: loadOutbox().length,
      recent: history(10),
      ledgerEntries: loadLedger().length,
      issuedLmt: round(w.issuedLmt || 0),
      maxSupply: MAX_SUPPLY,
      supplyHeadroom: Math.max(0, MAX_SUPPLY - round(w.issuedLmt || 0)),
      encryptedStorage: !!localStorage.getItem(WALLET_ENC_KEY),
      note: "Authoritative local ledger + global 33B supply enforcement (device-tracked issued). AES-GCM encrypted when password set."
    };
  }

  function getLedger(limit) {
    const n = Math.min(100, Math.max(1, Number(limit) || 20));
    return loadLedger().slice(-n);
  }

  function supplyStatus() {
    const w = load();
    const issued = round(w.issuedLmt || 0);
    return {
      maxSupply: MAX_SUPPLY,
      issued,
      headroom: Math.max(0, MAX_SUPPLY - issued),
      balance: round(w.assets && w.assets.LMT || 0),
      encrypted: !!localStorage.getItem(WALLET_ENC_KEY),
      sessionUnlocked: !isLocked()
    };
  }

  /** Export AES-GCM encrypted backup (password required) for another device */
  async function exportBackup(passwordDigits) {
    requireUnlocked();
    const grid = parseSolutionInput(passwordDigits || "");
    if (!grid) throw new Error("Provide your 16-digit password: export wallet 1 2 3 …");
    const sol = solutionString(grid);
    const hash = await sha256(sol);
    const auth = loadAuth();
    if (auth && auth.hash && hash !== auth.hash) throw new Error("Password mismatch");
    const w = load();
    const ledger = loadLedger();
    const inner = {
      v: 3,
      exported: Date.now(),
      wallet: w,
      ledger: ledger.slice(-500),
      authHash: auth ? auth.hash : null,
      maxSupply: MAX_SUPPLY,
      note: "Kanairoex authoritative ledger backup (AES-GCM)"
    };
    const enc = await aesEncrypt(JSON.stringify(inner), sol);
    const mixed = btoa(unescape(encodeURIComponent(JSON.stringify(enc))));
    return {
      backup: mixed,
      format: "Kanairoex Wallet Backup v3 (AES-GCM)",
      instructions:
        "Copy the backup string. On the other device: `import wallet <string> <16-digit password>` then unlock with the same Sudoku password."
    };
  }

  async function importBackup(b64, passwordDigits) {
    const grid = parseSolutionInput(passwordDigits || "");
    if (!grid) throw new Error("Provide password digits after the backup blob");
    const sol = solutionString(grid);
    const hash = await sha256(sol);
    let payload;
    try {
      const decoded = JSON.parse(decodeURIComponent(escape(atob(String(b64).trim()))));
      // v3 encrypted envelope
      if (decoded.ciphertext && decoded.salt) {
        const plain = await aesDecrypt(decoded, sol);
        payload = JSON.parse(plain);
      } else {
        // Legacy v2 base64 JSON
        payload = decoded;
      }
    } catch {
      throw new Error("Invalid backup data");
    }
    if (!payload || !payload.wallet || !payload.wallet.address) throw new Error("Corrupt backup");
    if (payload.authHash && payload.authHash !== hash) {
      throw new Error("Password does not match backup");
    }
    // Restore ledger if present
    if (Array.isArray(payload.ledger) && payload.ledger.length) {
      saveLedger(payload.ledger);
    }
    _sessionPassword = sol;
    sessionUnlockedUntil = Date.now() + SESSION_MS;
    save(payload.wallet);
    await persistEncryptedIfPossible(payload.wallet);
    if (payload.authHash) {
      saveAuth({ hash: payload.authHash, setAt: Date.now(), note: "Restored from encrypted backup", encrypted: true });
    }
    return { address: payload.wallet.address, balance: payload.wallet.assets?.LMT ?? payload.wallet.balance };
  }

  return {
    SYMBOL,
    EMOJI,
    NAME,
    MAX_SUPPLY,
    MIN_SEND,
    MAX_SEND,
    GENESIS,
    QUESTION_REWARD,
    FX,
    info,
    getBalance,
    getAddress,
    history,
    canSend,
    createTransfer,
    send,
    receive,
    receiveAsync,
    faucet,
    creditPurchase,
    debitForMmf,
    creditForMmf,
    holdLmtForWithdraw,
    releaseHoldToUser,
    completeHoldToSystem,
    getHeldLmt,
    rewardQuestion,
    rewardLearning,
    takeRewardFromPools,
    resetWallet,
    format,
    isValidAddress,
    normalizeAddress,
    isLocked,
    startSetPassword,
    startUnlock,
    submitSolve,
    lock,
    clearPassword,
    priceUsdPerLmt,
    priceUsdPerToken,
    convertLmtTo,
    exchangeLmt,
    explorer,
    flushOutbox,
    loadOutbox,
    exportBackup,
    importBackup,
    createToken,
    tokenCreationQuote,
    displaySymbol,
    isEmojiSymbol,
    extractEmojiFromText,
    tokenStats,
    allTokenStats,
    exportPools,
    mergePools,
    broadcastPools,
    syncPoolsOnline,
    setPoolSyncUrl,
    getPoolSyncUrl,
    priceInLmt,
    circulatingSupply,
    marketCapUsd,
    swap,
    addLiquidity,
    removeLiquidity,
    getLpBalance,
    CREATE_FEE_LMT,
    listTokens,
    getTokenMeta,
    getAssetBalance,
    getLedger,
    supplyStatus,
    checkSupplyHeadroom,
    withLock
  };
})();

if (typeof window !== "undefined") window.LMTWallet = LMTWallet;
