/**
 * Kanairoex External Local LLM Backends
 * Connects to native desktop AI runtimes running on the same machine:
 *   - Ollama          → http://localhost:11434
 *   - LM Studio       → http://localhost:1234
 *   - Generic OpenAI-compatible servers (llama.cpp server, LocalAI, vLLM, etc.)
 *
 * All communication is browser → localhost only. No cloud required.
 */
(function (root) {
  'use strict';

  const NS = 'localmind_extllm_v1_';

  const PRESETS = {
    ollama: {
      id: 'ollama',
      name: 'Ollama',
      baseUrl: 'http://localhost:11434',
      openaiPath: '/v1',
      modelsPath: '/api/tags',           // native list
      openaiModelsPath: '/v1/models',
      chatPath: '/v1/chat/completions',
      nativeChatPath: '/api/chat',
      apiKey: 'ollama',
      icon: '🦙'
    },
    lmstudio: {
      id: 'lmstudio',
      name: 'LM Studio',
      baseUrl: 'http://localhost:1234',
      openaiPath: '/v1',
      modelsPath: '/v1/models',
      openaiModelsPath: '/v1/models',
      chatPath: '/v1/chat/completions',
      apiKey: 'lm-studio',
      icon: '🎛️'
    },
    llamacpp: {
      id: 'llamacpp',
      name: 'llama.cpp server',
      baseUrl: 'http://localhost:8080',
      openaiPath: '/v1',
      modelsPath: '/v1/models',
      openaiModelsPath: '/v1/models',
      chatPath: '/v1/chat/completions',
      apiKey: 'llamacpp',
      icon: '⚡'
    },
    custom: {
      id: 'custom',
      name: 'Custom OpenAI-compatible',
      baseUrl: 'http://localhost:8000',
      openaiPath: '/v1',
      modelsPath: '/v1/models',
      openaiModelsPath: '/v1/models',
      chatPath: '/v1/chat/completions',
      apiKey: 'local',
      icon: '🔌'
    }
  };

  const state = {
    activeBackend: loadPref('activeBackend', null),   // 'ollama' | 'lmstudio' | ...
    activeModel: loadPref('activeModel', null),
    backends: {},          // id → { online, models, lastCheck, error }
    customBaseUrl: loadPref('customBaseUrl', 'http://localhost:8000')
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

  function getPreset(id) {
    if (id === 'custom') {
      return Object.assign({}, PRESETS.custom, { baseUrl: state.customBaseUrl || PRESETS.custom.baseUrl });
    }
    return PRESETS[id] || null;
  }

  async function fetchJson(url, opts, timeoutMs) {
    timeoutMs = timeoutMs || 8000;
    const ctrl = new AbortController();
    const timer = setTimeout(function () { ctrl.abort(); }, timeoutMs);
    try {
      const res = await fetch(url, Object.assign({ signal: ctrl.signal }, opts || {}));
      clearTimeout(timer);
      if (!res.ok) {
        const t = await res.text().catch(function () { return ''; });
        throw new Error('HTTP ' + res.status + (t ? ': ' + t.slice(0, 200) : ''));
      }
      return await res.json();
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  }

  /** Probe whether a backend is reachable and list its models */
  async function probe(backendId) {
    const preset = getPreset(backendId);
    if (!preset) return { online: false, error: 'Unknown backend', models: [] };

    const info = { online: false, models: [], error: null, lastCheck: Date.now(), name: preset.name };

    // 1) Try OpenAI-compatible /v1/models
    try {
      const data = await fetchJson(preset.baseUrl + (preset.openaiModelsPath || '/v1/models'), {
        headers: { 'Authorization': 'Bearer ' + (preset.apiKey || 'local') }
      }, 5000);
      const list = (data.data || data.models || []).map(function (m) {
        return typeof m === 'string' ? m : (m.id || m.name || m.model || String(m));
      }).filter(Boolean);
      if (list.length) {
        info.online = true;
        info.models = list;
        state.backends[backendId] = info;
        return info;
      }
    } catch (_) { /* fall through */ }

    // 2) Ollama native /api/tags
    if (backendId === 'ollama') {
      try {
        const data = await fetchJson(preset.baseUrl + '/api/tags', {}, 5000);
        const list = (data.models || []).map(function (m) {
          return m.name || m.model || String(m);
        }).filter(Boolean);
        info.online = true;
        info.models = list;
        state.backends[backendId] = info;
        return info;
      } catch (e) {
        info.error = e.name === 'AbortError' ? 'Timeout — is Ollama running?' : (e.message || String(e));
      }
    } else {
      info.error = 'Unreachable — is the server running and CORS enabled?';
    }

    state.backends[backendId] = info;
    return info;
  }

  async function probeAll() {
    const ids = ['ollama', 'lmstudio', 'llamacpp', 'custom'];
    const results = {};
    await Promise.all(ids.map(async function (id) {
      results[id] = await probe(id);
    }));
    return results;
  }

  function setActive(backendId, modelId) {
    if (backendId) {
      state.activeBackend = backendId;
      savePref('activeBackend', backendId);
    }
    if (modelId) {
      state.activeModel = modelId;
      savePref('activeModel', modelId);
    }
  }

  function setCustomBaseUrl(url) {
    state.customBaseUrl = String(url || '').replace(/\/+$/, '');
    savePref('customBaseUrl', state.customBaseUrl);
  }

  function isActive() {
    return !!(state.activeBackend && state.activeModel);
  }

  function status() {
    return {
      activeBackend: state.activeBackend,
      activeModel: state.activeModel,
      backends: state.backends,
      customBaseUrl: state.customBaseUrl,
      presets: Object.keys(PRESETS).map(function (k) {
        const p = getPreset(k);
        return { id: p.id, name: p.name, baseUrl: p.baseUrl, icon: p.icon };
      })
    };
  }

  /**
   * Chat completion via the active (or specified) backend.
   * OpenAI-compatible request shape.
   */
  async function chat(messages, opts) {
    opts = opts || {};
    const backendId = opts.backend || state.activeBackend;
    const model = opts.model || state.activeModel;
    if (!backendId || !model) {
      throw new Error('No active external backend/model. Connect Ollama or LM Studio first.');
    }

    const preset = getPreset(backendId);
    if (!preset) throw new Error('Unknown backend: ' + backendId);

    const body = {
      model: model,
      messages: (messages || []).map(function (m) {
        return { role: m.role || 'user', content: typeof m.content === 'string' ? m.content : String(m.content || '') };
      }),
      temperature: opts.temperature != null ? opts.temperature : 0.7,
      top_p: opts.top_p != null ? opts.top_p : 0.9,
      max_tokens: opts.max_tokens != null ? opts.max_tokens : 1024,
      stream: !!opts.stream
    };

    const url = preset.baseUrl + (preset.chatPath || '/v1/chat/completions');
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + (preset.apiKey || 'local')
    };

    if (opts.stream && typeof opts.onToken === 'function') {
      // Streaming SSE
      const res = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const t = await res.text().catch(function () { return ''; });
        throw new Error('HTTP ' + res.status + ': ' + t.slice(0, 300));
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = '';
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const s = line.trim();
          if (!s || !s.startsWith('data:')) continue;
          const payload = s.slice(5).trim();
          if (payload === '[DONE]') continue;
          try {
            const json = JSON.parse(payload);
            const delta = json.choices && json.choices[0] && json.choices[0].delta
              ? (json.choices[0].delta.content || '')
              : '';
            if (delta) {
              full += delta;
              opts.onToken(delta, full);
            }
          } catch (_) {}
        }
      }
      return {
        content: full,
        role: 'assistant',
        model: model,
        backend: backendId,
        streamed: true
      };
    }

    // Non-streaming
    const data = await fetchJson(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body)
    }, opts.timeout || 120000);

    const content = data.choices && data.choices[0] && data.choices[0].message
      ? (data.choices[0].message.content || '')
      : (data.message && data.message.content) || '';

    return {
      content: content,
      role: 'assistant',
      model: model,
      backend: backendId,
      usage: data.usage || null,
      streamed: false
    };
  }

  async function generate(prompt, opts) {
    opts = opts || {};
    const messages = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    if (opts.context) messages.push({ role: 'system', content: 'Relevant context:\n' + String(opts.context).slice(0, 6000) });
    messages.push({ role: 'user', content: String(prompt || '') });
    return chat(messages, opts);
  }

  /** Convenience: try Ollama native pull (best-effort, may fail due to CORS/long runtime) */
  async function ollamaPull(modelName) {
    const preset = getPreset('ollama');
    try {
      const res = await fetch(preset.baseUrl + '/api/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName, stream: false })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      throw new Error('Pull failed (run `ollama pull ' + modelName + '` in a terminal instead): ' + e.message);
    }
  }

  // Public API
  root.ExternalLLM = {
    PRESETS,
    probe,
    probeAll,
    setActive,
    setCustomBaseUrl,
    isActive,
    status,
    chat,
    generate,
    ollamaPull,
    getPreset,
    _state: state
  };
})(typeof window !== 'undefined' ? window : globalThis);
