/**
 * Kanairoex Local LLM Engine
 * Integrates real browser-based LLMs via WebLLM (MLC AI).
 * Falls back gracefully when WebGPU is unavailable or the user stays on the classic engine.
 *
 * Models are downloaded on first use and cached by the browser (Cache API / IndexedDB).
 * Recommended models are small enough for consumer devices (1B–3B class, quantized).
 */
(function (root) {
  'use strict';

  const NS = 'localmind_llm_v1_';
  const DEFAULT_MODEL = 'Phi-3.5-mini-instruct-q4f16_1-MLC'; // solid quality / size balance
  const FALLBACK_MODELS = [
    'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    'gemma-2-2b-it-q4f16_1-MLC',
    'Phi-3.5-mini-instruct-q4f16_1-MLC',
    'TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC'
  ];

  const state = {
    engine: null,
    loading: false,
    ready: false,
    modelId: null,
    progress: 0,
    progressText: '',
    error: null,
    webllm: null,
    lastUsed: 0
  };

  function savePref(k, v) {
    try { localStorage.setItem(NS + k, JSON.stringify(v)); } catch (_) {}
  }
  function loadPref(k, d) {
    try {
      const v = localStorage.getItem(NS + k);
      return v != null ? JSON.parse(v) : d;
    } catch (_) { return d; }
  }

  function hasWebGPU() {
    return !!(navigator.gpu && typeof navigator.gpu.requestAdapter === 'function');
  }

  async function loadWebLLM() {
    if (state.webllm) return state.webllm;
    // Prefer global if already present, otherwise dynamic import from CDN
    if (root.webllm && root.webllm.CreateMLCEngine) {
      state.webllm = root.webllm;
      return state.webllm;
    }
    try {
      const mod = await import('https://esm.run/@mlc-ai/web-llm@0.2.79');
      state.webllm = mod;
      root.webllm = mod; // expose for debugging
      return mod;
    } catch (e) {
      // Older CDN fallback
      try {
        const mod = await import('https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.79/+esm');
        state.webllm = mod;
        root.webllm = mod;
        return mod;
      } catch (e2) {
        throw new Error('Failed to load WebLLM library: ' + (e2.message || e.message));
      }
    }
  }

  function progressCallback(report) {
    if (!report) return;
    const p = typeof report.progress === 'number' ? report.progress : 0;
    state.progress = Math.max(0, Math.min(1, p));
    state.progressText = report.text || (Math.round(state.progress * 100) + '%');
    if (typeof root.LocalLLM_onProgress === 'function') {
      try { root.LocalLLM_onProgress(state.progress, state.progressText, report); } catch (_) {}
    }
    // Also dispatch a DOM event so UI can listen without globals
    try {
      window.dispatchEvent(new CustomEvent('localmind-llm-progress', {
        detail: { progress: state.progress, text: state.progressText, report }
      }));
    } catch (_) {}
  }

  async function init(modelId, opts) {
    opts = opts || {};
    if (state.loading) return { ok: false, error: 'Already loading a model' };
    if (state.ready && state.modelId === (modelId || state.modelId) && state.engine) {
      return { ok: true, modelId: state.modelId, cached: true };
    }

    if (!hasWebGPU() && !opts.force) {
      state.error = 'WebGPU is not available in this browser. Local LLM requires Chrome/Edge 113+ or a browser with WebGPU enabled.';
      return { ok: false, error: state.error, needsWebGPU: true };
    }

    state.loading = true;
    state.error = null;
    state.progress = 0;
    state.progressText = 'Loading WebLLM…';
    progressCallback({ progress: 0.01, text: state.progressText });

    try {
      const webllm = await loadWebLLM();
      const id = modelId || loadPref('model', DEFAULT_MODEL) || DEFAULT_MODEL;

      state.progressText = 'Initializing engine for ' + id + '…';
      progressCallback({ progress: 0.05, text: state.progressText });

      // Unload previous engine if switching models
      if (state.engine && state.modelId !== id) {
        try { await state.engine.unload(); } catch (_) {}
        state.engine = null;
        state.ready = false;
      }

      const engine = await webllm.CreateMLCEngine(id, {
        initProgressCallback: progressCallback,
        logLevel: opts.logLevel || 'WARN'
      });

      state.engine = engine;
      state.modelId = id;
      state.ready = true;
      state.loading = false;
      state.progress = 1;
      state.progressText = 'Ready';
      state.lastUsed = Date.now();
      savePref('model', id);

      progressCallback({ progress: 1, text: 'Ready — ' + id });
      window.dispatchEvent(new CustomEvent('localmind-llm-ready', { detail: { modelId: id } }));

      return { ok: true, modelId: id };
    } catch (err) {
      state.loading = false;
      state.ready = false;
      state.engine = null;
      state.error = (err && err.message) ? err.message : String(err);
      progressCallback({ progress: 0, text: 'Error: ' + state.error });
      return { ok: false, error: state.error };
    }
  }

  async function chat(messages, opts) {
    opts = opts || {};
    if (!state.ready || !state.engine) {
      const r = await init(opts.modelId);
      if (!r.ok) throw new Error(r.error || 'Local LLM not ready');
    }

    const eng = state.engine;
    state.lastUsed = Date.now();

    // Normalize messages
    const msgs = (messages || []).map(m => ({
      role: m.role || 'user',
      content: typeof m.content === 'string' ? m.content : String(m.content || '')
    })).filter(m => m.content);

    if (!msgs.length) throw new Error('No messages provided');

    const genCfg = {
      temperature: opts.temperature != null ? opts.temperature : 0.7,
      top_p: opts.top_p != null ? opts.top_p : 0.9,
      max_tokens: opts.max_tokens != null ? opts.max_tokens : 1024,
      frequency_penalty: opts.frequency_penalty || 0,
      presence_penalty: opts.presence_penalty || 0
    };

    if (opts.stream && typeof opts.onToken === 'function') {
      // Streaming
      let full = '';
      const completion = await eng.chat.completions.create({
        messages: msgs,
        stream: true,
        ...genCfg
      });
      for await (const chunk of completion) {
        const delta = chunk.choices?.[0]?.delta?.content || '';
        if (delta) {
          full += delta;
          opts.onToken(delta, full);
        }
      }
      return { content: full, role: 'assistant', model: state.modelId, streamed: true };
    }

    // Non-streaming
    const reply = await eng.chat.completions.create({
      messages: msgs,
      stream: false,
      ...genCfg
    });
    const content = reply.choices?.[0]?.message?.content || '';
    return {
      content,
      role: 'assistant',
      model: state.modelId,
      usage: reply.usage || null,
      streamed: false
    };
  }

  /** Convenience: single-turn prompt with optional system + context */
  async function generate(prompt, opts) {
    opts = opts || {};
    const messages = [];
    if (opts.system) {
      messages.push({ role: 'system', content: opts.system });
    }
    if (opts.context) {
      messages.push({ role: 'system', content: 'Relevant context:\n' + String(opts.context).slice(0, 6000) });
    }
    messages.push({ role: 'user', content: String(prompt || '') });
    return chat(messages, opts);
  }

  async function unload() {
    if (state.engine) {
      try { await state.engine.unload(); } catch (_) {}
    }
    state.engine = null;
    state.ready = false;
    state.modelId = null;
    state.progress = 0;
    state.progressText = '';
    return true;
  }

  function status() {
    return {
      ready: state.ready,
      loading: state.loading,
      modelId: state.modelId,
      progress: state.progress,
      progressText: state.progressText,
      error: state.error,
      hasWebGPU: hasWebGPU(),
      lastUsed: state.lastUsed,
      preferredModel: loadPref('model', DEFAULT_MODEL)
    };
  }

  function listRecommended() {
    return [
      { id: 'Phi-3.5-mini-instruct-q4f16_1-MLC', name: 'Phi-3.5 Mini', size: '~2.4 GB', note: 'Best overall quality/size (recommended)' },
      { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', name: 'Llama 3.2 1B', size: '~0.8 GB', note: 'Fastest, good for weak devices' },
      { id: 'gemma-2-2b-it-q4f16_1-MLC', name: 'Gemma 2 2B', size: '~1.6 GB', note: 'Strong small model from Google' },
      { id: 'TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC', name: 'TinyLlama 1.1B', size: '~0.7 GB', note: 'Very lightweight' }
    ];
  }

  // Public API
  const LocalLLM = {
    init,
    chat,
    generate,
    unload,
    status,
    listRecommended,
    hasWebGPU,
    DEFAULT_MODEL,
    _state: state // for advanced debugging only
  };

  root.LocalLLM = LocalLLM;
})(typeof window !== 'undefined' ? window : globalThis);
