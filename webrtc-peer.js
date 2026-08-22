/**
 * Kanairoex WebRTC Peer — browser-to-browser data channel
 * Manual SDP signaling (copy/paste). Chat, files, LMT, profile share.
 *
 * ICE: STUN (discover public address) + TURN (relay when direct path fails).
 * TURN requires internet on both devices. Same LAN can work without TURN
 * (host candidates). True "airplane mode / no network" cannot link remote peers.
 */
const WebRTCPeer = (() => {
  'use strict';

  const ICE_KEY = 'localmind_ice_servers';
  const MODE_KEY = 'localmind_p2p_mode'; // auto | relay | local
  const CHAT_OUTBOX_KEY = 'localmind_p2p_chat_outbox_v1';
  const DEVICE_KEY = 'localmind_turn_device_id_v1';
  const TURN_CFG_KEY = 'localmind_turn_private_cfg_v1';
  const TURN_CACHE_KEY = 'localmind_turn_cred_cache_v1';
  const MAX_CHUNK = 14000;
  const ICE_WAIT_MS = 12000;
  const TURN_TTL_SEC = 24 * 3600;

  const DEFAULT_STUN = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' }
  ];

  /** Public demo TURN (shared). Personal TURN overrides when configured. */
  const PUBLIC_TURN_URLS = [
    'turn:openrelay.metered.ca:80',
    'turn:openrelay.metered.ca:443',
    'turns:openrelay.metered.ca:443',
    'turn:openrelay.metered.ca:443?transport=tcp'
  ];

  let pc = null;
  let channel = null;
  let role = null;
  let lastError = null;
  let iceServersUsed = null;
  let callbacks = {
    onOpen: null,
    onClose: null,
    onMessage: null,
    onFile: null,
    onStatus: null,
    onToken: null
  };

  function log() {
    if (typeof console !== 'undefined') {
      try {
        console.log.apply(console, ['[WebRTCPeer]'].concat([].slice.call(arguments)));
      } catch (_) {}
    }
  }

  function isOnline() {
    try {
      return typeof navigator === 'undefined' ? true : !!navigator.onLine;
    } catch (_) {
      return true;
    }
  }

  function getMode() {
    try {
      const m = localStorage.getItem(MODE_KEY);
      if (m === 'relay' || m === 'local' || m === 'auto') return m;
    } catch (_) {}
    return 'auto';
  }

  function setMode(mode) {
    const m = String(mode || 'auto').toLowerCase();
    if (m !== 'auto' && m !== 'relay' && m !== 'local') {
      throw new Error('Mode must be auto | relay | local');
    }
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch (_) {}
    return m;
  }

  /** Stable unique id for this browser profile (private TURN username base). */
  function getDeviceId() {
    try {
      let id = localStorage.getItem(DEVICE_KEY);
      if (id && /^[a-z0-9_-]{8,64}$/i.test(id)) return id;
      const rand = (typeof crypto !== 'undefined' && crypto.getRandomValues)
        ? Array.from(crypto.getRandomValues(new Uint8Array(12)), function (b) {
            return ('0' + b.toString(16)).slice(-2);
          }).join('')
        : String(Math.random()).slice(2) + String(Date.now());
      id = 'lm' + rand.slice(0, 20);
      localStorage.setItem(DEVICE_KEY, id);
      return id;
    } catch (_) {
      return 'lm' + String(Date.now());
    }
  }

  function getTurnConfig() {
    try {
      const raw = localStorage.getItem(TURN_CFG_KEY);
      if (raw) {
        const c = JSON.parse(raw);
        if (c && (c.host || c.urls)) return c;
      }
    } catch (_) {}
    return null;
  }

  /**
   * Configure private TURN for this deployment.
   * coturn with use-auth-secret + static-auth-secret = shared secret:
   *   each browser gets unique ephemeral username/password (TURN REST API).
   * cfg: { host, secret, urls?, ttl?, realm? }
   */
  function configurePrivateTurn(cfg) {
    if (!cfg || (!cfg.host && !cfg.urls)) {
      throw new Error('Need host or urls, e.g. configurePrivateTurn({ host: "turn.example.com", secret: "…" })');
    }
    const out = {
      host: String(cfg.host || '').replace(/^turns?:/i, '').split(':')[0] || '',
      secret: String(cfg.secret || ''),
      urls: cfg.urls || null,
      ttl: Number(cfg.ttl) > 60 ? Number(cfg.ttl) : TURN_TTL_SEC,
      realm: cfg.realm || 'localmind',
      updatedAt: Date.now()
    };
    if (!out.secret) {
      // No shared secret: still unique user/pass per browser (static long-term credentials style)
      out.secret = '';
      out.staticPerDevice = true;
    }
    try {
      localStorage.setItem(TURN_CFG_KEY, JSON.stringify(out));
      localStorage.removeItem(TURN_CACHE_KEY);
      localStorage.removeItem(ICE_KEY); // rebuild personal list
    } catch (e) {
      throw new Error('Could not save TURN config: ' + (e.message || e));
    }
    iceServersUsed = null;
    return out;
  }

  function clearPrivateTurn() {
    try {
      localStorage.removeItem(TURN_CFG_KEY);
      localStorage.removeItem(TURN_CACHE_KEY);
    } catch (_) {}
    iceServersUsed = null;
  }

  function b64fromBuf(buf) {
    const bytes = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }

  /** TURN REST API credentials: username = expiry:deviceId, password = base64(hmac-sha1(secret, username)) */
  async function makeEphemeralTurnCreds(deviceId, secret, ttlSec) {
    const ttl = ttlSec || TURN_TTL_SEC;
    const expiry = Math.floor(Date.now() / 1000) + ttl;
    const username = expiry + ':' + deviceId;
    if (!secret) {
      // Deterministic per-device static pair (for servers that accept user==device, pass==hash)
      return {
        username: deviceId,
        credential: deviceId + '-lm',
        expiresAt: expiry * 1000,
        method: 'static-device'
      };
    }
    if (typeof crypto === 'undefined' || !crypto.subtle) {
      return {
        username: username,
        credential: btoa(secret + username).slice(0, 22),
        expiresAt: expiry * 1000,
        method: 'fallback'
      };
    }
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(username));
    return {
      username: username,
      credential: b64fromBuf(sig),
      expiresAt: expiry * 1000,
      method: 'turn-rest'
    };
  }

  async function getPersonalTurnCredentials(forceRefresh) {
    const deviceId = getDeviceId();
    const cfg = getTurnConfig();
    try {
      if (!forceRefresh) {
        const cached = JSON.parse(localStorage.getItem(TURN_CACHE_KEY) || 'null');
        if (
          cached &&
          cached.deviceId === deviceId &&
          cached.expiresAt > Date.now() + 60000 &&
          cached.username &&
          cached.credential
        ) {
          return cached;
        }
      }
    } catch (_) {}

    const secret = cfg && cfg.secret ? cfg.secret : '';
    const ttl = cfg && cfg.ttl ? cfg.ttl : TURN_TTL_SEC;
    const creds = await makeEphemeralTurnCreds(deviceId, secret, ttl);
    const packed = Object.assign({ deviceId: deviceId }, creds);
    try {
      localStorage.setItem(TURN_CACHE_KEY, JSON.stringify(packed));
    } catch (_) {}
    return packed;
  }

  function turnUrlsFromConfig(cfg, deviceId) {
    if (cfg && Array.isArray(cfg.urls) && cfg.urls.length) return cfg.urls;
    if (cfg && cfg.host) {
      const h = cfg.host;
      return [
        'turn:' + h + ':3478',
        'turn:' + h + ':3478?transport=tcp',
        'turns:' + h + ':5349',
        'turn:' + h + ':443?transport=tcp'
      ];
    }
    // Public fallback — still tag username with device id where possible
    return PUBLIC_TURN_URLS.slice();
  }

  /**
   * Build ICE list unique to this browser:
   * STUN + TURN entries using this device's private credentials.
   */
  async function buildPersonalIceServers(forceRefresh) {
    const creds = await getPersonalTurnCredentials(forceRefresh);
    const cfg = getTurnConfig();
    const urls = turnUrlsFromConfig(cfg, creds.deviceId);
    const list = DEFAULT_STUN.slice();

    if (cfg && cfg.secret) {
      // True private TURN (coturn auth-secret): unique ephemeral creds
      for (let i = 0; i < urls.length; i++) {
        list.push({
          urls: urls[i],
          username: creds.username,
          credential: creds.credential
        });
      }
    } else if (cfg && cfg.host) {
      // Host set but no secret: unique static user/pass per device
      for (let i = 0; i < urls.length; i++) {
        list.push({
          urls: urls[i],
          username: creds.username,
          credential: creds.credential
        });
      }
    } else {
      // No private TURN configured: public openrelay + unique identity stamp in username field
      // (openrelay ignores custom user; identity still stored for status/debug)
      for (let i = 0; i < PUBLIC_TURN_URLS.length; i++) {
        list.push({
          urls: PUBLIC_TURN_URLS[i],
          username: 'openrelayproject',
          credential: 'openrelayproject'
        });
      }
    }
    return {
      iceServers: list,
      deviceId: creds.deviceId,
      turnUsername: creds.username,
      turnMethod: creds.method,
      expiresAt: creds.expiresAt,
      private: !!(cfg && (cfg.host || cfg.urls))
    };
  }

  function loadIceServers() {
    try {
      const raw = localStorage.getItem(ICE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) {
          iceServersUsed = parsed;
          return parsed;
        }
      }
    } catch (_) {}
    // Sync path: STUN + public TURN (personal async list applied in ensurePC/createOffer)
    const basic = DEFAULT_STUN.concat(
      PUBLIC_TURN_URLS.map(function (u) {
        return { urls: u, username: 'openrelayproject', credential: 'openrelayproject' };
      })
    );
    iceServersUsed = basic;
    return basic;
  }

  /** Async: refresh personal TURN credentials into ICE list before connecting. */
  async function prepareIceServers(forceRefresh) {
    try {
      const raw = localStorage.getItem(ICE_KEY);
      if (raw && !forceRefresh) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) {
          iceServersUsed = parsed;
          return parsed;
        }
      }
    } catch (_) {}
    const built = await buildPersonalIceServers(forceRefresh);
    iceServersUsed = built.iceServers;
    return built.iceServers;
  }

  function setIceServers(list) {
    if (!Array.isArray(list) || !list.length) {
      throw new Error('ICE servers must be a non-empty array');
    }
    try {
      localStorage.setItem(ICE_KEY, JSON.stringify(list));
    } catch (e) {
      throw new Error('Could not save ICE servers: ' + (e.message || e));
    }
    iceServersUsed = list;
    return list;
  }

  function clearIceOverride() {
    try {
      localStorage.removeItem(ICE_KEY);
    } catch (_) {}
    iceServersUsed = null;
    return loadIceServers();
  }

  function personalTurnStatus() {
    const cfg = getTurnConfig();
    let cache = null;
    try {
      cache = JSON.parse(localStorage.getItem(TURN_CACHE_KEY) || 'null');
    } catch (_) {}
    return {
      deviceId: getDeviceId(),
      privateConfigured: !!(cfg && (cfg.host || cfg.urls)),
      host: cfg && cfg.host ? cfg.host : null,
      hasSecret: !!(cfg && cfg.secret),
      turnUsername: cache && cache.username ? cache.username : null,
      method: cache && cache.method ? cache.method : null,
      expiresAt: cache && cache.expiresAt ? cache.expiresAt : null
    };
  }

  function pcConfig() {
    const servers = loadIceServers();
    const mode = getMode();
    const cfg = {
      iceServers: servers,
      iceCandidatePoolSize: 4
    };
    // relay = force TURN (needs online TURN)
    // local = prefer host only when offline / same LAN demos
    if (mode === 'relay') {
      cfg.iceTransportPolicy = 'relay';
    } else if (mode === 'local' || !isOnline()) {
      // When offline, still allow host/srflx; do not force relay (TURN unreachable)
      // Keep all candidates; TURN simply won't connect without net
    }
    return cfg;
  }

  function notifyStatus() {
    if (typeof callbacks.onStatus === 'function') {
      try {
        callbacks.onStatus(status());
      } catch (e) {}
    }
  }

  function ensurePC() {
    if (pc) return pc;
    if (typeof RTCPeerConnection === 'undefined') {
      throw new Error('WebRTC not supported in this browser');
    }
    // Prefer latest personal ICE list
    if (!iceServersUsed) loadIceServers();
    const cfg = pcConfig();
    pc = new RTCPeerConnection(cfg);
    log('RTCPeerConnection', 'mode=' + getMode(), 'iceServers=' + (cfg.iceServers || []).length, 'online=' + isOnline());

    pc.onicecandidate = function (ev) {
      if (!ev.candidate) log('ICE gathering complete');
    };
    pc.onconnectionstatechange = function () {
      log('connectionState', pc.connectionState);
      if (
        pc.connectionState === 'failed' ||
        pc.connectionState === 'disconnected' ||
        pc.connectionState === 'closed'
      ) {
        lastError = pc.connectionState;
      }
      if (pc.connectionState === 'connected') lastError = null;
      notifyStatus();
    };
    pc.oniceconnectionstatechange = function () {
      log('iceConnectionState', pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed') {
        lastError = 'ice-failed';
      }
      notifyStatus();
    };
    pc.onicegatheringstatechange = function () {
      log('iceGatheringState', pc.iceGatheringState);
    };
    pc.ondatachannel = function (ev) {
      log('incoming datachannel', ev.channel && ev.channel.label);
      bindChannel(ev.channel);
    };
    return pc;
  }

  function loadChatOutbox() {
    try {
      return JSON.parse(localStorage.getItem(CHAT_OUTBOX_KEY) || '[]') || [];
    } catch (_) {
      return [];
    }
  }

  function saveChatOutbox(arr) {
    try {
      localStorage.setItem(CHAT_OUTBOX_KEY, JSON.stringify((arr || []).slice(-100)));
    } catch (_) {}
  }

  function flushChatOutbox() {
    if (channelState() !== 'open') return { sent: 0, remaining: loadChatOutbox().length };
    const q = loadChatOutbox();
    let sent = 0;
    const remain = [];
    for (let i = 0; i < q.length; i++) {
      try {
        channel.send(typeof q[i] === 'string' ? q[i] : JSON.stringify(q[i]));
        sent++;
      } catch (e) {
        remain.push(q[i]);
        remain.push.apply(remain, q.slice(i + 1));
        break;
      }
    }
    saveChatOutbox(remain);
    return { sent: sent, remaining: remain.length };
  }

  function bindChannel(ch) {
    channel = ch;
    channel.binaryType = 'arraybuffer';
    channel.onopen = function () {
      log('data channel open');
      lastError = null;
      notifyStatus();
      try {
        flushChatOutbox();
      } catch (e) {
        log('chat outbox', e);
      }
      if (typeof LMTWallet !== 'undefined' && LMTWallet.flushOutbox) {
        try {
          log('auto-flush outbox', LMTWallet.flushOutbox());
        } catch (e) {
          log('flush error', e);
        }
      }
      if (typeof MemoryNode !== 'undefined' && MemoryNode.onChannelOpen) {
        try {
          MemoryNode.onChannelOpen();
        } catch (e) {
          log('memory-node share', e);
        }
      } else if (typeof LMTWallet !== 'undefined' && LMTWallet.broadcastPools) {
        try {
          LMTWallet.broadcastPools();
        } catch (e) {}
      }
      // Auto-introduce
      try {
        if (typeof Profile !== 'undefined' && Profile.snapshot) {
          Profile.snapshot(true)
            .then(function (snap) {
              try {
                if (channel && channel.readyState === 'open') {
                  channel.send(
                    JSON.stringify({
                      type: 'hello',
                      name: snap.name || '',
                      address: snap.address || '',
                      bio: snap.bio || '',
                      did: (typeof Identity !== 'undefined' && Identity.getDid) ? Identity.getDid() : null
                    })
                  );
                  if (snap && snap.type === 'profile-share') {
                    channel.send(JSON.stringify(snap));
                  }
                }
              } catch (e) {
                log('auto profile share', e);
              }
            })
            .catch(function () {});
        } else if (typeof LMTWallet !== 'undefined' && LMTWallet.getAddress) {
          try {
            channel.send(JSON.stringify({ type: 'hello', address: LMTWallet.getAddress() }));
          } catch (e) {}
        }
      } catch (e) {
        log('hello', e);
      }
      if (typeof callbacks.onOpen === 'function') {
        try {
          callbacks.onOpen();
        } catch (e) {}
      }
    };
    channel.onclose = function () {
      log('data channel closed');
      notifyStatus();
      if (typeof callbacks.onClose === 'function') {
        try {
          callbacks.onClose();
        } catch (e) {}
      }
    };
    channel.onerror = function (e) {
      lastError = (e && e.message) || 'channel error';
      log('channel error', lastError);
      notifyStatus();
    };
    channel.onmessage = function (ev) {
      handleIncoming(ev.data);
    };
  }

  function handleIncoming(data) {
    try {
      let msg;
      if (typeof data === 'string') {
        msg = JSON.parse(data);
      } else if (data instanceof ArrayBuffer) {
        msg = { type: 'binary', buffer: data };
      } else {
        msg = data;
      }

      if (msg && (msg.type === 'dwn-record' || msg.protocol)) {
        if (typeof DWN !== 'undefined' && DWN.ingestRemote) {
          DWN.ingestRemote(msg).then(function (ing) {
            if (typeof callbacks.onMessage === 'function') {
              callbacks.onMessage(msg, { dwn: true, verify: ing.verify, record: ing.record });
            }
          }).catch(function (e) {
            log('dwn ingest', e);
            if (typeof callbacks.onMessage === 'function') callbacks.onMessage(msg);
          });
          return;
        }
      }

      if (msg && msg.type === 'lmt-transfer') {
        if (typeof LMTWallet !== 'undefined' && LMTWallet.receive) {
          const receivePromise = LMTWallet.receiveAsync ? LMTWallet.receiveAsync(msg) : Promise.resolve(LMTWallet.receive(msg));
          receivePromise.then(function(res) {
            if (typeof DWN !== 'undefined' && DWN.writeTokenReceipt && res && res.ok) {
              try {
                DWN.writeTokenReceipt({
                  amount: msg.amount,
                  asset: msg.asset || 'LMT',
                  to: msg.to,
                  from: msg.from,
                  note: msg.note || 'p2p receive'
                });
              } catch (e) { log('dwn token', e); }
            }
            if (typeof callbacks.onMessage === 'function') callbacks.onMessage(msg, res);
          }).catch(function(e) {
            log('token receive', e);
            if (typeof callbacks.onMessage === 'function') callbacks.onMessage(msg, {ok:false, reason:e.message || String(e)});
          });
          return;
        }
      }

      if (msg && msg.type === 'profile-share') {
        try {
          if (typeof Profile !== 'undefined' && Profile.receiveShare) Profile.receiveShare(msg);
        } catch (e) {
          log('profile-share', e);
        }
        if (typeof callbacks.onMessage === 'function') callbacks.onMessage(msg);
        return;
      }

      if (msg && msg.type === 'file-meta') {
        window.__lmFileRx = {
          name: msg.name,
          size: msg.size,
          mime: msg.mime || 'application/octet-stream',
          chunks: [],
          received: 0
        };
        return;
      }

      if (msg && msg.type === 'file-chunk' && window.__lmFileRx) {
        const bin = Uint8Array.from(atob(msg.data), function (c) {
          return c.charCodeAt(0);
        });
        window.__lmFileRx.chunks.push(bin);
        window.__lmFileRx.received += bin.length;
        if (window.__lmFileRx.received >= window.__lmFileRx.size) {
          const total = new Uint8Array(window.__lmFileRx.size);
          let offset = 0;
          for (let i = 0; i < window.__lmFileRx.chunks.length; i++) {
            total.set(window.__lmFileRx.chunks[i], offset);
            offset += window.__lmFileRx.chunks[i].length;
          }
          const blob = new Blob([total], { type: window.__lmFileRx.mime });
          const blobUrl = URL.createObjectURL(blob);
          const info = {
            name: window.__lmFileRx.name,
            size: window.__lmFileRx.size,
            mime: window.__lmFileRx.mime,
            blob: blob,
            blobUrl: blobUrl,
            url: blobUrl
          };
          window.__lmFileRx = null;
          if (typeof callbacks.onFile === 'function') callbacks.onFile(info);
          if (typeof callbacks.onMessage === 'function') {
            callbacks.onMessage({ type: 'file-received', name: info.name, size: info.size, mime: info.mime, blobUrl: info.blobUrl }, { ok: true });
          }
        }
        return;
      }

      if (msg && msg.type === 'token' && typeof callbacks.onToken === 'function') {
        callbacks.onToken(msg);
        return;
      }

      if (typeof callbacks.onMessage === 'function') {
        callbacks.onMessage(msg);
      }
    } catch (e) {
      log('handleIncoming error', e);
      lastError = e.message || String(e);
    }
  }

  async function waitIceComplete(timeoutMs) {
    timeoutMs = timeoutMs || ICE_WAIT_MS;
    if (!pc) return;
    if (pc.iceGatheringState === 'complete') return;
    return new Promise(function (resolve) {
      const t = setTimeout(resolve, timeoutMs);
      function check() {
        if (pc.iceGatheringState === 'complete') {
          clearTimeout(t);
          pc.removeEventListener('icegatheringstatechange', check);
          resolve();
        }
      }
      pc.addEventListener('icegatheringstatechange', check);
      check();
    });
  }

  async function createOffer() {
    reset(false);
    role = 'offer';
    await prepareIceServers(false);
    const conn = ensurePC();
    const ch = conn.createDataChannel('localmind', {
      ordered: true,
      maxRetransmits: 30
    });
    bindChannel(ch);
    const offer = await conn.createOffer();
    await conn.setLocalDescription(offer);
    await waitIceComplete();
    const sdp = JSON.stringify(conn.localDescription);
    notifyStatus();
    return sdp;
  }

  async function acceptAnswer(sdpJson) {
    if (!pc || role !== 'offer') {
      throw new Error('Call createOffer / p2p offer first, then accept the remote answer.');
    }
    const desc = typeof sdpJson === 'string' ? JSON.parse(sdpJson) : sdpJson;
    await pc.setRemoteDescription(desc);
    notifyStatus();
    return true;
  }

  async function acceptOffer(sdpJson) {
    reset(false);
    role = 'answer';
    await prepareIceServers(false);
    const conn = ensurePC();
    const desc = typeof sdpJson === 'string' ? JSON.parse(sdpJson) : sdpJson;
    await conn.setRemoteDescription(desc);
    const answer = await conn.createAnswer();
    await conn.setLocalDescription(answer);
    await waitIceComplete();
    const sdp = JSON.stringify(conn.localDescription);
    notifyStatus();
    return sdp;
  }

  function channelState() {
    if (!channel) return 'none';
    return channel.readyState;
  }

  function send(obj) {
    if (!channel || channel.readyState !== 'open') {
      throw new Error('Data channel not open. Finish p2p offer / answer first. Check `p2p status`.');
    }
    const payload = typeof obj === 'string' ? obj : JSON.stringify(obj);
    channel.send(payload);
    return true;
  }

  /**
   * Chat helper: send immediately or queue if channel not open.
   * queueIfOffline=true stores message for flush when channel opens.
   */
  function sendChat(text, opts) {
    opts = opts || {};
    // Prefer DID/DWN signed path when available
    if (typeof DWN !== 'undefined' && DWN.sendChatOverP2P && channelState() === 'open') {
      // fire and forget async
      DWN.sendChatOverP2P(text).catch(function (e) { log('dwn chat', e); });
      return { ok: true, queued: false, dwn: true };
    }
    const msg = {
      type: 'chat',
      text: String(text || '').slice(0, 8000),
      ts: Date.now(),
      from:
        (typeof Profile !== 'undefined' && Profile.getName && Profile.getName()) ||
        (typeof LMTWallet !== 'undefined' && LMTWallet.getAddress && LMTWallet.getAddress()) ||
        '',
      fromDid: (typeof Identity !== 'undefined' && Identity.getDid && Identity.getDid()) || null
    };
    if (channelState() === 'open') {
      send(msg);
      return { ok: true, queued: false };
    }
    if (opts.queue !== false) {
      const q = loadChatOutbox();
      q.push(msg);
      saveChatOutbox(q);
      return { ok: true, queued: true, queueSize: q.length };
    }
    throw new Error('Channel not open. Run p2p setup first, or use queue.');
  }

  async function sendFile(file) {
    if (!channel || channel.readyState !== 'open') {
      throw new Error('Data channel not open.');
    }
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    send({
      type: 'file-meta',
      name: file.name,
      size: bytes.length,
      mime: file.type || 'application/octet-stream'
    });
    let offset = 0;
    while (offset < bytes.length) {
      const slice = bytes.subarray(offset, offset + MAX_CHUNK);
      let binary = '';
      for (let i = 0; i < slice.length; i++) binary += String.fromCharCode(slice[i]);
      send({ type: 'file-chunk', data: btoa(binary) });
      offset += slice.length;
    }
    const info = {
      name: file.name,
      size: bytes.length,
      mime: file.type || 'application/octet-stream',
      kind: (file.type || '').indexOf('image/') === 0 ? 'image'
        : (file.type || '').indexOf('video/') === 0 ? 'video' : 'file',
      isMedia: /^(image|video)\//i.test(file.type || '')
    };
    if (typeof DWN !== 'undefined' && DWN.writeFileMeta) {
      try {
        DWN.writeFileMeta(info).then(function (rec) {
          try {
            if (channel && channel.readyState === 'open' && typeof Identity !== 'undefined') {
              Identity.attachProof({
                type: 'dwn-record',
                recordId: rec.recordId,
                protocol: rec.protocol,
                protocolPath: rec.protocolPath,
                data: rec.data,
                author: rec.author,
                dateCreated: rec.dateCreated
              }).then(function (signed) {
                try { channel.send(JSON.stringify(signed)); } catch (e) {}
              });
            }
          } catch (e) {}
        });
      } catch (e) { log('dwn file meta', e); }
    }
    return info;
  }

  function countTurnServers(list) {
    return (list || []).filter(function (s) {
      const u = s && (s.urls || s.url);
      const arr = Array.isArray(u) ? u : [u];
      return arr.some(function (x) {
        return String(x || '').toLowerCase().indexOf('turn:') === 0 || String(x || '').toLowerCase().indexOf('turns:') === 0;
      });
    }).length;
  }

  function status() {
    const servers = iceServersUsed || loadIceServers();
    const turn = personalTurnStatus();
    return {
      supported: typeof RTCPeerConnection !== 'undefined',
      role: role,
      connectionState: pc ? pc.connectionState : 'none',
      iceConnectionState: pc ? pc.iceConnectionState : 'none',
      iceGatheringState: pc ? pc.iceGatheringState : 'none',
      channel: channelState(),
      lastError: lastError,
      hasPC: !!pc,
      online: isOnline(),
      mode: getMode(),
      iceServerCount: (servers || []).length,
      turnServerCount: countTurnServers(servers),
      chatOutbox: loadChatOutbox().length,
      deviceId: turn.deviceId,
      privateTurn: turn.privateConfigured,
      turnHost: turn.host,
      turnUsername: turn.turnUsername,
      turnMethod: turn.method
    };
  }

  function getRole() {
    return role;
  }

  function getSetupGuide() {
    const st = status();
    return (
      '**P2P / WebRTC chat setup**\n\n' +
      '**ICE:** ' +
      st.iceServerCount +
      ' servers · **TURN:** ' +
      st.turnServerCount +
      ' · **Mode:** ' +
      st.mode +
      ' · **Net:** ' +
      (st.online ? 'online' : 'offline') +
      '\n\n' +
      '1. **A:** `p2p offer` → copy the JSON\n' +
      '2. **B:** `p2p answer ` + paste A’s JSON → copy answer\n' +
      '3. **A:** `p2p answer ` + paste B’s answer\n' +
      '4. Both: `p2p status` until channel is **open**\n' +
      '5. Chat: `p2p send Hello` or `p2p msg Hello`\n' +
      '6. Also: `p2p file` · `share profile` · `p2p pay 5 LMT-…`\n\n' +
      '**Modes** (`p2p mode auto|relay|local`):\n' +
      '• **auto** — STUN + TURN (default; works most places when online)\n' +
      '• **relay** — force TURN (strict NATs; needs internet)\n' +
      '• **local** — same Wi‑Fi / LAN friendly\n\n' +
      '**Custom TURN** (both devices, then reload):\n' +
      '```js\n' +
      'localStorage.setItem("localmind_ice_servers", JSON.stringify([\n' +
      '  { urls: "stun:stun.l.google.com:19302" },\n' +
      '  { urls: "turn:YOUR.TURN:3478", username: "u", credential: "p" }\n' +
      ']));\n' +
      '```\n' +
      '`p2p ice reset` restores defaults.\n\n' +
      '**Offline note:** Without any network, two distant phones cannot connect. ' +
      'Same LAN with Wi‑Fi (even no internet) can still work. TURN needs internet.'
    );
  }

  function setCallbacks(cb) {
    callbacks = Object.assign(callbacks, cb || {});
  }

  function reset(full) {
    if (full === undefined) full = true;
    try {
      if (channel) {
        channel.onopen = channel.onclose = channel.onerror = channel.onmessage = null;
        try {
          channel.close();
        } catch (e) {}
      }
      if (pc) {
        pc.onicecandidate = pc.onconnectionstatechange = pc.ondatachannel = null;
        try {
          pc.close();
        } catch (e) {}
      }
    } catch (e) {}
    channel = null;
    pc = null;
    if (full) {
      role = null;
      lastError = null;
    }
    notifyStatus();
  }

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    setInterval(function () {
      if (channelState() === 'open') {
        try {
          flushChatOutbox();
        } catch (e) {}
        if (typeof LMTWallet !== 'undefined' && LMTWallet.flushOutbox) {
          try {
            const r = LMTWallet.flushOutbox();
            if (r && r.sent > 0) log('periodic flush sent', r.sent);
          } catch (e) {}
        }
      }
    }, 4000);

    window.addEventListener('online', function () {
      log('browser online');
      if (channelState() === 'open') {
        try {
          flushChatOutbox();
        } catch (e) {}
        if (typeof LMTWallet !== 'undefined' && LMTWallet.flushOutbox) {
          try {
            LMTWallet.flushOutbox();
          } catch (e) {}
        }
      }
      notifyStatus();
    });
    window.addEventListener('offline', function () {
      log('browser offline');
      notifyStatus();
    });
  }

  return {
    createOffer: createOffer,
    acceptAnswer: acceptAnswer,
    acceptOffer: acceptOffer,
    send: send,
    sendChat: sendChat,
    sendFile: sendFile,
    channelState: channelState,
    status: status,
    getRole: getRole,
    getSetupGuide: getSetupGuide,
    setCallbacks: setCallbacks,
    reset: reset,
    close: function () {
      reset(true);
    },
    loadIceServers: loadIceServers,
    prepareIceServers: prepareIceServers,
    setIceServers: setIceServers,
    clearIceOverride: clearIceOverride,
    getMode: getMode,
    setMode: setMode,
    flushChatOutbox: flushChatOutbox,
    getDeviceId: getDeviceId,
    configurePrivateTurn: configurePrivateTurn,
    clearPrivateTurn: clearPrivateTurn,
    getTurnConfig: getTurnConfig,
    personalTurnStatus: personalTurnStatus,
    buildPersonalIceServers: buildPersonalIceServers,
    getPersonalTurnCredentials: getPersonalTurnCredentials,
    DEFAULT_STUN: DEFAULT_STUN
  };
})();

if (typeof window !== 'undefined') window.WebRTCPeer = WebRTCPeer;
