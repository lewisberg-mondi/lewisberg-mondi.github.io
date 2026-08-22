/**
 * User profile — name, bio, avatar image, intro video.
 * Name lives in localStorage; media prefers IndexedDB (via IDBStore meta),
 * with a localStorage fallback for small images.
 * Profiles can be shared over WebRTC P2P.
 */
const Profile = (() => {
  const KEY = "localmind_profile_v2";
  const LEGACY_NAME = "localmind_profile_name";
  const AVATAR_META = "profile_avatar";
  const VIDEO_META = "profile_video";
  const PEERS_KEY = "localmind_peer_profiles_v1";
  const MAX_AVATAR_CHARS = 900000;
  const MAX_VIDEO_CHARS = 4500000;

  function loadMeta() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    try {
      const n = localStorage.getItem(LEGACY_NAME);
      if (n) {
        const m = { name: n, bio: "", hasAvatar: false, hasVideo: false, updatedAt: Date.now() };
        saveMeta(m);
        return m;
      }
    } catch (_) {}
    return { name: "", bio: "", hasAvatar: false, hasVideo: false, avatarMime: "", videoMime: "", updatedAt: 0 };
  }

  function saveMeta(m) {
    try {
      localStorage.setItem(KEY, JSON.stringify(m));
      if (m.name) localStorage.setItem(LEGACY_NAME, m.name);
    } catch (_) {}
  }

  function getName() {
    return loadMeta().name || "";
  }

  function setName(n) {
    const name = String(n || "").trim().slice(0, 40);
    const m = loadMeta();
    m.name = name;
    m.updatedAt = Date.now();
    saveMeta(m);
    return name;
  }

  function getBio() {
    return loadMeta().bio || "";
  }

  function setBio(text) {
    const m = loadMeta();
    m.bio = String(text || "").trim().slice(0, 280);
    m.updatedAt = Date.now();
    saveMeta(m);
    return m.bio;
  }

  function detect(text) {
    const m = text.match(/^(?:my name is|i am|i'm|call me)\s+([A-Za-z][A-Za-z\s'-]{1,39})$/i);
    if (m) return m[1].trim();
    return null;
  }

  function address(prefix) {
    const n = getName();
    return n ? (prefix + n) : "";
  }

  async function idbSet(key, value) {
    if (typeof IDBStore !== "undefined" && IDBStore.setMeta) {
      try {
        await IDBStore.setMeta(key, value);
        return true;
      } catch (_) {}
    }
    return false;
  }

  async function idbGet(key) {
    if (typeof IDBStore !== "undefined" && IDBStore.getMeta) {
      try {
        return await IDBStore.getMeta(key);
      } catch (_) {}
    }
    return null;
  }

  async function idbDel(key) {
    if (typeof IDBStore !== "undefined" && IDBStore.setMeta) {
      try {
        await IDBStore.setMeta(key, null);
        return true;
      } catch (_) {}
    }
    return false;
  }

  function fileToAvatarDataUrl(file, maxSide, quality) {
    maxSide = maxSide || 512;
    quality = quality == null ? 0.82 : quality;
    return new Promise(function (resolve, reject) {
      if (!file || !file.type || !file.type.startsWith("image/")) {
        reject(new Error("Please choose an image file (JPG, PNG, WebP, …)."));
        return;
      }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = function () {
        try {
          let w = img.naturalWidth || img.width;
          let h = img.naturalHeight || img.height;
          const scale = Math.min(1, maxSide / Math.max(w, h));
          w = Math.max(1, Math.round(w * scale));
          h = Math.max(1, Math.round(h * scale));
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          let dataUrl = canvas.toDataURL("image/jpeg", quality);
          let q = quality;
          while (dataUrl.length > MAX_AVATAR_CHARS && q > 0.4) {
            q -= 0.1;
            dataUrl = canvas.toDataURL("image/jpeg", q);
          }
          URL.revokeObjectURL(url);
          if (dataUrl.length > MAX_AVATAR_CHARS) {
            reject(new Error("Image still too large after compression. Try a smaller photo."));
            return;
          }
          resolve({ dataUrl: dataUrl, mime: "image/jpeg", width: w, height: h });
        } catch (e) {
          URL.revokeObjectURL(url);
          reject(e);
        }
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("Could not read image."));
      };
      img.src = url;
    });
  }

  function fileToDataUrl(file, maxChars) {
    return new Promise(function (resolve, reject) {
      if (!file) {
        reject(new Error("No file"));
        return;
      }
      if (file.size > (maxChars || MAX_VIDEO_CHARS) * 0.75) {
        reject(new Error(
          "File is too large to store on-device in profile (" +
          Math.round(file.size / 1024) + " KB). Use a shorter clip or share via `p2p file`."
        ));
        return;
      }
      const reader = new FileReader();
      reader.onload = function () {
        const dataUrl = String(reader.result || "");
        if (dataUrl.length > (maxChars || MAX_VIDEO_CHARS)) {
          reject(new Error("Encoded media exceeds storage budget. Use a smaller file."));
          return;
        }
        resolve({ dataUrl: dataUrl, mime: file.type || "application/octet-stream", name: file.name, size: file.size });
      };
      reader.onerror = function () { reject(new Error("Could not read file.")); };
      reader.readAsDataURL(file);
    });
  }

  async function setAvatarFromFile(file) {
    const packed = await fileToAvatarDataUrl(file);
    const ok = await idbSet(AVATAR_META, {
      dataUrl: packed.dataUrl,
      mime: packed.mime,
      width: packed.width,
      height: packed.height,
      savedAt: Date.now()
    });
    if (!ok) {
      try {
        localStorage.setItem("localmind_profile_avatar_fallback", packed.dataUrl);
      } catch (e) {
        throw new Error("Could not store avatar (storage full). Clear site data or use a smaller image.");
      }
    }
    const m = loadMeta();
    m.hasAvatar = true;
    m.avatarMime = packed.mime;
    m.updatedAt = Date.now();
    saveMeta(m);
    return { ok: true, mime: packed.mime, width: packed.width, height: packed.height };
  }

  async function setVideoFromFile(file) {
    if (!file || !(file.type || "").startsWith("video/")) {
      throw new Error("Please choose a video file (MP4, WebM, …).");
    }
    const packed = await fileToDataUrl(file, MAX_VIDEO_CHARS);
    const ok = await idbSet(VIDEO_META, {
      dataUrl: packed.dataUrl,
      mime: packed.mime,
      name: packed.name,
      size: packed.size,
      savedAt: Date.now()
    });
    if (!ok) {
      throw new Error("IndexedDB unavailable — cannot store video profile media on this device.");
    }
    const m = loadMeta();
    m.hasVideo = true;
    m.videoMime = packed.mime;
    m.updatedAt = Date.now();
    saveMeta(m);
    return { ok: true, mime: packed.mime, size: packed.size, name: packed.name };
  }

  async function setAvatarFromDataUrl(dataUrl, meta) {
    meta = meta || {};
    if (!dataUrl || typeof dataUrl !== "string" || dataUrl.indexOf("data:") !== 0) {
      throw new Error("Invalid image data for profile photo.");
    }
    if (dataUrl.length > MAX_AVATAR_CHARS) {
      throw new Error("Image too large for profile photo. Use a smaller gallery image.");
    }
    const mime = meta.mime || (dataUrl.split(";")[0] || "").replace("data:", "") || "image/jpeg";
    const packed = {
      dataUrl: dataUrl,
      mime: mime,
      width: meta.width || 0,
      height: meta.height || 0,
      savedAt: Date.now()
    };
    const ok = await idbSet(AVATAR_META, packed);
    if (!ok) {
      try {
        localStorage.setItem("localmind_profile_avatar_fallback", dataUrl);
      } catch (e) {
        throw new Error("Could not store avatar (storage full).");
      }
    }
    const m = loadMeta();
    m.hasAvatar = true;
    m.avatarMime = mime;
    m.updatedAt = Date.now();
    saveMeta(m);
    return { ok: true, mime: mime, width: packed.width, height: packed.height };
  }

  async function setVideoFromDataUrl(dataUrl, meta) {
    meta = meta || {};
    if (!dataUrl || typeof dataUrl !== "string" || dataUrl.indexOf("data:") !== 0) {
      throw new Error("Invalid video data for profile video.");
    }
    if (dataUrl.length > MAX_VIDEO_CHARS) {
      throw new Error("Video too large for profile. Use a shorter gallery clip.");
    }
    const mime = meta.mime || "video/mp4";
    const ok = await idbSet(VIDEO_META, {
      dataUrl: dataUrl,
      mime: mime,
      name: meta.name || "profile-video",
      size: meta.size || Math.round((dataUrl.length * 3) / 4),
      savedAt: Date.now()
    });
    if (!ok) {
      throw new Error("IndexedDB unavailable — cannot store profile video.");
    }
    const m = loadMeta();
    m.hasVideo = true;
    m.videoMime = mime;
    m.updatedAt = Date.now();
    saveMeta(m);
    return { ok: true, mime: mime, name: meta.name || "profile-video", size: meta.size || 0 };
  }

  async function getAvatar() {
    const fromIdb = await idbGet(AVATAR_META);
    if (fromIdb && fromIdb.dataUrl) return fromIdb;
    try {
      const fb = localStorage.getItem("localmind_profile_avatar_fallback");
      if (fb) return { dataUrl: fb, mime: "image/jpeg" };
    } catch (_) {}
    return null;
  }

  async function getVideo() {
    const fromIdb = await idbGet(VIDEO_META);
    if (fromIdb && fromIdb.dataUrl) return fromIdb;
    return null;
  }

  async function clearAvatar() {
    await idbDel(AVATAR_META);
    try { localStorage.removeItem("localmind_profile_avatar_fallback"); } catch (_) {}
    const m = loadMeta();
    m.hasAvatar = false;
    m.avatarMime = "";
    m.updatedAt = Date.now();
    saveMeta(m);
  }

  async function clearVideo() {
    await idbDel(VIDEO_META);
    const m = loadMeta();
    m.hasVideo = false;
    m.videoMime = "";
    m.updatedAt = Date.now();
    saveMeta(m);
  }

  function walletAddress() {
    try {
      if (typeof LMTWallet !== "undefined" && LMTWallet.getAddress) return LMTWallet.getAddress();
      if (typeof LMTWallet !== "undefined" && LMTWallet.info) return LMTWallet.info().address;
    } catch (_) {}
    return "";
  }

  async function snapshot(includeAvatar) {
    const m = loadMeta();
    const out = {
      type: "profile-share",
      name: m.name || "",
      bio: m.bio || "",
      address: walletAddress(),
      hasAvatar: !!m.hasAvatar,
      hasVideo: !!m.hasVideo,
      avatarMime: m.avatarMime || "",
      videoMime: m.videoMime || "",
      updatedAt: m.updatedAt || Date.now(),
      app: "Kanairoex"
    };
    if (includeAvatar !== false && m.hasAvatar) {
      const av = await getAvatar();
      if (av && av.dataUrl && av.dataUrl.length < MAX_AVATAR_CHARS) {
        out.avatarDataUrl = av.dataUrl;
      }
    }
    return out;
  }

  async function summaryText() {
    const m = loadMeta();
    const lines = ["**Your profile**\n"];
    lines.push("• Name: **" + (m.name || "(not set — say `My name is …`)") + "**");
    lines.push("• Bio: " + (m.bio ? m.bio : "_(none — `set bio …`)_"));
    lines.push("• Photo: " + (m.hasAvatar ? "✅ saved (shown below)" : "❌ none — `set photo` or upload an image"));
    lines.push("• Video: " + (m.hasVideo ? "✅ saved (player below)" : "❌ none — `set video`"));
    const addr = walletAddress();
    if (addr) lines.push("• Wallet: `" + addr + "`");
    lines.push("\n**Commands:** `set bio …` · `set photo` · `set video` · `clear photo` · `clear video` · `share profile` / `p2p profile`");
    return lines.join("\n");
  }

  function loadPeers() {
    try {
      return JSON.parse(localStorage.getItem(PEERS_KEY) || "{}") || {};
    } catch (_) {
      return {};
    }
  }

  function savePeers(map) {
    try {
      localStorage.setItem(PEERS_KEY, JSON.stringify(map));
    } catch (_) {}
  }

  function savePeerProfile(snap) {
    if (!snap || typeof snap !== "object") return null;
    const key = snap.address || snap.name || ("peer-" + Date.now());
    const map = loadPeers();
    map[key] = {
      name: snap.name || "",
      bio: snap.bio || "",
      address: snap.address || "",
      hasAvatar: !!snap.hasAvatar || !!snap.avatarDataUrl,
      hasVideo: !!snap.hasVideo,
      avatarDataUrl: snap.avatarDataUrl || null,
      updatedAt: snap.updatedAt || Date.now(),
      receivedAt: Date.now()
    };
    const keys = Object.keys(map);
    if (keys.length > 40) {
      keys.sort(function (a, b) {
        return (map[a].receivedAt || 0) - (map[b].receivedAt || 0);
      });
      keys.slice(0, keys.length - 40).forEach(function (k) { delete map[k]; });
    }
    savePeers(map);
    return map[key];
  }

  function listPeers() {
    const map = loadPeers();
    return Object.keys(map).map(function (k) {
      return Object.assign({ id: k }, map[k]);
    }).sort(function (a, b) {
      return (b.receivedAt || 0) - (a.receivedAt || 0);
    });
  }

  function getPeer(idOrAddress) {
    const map = loadPeers();
    if (map[idOrAddress]) return map[idOrAddress];
    const lower = String(idOrAddress || "").toLowerCase();
    for (const k of Object.keys(map)) {
      if ((map[k].address || "").toLowerCase() === lower) return map[k];
      if ((map[k].name || "").toLowerCase() === lower) return map[k];
    }
    return null;
  }

  async function shareOverP2P() {
    if (typeof WebRTCPeer === "undefined") throw new Error("WebRTC not loaded.");
    if (WebRTCPeer.channelState() !== "open") {
      throw new Error("P2P channel not open. Run `p2p setup`, exchange offer/answer, then `share profile`.");
    }
    if (typeof DWN !== "undefined" && DWN.shareProfileOverP2P) {
      try {
        return await DWN.shareProfileOverP2P();
      } catch (e) {
        console.warn("DWN share failed, classic fallback", e);
      }
    }
    const snap = await snapshot(true);
    if (typeof Identity !== "undefined" && Identity.attachProof) {
      try {
        await Identity.ensure();
        const signed = await Identity.attachProof(snap);
        WebRTCPeer.send(signed);
        return signed;
      } catch (_) {}
    }
    WebRTCPeer.send(snap);
    return snap;
  }

  function receiveShare(msg) {
    if (!msg || msg.type !== "profile-share") return null;
    return savePeerProfile(msg);
  }

  return {
    getName, setName, getBio, setBio, detect, address, loadMeta,
    setAvatarFromFile, setVideoFromFile, setAvatarFromDataUrl, setVideoFromDataUrl, getAvatar, getVideo,
    clearAvatar, clearVideo, snapshot, summaryText, shareOverP2P,
    receiveShare, listPeers, getPeer, walletAddress
  };
})();

if (typeof window !== "undefined") window.Profile = Profile;
