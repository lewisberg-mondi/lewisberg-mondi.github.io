/**
 * Kanairoex Multi-Media Memory / Gallery
 * Store multiple photos and videos on-device (IndexedDB + index).
 * Commands: gallery · add photo · add video · gallery show N · gallery delete N
 */
const MediaGallery = (() => {
  'use strict';

  const INDEX_KEY = 'media_gallery_index_v1';
  const ITEM_PREFIX = 'media_gallery_item_';
  const MAX_ITEMS = 24;
  const MAX_IMAGE_CHARS = 900000;   // ~0.6–0.7 MB practical
  const MAX_VIDEO_CHARS = 3500000;  // ~2.5 MB practical (leave headroom)
  const MAX_NOTE = 200;

  function uid() {
    return 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  async function idbSet(key, value) {
    if (typeof IDBStore !== 'undefined' && IDBStore.setMeta) {
      try {
        await IDBStore.setMeta(key, value);
        return true;
      } catch (_) {}
    }
    return false;
  }

  async function idbGet(key) {
    if (typeof IDBStore !== 'undefined' && IDBStore.getMeta) {
      try {
        return await IDBStore.getMeta(key);
      } catch (_) {}
    }
    return null;
  }

  async function idbDel(key) {
    if (typeof IDBStore !== 'undefined' && IDBStore.setMeta) {
      try {
        // Store null / empty to clear when no delete API
        await IDBStore.setMeta(key, null);
        return true;
      } catch (_) {}
    }
    return false;
  }

  async function loadIndex() {
    const raw = await idbGet(INDEX_KEY);
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray(raw.ids)) return raw.ids;
    return [];
  }

  async function saveIndex(ids) {
    const trimmed = (ids || []).slice(-MAX_ITEMS);
    const ok = await idbSet(INDEX_KEY, trimmed);
    if (!ok) {
      // localStorage fallback for index only (not media blobs)
      try {
        localStorage.setItem(INDEX_KEY, JSON.stringify(trimmed));
      } catch (_) {}
    }
    return trimmed;
  }

  async function loadIndexFallback() {
    let ids = await loadIndex();
    if (ids.length) return ids;
    try {
      const raw = localStorage.getItem(INDEX_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (Array.isArray(p)) return p;
      }
    } catch (_) {}
    return [];
  }

  function readImageDims(dataUrl) {
    return new Promise(function (resolve) {
      try {
        const img = new Image();
        img.onload = function () {
          resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
        };
        img.onerror = function () { resolve({ width: 0, height: 0 }); };
        img.src = dataUrl;
      } catch (_) {
        resolve({ width: 0, height: 0 });
      }
    });
  }

  function compressImage(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onerror = function () { reject(new Error('Could not read image')); };
      reader.onload = function () {
        const dataUrl = reader.result;
        const img = new Image();
        img.onerror = function () { reject(new Error('Invalid image')); };
        img.onload = function () {
          let w = img.naturalWidth || img.width;
          let h = img.naturalHeight || img.height;
          const maxSide = 1280;
          if (w > maxSide || h > maxSide) {
            const scale = maxSide / Math.max(w, h);
            w = Math.round(w * scale);
            h = Math.round(h * scale);
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          let q = 0.85;
          let out = canvas.toDataURL('image/jpeg', q);
          while (out.length > MAX_IMAGE_CHARS && q > 0.4) {
            q -= 0.1;
            out = canvas.toDataURL('image/jpeg', q);
          }
          if (out.length > MAX_IMAGE_CHARS) {
            reject(new Error('Image still too large after compression. Try a smaller photo.'));
            return;
          }
          resolve({
            dataUrl: out,
            mime: 'image/jpeg',
            width: w,
            height: h,
            size: Math.round((out.length * 3) / 4)
          });
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    });
  }

  function fileToDataUrl(file, maxChars) {
    return new Promise(function (resolve, reject) {
      if (file.size > (maxChars || MAX_VIDEO_CHARS) * 0.75) {
        reject(new Error('File too large for gallery memory (max ~' + Math.round((maxChars || MAX_VIDEO_CHARS) * 0.55 / 1024) + ' KB).'));
        return;
      }
      const reader = new FileReader();
      reader.onerror = function () { reject(new Error('Could not read file')); };
      reader.onload = function () {
        const dataUrl = reader.result;
        if (String(dataUrl).length > (maxChars || MAX_VIDEO_CHARS)) {
          reject(new Error('Encoded file exceeds gallery limit. Use a shorter / smaller clip.'));
          return;
        }
        resolve({
          dataUrl: dataUrl,
          mime: file.type || 'application/octet-stream',
          name: file.name || 'file',
          size: file.size || 0
        });
      };
      reader.readAsDataURL(file);
    });
  }

  async function addFromFile(file, opts) {
    opts = opts || {};
    if (!file) throw new Error('No file selected');

    const ids = await loadIndexFallback();
    if (ids.length >= MAX_ITEMS) {
      throw new Error('Gallery full (' + MAX_ITEMS + ' items). Delete one first: `gallery delete 1`');
    }

    const isImage = (file.type || '').indexOf('image/') === 0;
    const isVideo = (file.type || '').indexOf('video/') === 0;
    if (!isImage && !isVideo) {
      throw new Error('Only images and videos can be added to the gallery.');
    }

    let packed;
    if (isImage) {
      packed = await compressImage(file);
      packed.name = file.name || 'photo.jpg';
    } else {
      packed = await fileToDataUrl(file, MAX_VIDEO_CHARS);
    }

    const id = uid();
    const item = {
      id: id,
      kind: isImage ? 'image' : 'video',
      name: String(opts.name || packed.name || file.name || id).slice(0, 80),
      mime: packed.mime,
      dataUrl: packed.dataUrl,
      size: packed.size || file.size || 0,
      width: packed.width || 0,
      height: packed.height || 0,
      note: String(opts.note || '').trim().slice(0, MAX_NOTE),
      tags: Array.isArray(opts.tags) ? opts.tags.slice(0, 8) : [],
      ts: Date.now()
    };

    const ok = await idbSet(ITEM_PREFIX + id, item);
    if (!ok) {
      throw new Error('IndexedDB unavailable — cannot store gallery media on this device.');
    }

    ids.push(id);
    await saveIndex(ids);
    return {
      id: id,
      kind: item.kind,
      name: item.name,
      size: item.size,
      width: item.width,
      height: item.height,
      count: ids.length
    };
  }

  async function getItem(id) {
    if (!id) return null;
    const item = await idbGet(ITEM_PREFIX + id);
    if (item && item.dataUrl) return item;
    return null;
  }

  async function list() {
    const ids = await loadIndexFallback();
    const out = [];
    for (let i = 0; i < ids.length; i++) {
      const item = await getItem(ids[i]);
      if (item) {
        out.push({
          id: item.id,
          kind: item.kind,
          name: item.name,
          mime: item.mime,
          size: item.size,
          width: item.width,
          height: item.height,
          note: item.note || '',
          ts: item.ts,
          index: out.length + 1
        });
      }
    }
    // Re-sync index if some items missing
    if (out.length !== ids.length) {
      await saveIndex(out.map(function (x) { return x.id; }));
    }
    return out;
  }

  async function listWithData() {
    const ids = await loadIndexFallback();
    const out = [];
    for (let i = 0; i < ids.length; i++) {
      const item = await getItem(ids[i]);
      if (item && item.dataUrl) {
        out.push(Object.assign({}, item, { index: out.length + 1 }));
      }
    }
    return out;
  }

  async function getByIndex(n) {
    const items = await list();
    const idx = Number(n) - 1;
    if (idx < 0 || idx >= items.length) return null;
    return getItem(items[idx].id);
  }

  async function removeByIndex(n) {
    const items = await list();
    const idx = Number(n) - 1;
    if (idx < 0 || idx >= items.length) {
      throw new Error('No gallery item #' + n + '. Use `gallery` to see numbers.');
    }
    const id = items[idx].id;
    await idbDel(ITEM_PREFIX + id);
    const next = items.filter(function (_, i) { return i !== idx; }).map(function (x) { return x.id; });
    await saveIndex(next);
    return { removed: items[idx].name, kind: items[idx].kind, remaining: next.length };
  }

  async function removeById(id) {
    const ids = await loadIndexFallback();
    if (ids.indexOf(id) < 0) throw new Error('Item not found');
    await idbDel(ITEM_PREFIX + id);
    await saveIndex(ids.filter(function (x) { return x !== id; }));
    return true;
  }

  async function clear() {
    const ids = await loadIndexFallback();
    for (let i = 0; i < ids.length; i++) {
      await idbDel(ITEM_PREFIX + ids[i]);
    }
    await saveIndex([]);
    try { localStorage.removeItem(INDEX_KEY); } catch (_) {}
    return { cleared: ids.length };
  }

  function formatBytes(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(2) + ' MB';
  }

  async function summaryText() {
    const items = await list();
    if (!items.length) {
      return (
        '**Media gallery** — empty\n\n' +
        'Add media:\n' +
        '• `add photo` / `gallery photo` — save an image\n' +
        '• `add video` / `gallery video` — save a short clip\n\n' +
        'Limits: up to **' + MAX_ITEMS + '** items · photos ~0.7 MB · videos ~2.5 MB each'
      );
    }
    const photos = items.filter(function (x) { return x.kind === 'image'; }).length;
    const videos = items.filter(function (x) { return x.kind === 'video'; }).length;
    const lines = [
      '**Media gallery** (' + items.length + '/' + MAX_ITEMS + ')',
      '• Photos: **' + photos + '** · Videos: **' + videos + '**',
      ''
    ];
    items.forEach(function (it) {
      const icon = it.kind === 'video' ? '🎬' : '🖼️';
      const dim = it.width && it.height ? ' · ' + it.width + '×' + it.height : '';
      lines.push(
        icon + ' **#' + it.index + '** ' + it.name +
        ' — ' + formatBytes(it.size) + dim +
        (it.note ? ' · _' + it.note + '_' : '')
      );
    });
    lines.push('');
    lines.push('**Commands:** `gallery show 1` · `set photo from gallery 1` · `gallery delete 2` · `add photo` · `add video` · `clear gallery`');
    return lines.join('\n');
  }

  async function status() {
    const items = await list();
    return {
      count: items.length,
      max: MAX_ITEMS,
      photos: items.filter(function (x) { return x.kind === 'image'; }).length,
      videos: items.filter(function (x) { return x.kind === 'video'; }).length,
      maxImageChars: MAX_IMAGE_CHARS,
      maxVideoChars: MAX_VIDEO_CHARS
    };
  }

  /** Build creative payload for chat UI */
  async function creativeForList(limit) {
    const all = await listWithData();
    const slice = all.slice(0, limit == null ? 12 : limit);
    return {
      type: 'gallery',
      message: 'Media gallery',
      items: slice.map(function (it) {
        return {
          id: it.id,
          kind: it.kind,
          name: it.name,
          mime: it.mime,
          dataUrl: it.dataUrl,
          size: it.size,
          index: it.index,
          note: it.note || ''
        };
      })
    };
  }

  async function creativeForItem(item) {
    if (!item || !item.dataUrl) return null;
    if (item.kind === 'video') {
      return {
        type: 'video',
        dataUrl: item.dataUrl,
        videoDataUrl: item.dataUrl,
        videoMime: item.mime,
        videoName: item.name,
        message: item.name || 'Gallery video'
      };
    }
    return {
      type: 'image',
      dataUrl: item.dataUrl,
      prompt: item.name || 'Gallery photo',
      message: item.name || 'Gallery photo',
      filename: item.name
    };
  }

  return {
    addFromFile,
    list,
    listWithData,
    getItem,
    getByIndex,
    removeByIndex,
    removeById,
    clear,
    summaryText,
    status,
    creativeForList,
    creativeForItem,
    MAX_ITEMS,
    formatBytes
  };
})();

if (typeof window !== 'undefined') window.MediaGallery = MediaGallery;
