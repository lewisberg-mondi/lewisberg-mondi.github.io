/**
 * Kanairoex Multimodal Engine
 * Browser-local image understanding using Transformers.js (Hugging Face).
 * Supports image captioning, visual question answering (VQA), and basic document/image analysis.
 *
 * Models are downloaded once and cached. Works offline after the first successful load.
 * When offline or CDN blocked: graceful metadata fallback (no hard crash).
 */
(function (root) {
  'use strict';

  const NS = 'localmind_mm_v1_';
  const state = {
    pipeline: null,       // captioning / general vision pipeline
    vqaPipeline: null,    // visual question answering
    loading: false,
    ready: false,
    mode: null,           // 'caption' | 'vqa' | 'both' | 'offline-meta'
    progress: 0,
    progressText: '',
    error: null,
    transformers: null,
    lastImageMeta: null,
    loadAttempted: false,
    cdnBlocked: false     // after first CDN failure, stay offline-meta for this session
  };

  // Multiple CDNs so one blocked source does not kill image understanding
  const TRANSFORMERS_CDN = [
    'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2',
    'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/+esm',
    'https://unpkg.com/@xenova/transformers@2.17.2',
    'https://esm.sh/@xenova/transformers@2.17.2'
  ];

  function savePref(k, v) {
    try { localStorage.setItem(NS + k, JSON.stringify(v)); } catch (_) {}
  }
  function loadPref(k, d) {
    try {
      const v = localStorage.getItem(NS + k);
      return v != null ? JSON.parse(v) : d;
    } catch (_) { return d; }
  }

  function isOnline() {
    try {
      return typeof navigator === 'undefined' ? true : !!navigator.onLine;
    } catch (_) {
      return true;
    }
  }

  function progressCallback(p) {
    if (!p) return;
    let pct = state.progress;
    if (typeof p.progress === 'number') pct = p.progress;
    else if (p.loaded && p.total) pct = p.loaded / p.total;
    state.progress = Math.max(0, Math.min(1, pct || 0));
    state.progressText = p.status || p.file || (Math.round(state.progress * 100) + '%');
    try {
      window.dispatchEvent(new CustomEvent('localmind-mm-progress', {
        detail: { progress: state.progress, text: state.progressText, raw: p }
      }));
    } catch (_) {}
  }

  async function loadTransformers() {
    if (state.transformers) return state.transformers;
    if (root.Transformers || root.transformers) {
      state.transformers = root.Transformers || root.transformers;
      return state.transformers;
    }

    // Offline or previous CDN failure this session — never fetch again
    if (!isOnline() || state.cdnBlocked) {
      const err = new Error(
        !isOnline()
          ? 'Offline — vision model not available. Image was still accepted (metadata mode).'
          : 'Vision CDN blocked earlier this session. Image accepted (metadata mode).'
      );
      err.code = 'OFFLINE_META';
      throw err;
    }

    let lastErr = null;
    for (let i = 0; i < TRANSFORMERS_CDN.length; i++) {
      const url = TRANSFORMERS_CDN[i];
      try {
        progressCallback({ status: 'Fetching Transformers.js… (' + (i + 1) + '/' + TRANSFORMERS_CDN.length + ')', progress: 0.03 + i * 0.02 });
        const mod = await import(/* @vite-ignore */ url);
        state.transformers = mod;
        root.Transformers = mod;
        state.cdnBlocked = false;
        if (mod.env) {
          mod.env.allowLocalModels = false;
          mod.env.useBrowserCache = true;
        }
        return mod;
      } catch (e) {
        lastErr = e;
      }
    }
    state.cdnBlocked = true;
    const err = new Error(
      'Vision model unavailable (network/CDN). Image still accepted in metadata mode. ' +
      'Go online once or open over https, then AI Lab → Multimodal → Load. ' +
      'Detail: ' + ((lastErr && lastErr.message) || lastErr || 'Failed to fetch')
    );
    err.code = 'OFFLINE_META';
    throw err;
  }

  /**
   * Initialize multimodal capabilities.
   * @param {object} opts
   * @param {boolean} opts.caption - load image-to-text (default true)
   * @param {boolean} opts.vqa - load visual question answering (heavier, default false)
   * @param {string}  opts.captionModel - override model id
   * @param {string}  opts.vqaModel - override model id
   * @param {boolean} opts.force - reload even if ready
   * @param {boolean} opts.allowOfflineMeta - if true, succeed in offline-meta mode when CDN fails
   */
  async function init(opts) {
    opts = opts || {};
    if (state.loading) return { ok: false, error: 'Already loading multimodal models' };
    if (state.ready && !opts.force) {
      return { ok: true, mode: state.mode, cached: true };
    }

    state.loading = true;
    state.error = null;
    state.progress = 0;
    state.progressText = 'Loading Transformers.js…';
    progressCallback({ status: state.progressText, progress: 0.02 });
    state.loadAttempted = true;

    try {
      const tf = await loadTransformers();
      const { pipeline } = tf;

      const captionModel = opts.captionModel || loadPref('captionModel', 'Xenova/vit-gpt2-image-captioning');
      const vqaModel = opts.vqaModel || loadPref('vqaModel', 'Xenova/vit-gpt2-image-captioning');

      const wantCaption = opts.caption !== false;
      const wantVqa = !!opts.vqa;

      if (wantCaption) {
        state.progressText = 'Loading image captioning model…';
        progressCallback({ status: state.progressText, progress: 0.1 });
        state.pipeline = await pipeline('image-to-text', captionModel, {
          progress_callback: progressCallback
        });
        savePref('captionModel', captionModel);
      }

      if (wantVqa) {
        state.vqaPipeline = state.pipeline;
        savePref('vqaModel', vqaModel);
      }

      state.ready = true;
      state.loading = false;
      state.mode = wantVqa && wantCaption ? 'both' : (wantCaption ? 'caption' : 'vqa');
      state.progress = 1;
      state.progressText = 'Multimodal ready';
      state.error = null;
      progressCallback({ status: state.progressText, progress: 1 });

      window.dispatchEvent(new CustomEvent('localmind-mm-ready', {
        detail: { mode: state.mode }
      }));

      return { ok: true, mode: state.mode };
    } catch (err) {
      state.loading = false;
      state.ready = false;
      state.error = (err && err.message) ? err.message : String(err);
      progressCallback({ status: 'Error: ' + state.error, progress: 0 });

      // Soft success path: offline / CDN blocked → metadata-only mode
      if (opts.allowOfflineMeta !== false) {
        state.mode = 'offline-meta';
        state.ready = true; // allow understand() to run offline path
        state.pipeline = null;
        return {
          ok: true,
          mode: 'offline-meta',
          offline: true,
          warning: state.error
        };
      }
      return { ok: false, error: state.error };
    }
  }

  /** Read width/height without Transformers (works offline) */
  function readImageDimensions(urlOrBlob) {
    return new Promise(function (resolve) {
      try {
        const img = new Image();
        img.onload = function () {
          resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
        };
        img.onerror = function () { resolve(null); };
        if (typeof urlOrBlob === 'string') {
          img.src = urlOrBlob;
        } else if (urlOrBlob instanceof Blob) {
          img.src = URL.createObjectURL(urlOrBlob);
        } else {
          resolve(null);
        }
      } catch (_) {
        resolve(null);
      }
    });
  }

  /** Convert File / Blob / URL / HTMLImageElement / canvas to a form Transformers accepts */
  async function normalizeImage(input) {
    if (!input) throw new Error('No image provided');

    if (typeof input === 'string') return input;

    if (input instanceof HTMLImageElement || input instanceof HTMLCanvasElement) {
      return input;
    }

    if (input instanceof Blob || (typeof File !== 'undefined' && input instanceof File)) {
      const url = URL.createObjectURL(input);
      const dims = await readImageDimensions(url);
      state.lastImageMeta = {
        name: input.name || 'image',
        type: input.type || 'image/*',
        size: input.size || 0,
        objectUrl: url,
        width: dims && dims.width,
        height: dims && dims.height
      };
      return url;
    }

    if (input instanceof ArrayBuffer || ArrayBuffer.isView(input)) {
      const blob = new Blob([input], { type: 'image/png' });
      const url = URL.createObjectURL(blob);
      const dims = await readImageDimensions(url);
      state.lastImageMeta = {
        name: 'image',
        type: 'image/png',
        size: blob.size,
        objectUrl: url,
        width: dims && dims.width,
        height: dims && dims.height
      };
      return url;
    }

    throw new Error('Unsupported image input type');
  }

  function formatBytes(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(2) + ' MB';
  }

  /** Offline / no-model description from file metadata + dimensions */
  function offlineDescribe(meta, userText) {
    const m = meta || {};
    const lines = [];
    lines.push('**Image received** (vision model not loaded yet)');
    lines.push('');
    lines.push('• **File:** ' + (m.name || 'image'));
    lines.push('• **Type:** ' + (m.type || 'unknown'));
    lines.push('• **Size:** ' + formatBytes(m.size));
    if (m.width && m.height) {
      lines.push('• **Dimensions:** ' + m.width + '×' + m.height + ' px');
    }
    lines.push('');
    if (userText && String(userText).trim()) {
      lines.push('_Your note:_ ' + String(userText).trim());
      lines.push('');
    }
    lines.push(
      'To enable AI captions: go **online once**, open **AI Lab → Multimodal → Load**, ' +
      'or upload the image again after the model caches. Kanairoex stays offline-first after that.'
    );
    return lines.join('\n');
  }

  /**
   * Generate a caption for an image.
   * @returns {{ caption: string, raw: any, meta: object, method?: string }}
   */
  async function caption(image, opts) {
    opts = opts || {};
    if (!state.ready || !state.pipeline) {
      const r = await init({ caption: true, allowOfflineMeta: true });
      if (!r.ok) throw new Error(r.error || 'Multimodal not ready');
    }

    // Offline-meta mode: no pipeline
    if (!state.pipeline || state.mode === 'offline-meta') {
      const img = await normalizeImage(image);
      void img;
      return {
        caption: offlineDescribe(state.lastImageMeta, opts.userText),
        raw: null,
        meta: state.lastImageMeta,
        method: 'offline-meta'
      };
    }

    const img = await normalizeImage(image);
    const result = await state.pipeline(img, {
      max_new_tokens: opts.max_new_tokens || 50,
      do_sample: !!opts.do_sample
    });

    const text = Array.isArray(result)
      ? (result[0]?.generated_text || result[0]?.caption || JSON.stringify(result[0]))
      : (result.generated_text || String(result));

    return {
      caption: String(text).trim(),
      raw: result,
      meta: state.lastImageMeta,
      method: 'caption'
    };
  }

  /**
   * Answer a question about an image.
   */
  async function visualQA(image, question, opts) {
    opts = opts || {};
    const cap = await caption(image, opts);
    const q = String(question || 'What is in this image?').trim();

    if (cap.method === 'offline-meta') {
      return {
        answer: offlineDescribe(cap.meta, q),
        caption: cap.caption,
        method: 'offline-meta',
        meta: cap.meta
      };
    }

    if (root.LocalLLM && root.LocalLLM.status && root.LocalLLM.status().ready) {
      const system = 'You are a careful visual assistant. Answer the user question using only the image description. If the description lacks information, say so clearly.';
      const prompt = 'Image description:\n' + cap.caption + '\n\nQuestion: ' + q + '\n\nAnswer:';
      try {
        const llm = await root.LocalLLM.generate(prompt, {
          system,
          temperature: 0.3,
          max_tokens: opts.max_tokens || 256
        });
        return {
          answer: llm.content,
          caption: cap.caption,
          model: llm.model,
          method: 'caption+llm',
          meta: cap.meta
        };
      } catch (e) {
        // fall through
      }
    }

    return {
      answer: 'Based on the image, I see: ' + cap.caption + '. (Load a local LLM for richer visual question answering.)',
      caption: cap.caption,
      method: 'caption-only',
      meta: cap.meta
    };
  }

  /**
   * High-level helper used by the chat pipeline.
   * Accepts a File/Blob and optional user text.
   * Never throws solely because CDN is unreachable — uses offline-meta instead.
   */
  async function understand(image, userText) {
    const text = (userText || '').trim();

    // Ensure init ran (offline-meta is OK)
    if (!state.ready && !state.loading) {
      await init({ caption: true, vqa: true, allowOfflineMeta: true });
    } else if (state.loading) {
      // Wait briefly if another init is in progress
      for (let i = 0; i < 40 && state.loading; i++) {
        await new Promise(function (r) { setTimeout(r, 100); });
      }
    }

    try {
      if (text && /\?|what|where|who|how|describe|tell me|explain|is there|are there|count|how many/i.test(text)) {
        return await visualQA(image, text, { userText: text });
      }
      const cap = await caption(image, { userText: text });
      return {
        answer: cap.caption,
        caption: cap.caption,
        method: cap.method || 'caption',
        meta: cap.meta
      };
    } catch (err) {
      // Last-resort: never leave the user with a raw CDN stack trace
      try {
        await normalizeImage(image);
      } catch (_) {}
      const msg = offlineDescribe(state.lastImageMeta, text);
      const detail = (err && err.message) ? err.message : String(err);
      return {
        answer: msg + '\n\n_Technical note:_ ' + detail,
        caption: msg,
        method: 'offline-meta-error',
        meta: state.lastImageMeta,
        error: detail
      };
    }
  }

  function status() {
    return {
      ready: state.ready,
      loading: state.loading,
      mode: state.mode,
      progress: state.progress,
      progressText: state.progressText,
      error: state.error,
      lastImageMeta: state.lastImageMeta,
      online: isOnline(),
      hasPipeline: !!state.pipeline
    };
  }

  async function unload() {
    state.pipeline = null;
    state.vqaPipeline = null;
    state.ready = false;
    state.mode = null;
    if (state.lastImageMeta && state.lastImageMeta.objectUrl) {
      try { URL.revokeObjectURL(state.lastImageMeta.objectUrl); } catch (_) {}
    }
    state.lastImageMeta = null;
    return true;
  }

  const Multimodal = {
    init,
    caption,
    visualQA,
    understand,
    status,
    unload,
    _state: state
  };

  root.Multimodal = Multimodal;
})(typeof window !== 'undefined' ? window : globalThis);
