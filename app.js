/**
 * Kanairoex UI Controller
 */

(function () {
  // Elements
  const sidebar = document.getElementById("sidebar");
  const openSidebar = document.getElementById("openSidebar");
  const closeSidebar = document.getElementById("closeSidebar");
  const navBtns = document.querySelectorAll(".nav-btn");
  const panels = document.querySelectorAll(".panel");
  const panelTitle = document.getElementById("panelTitle");
  const chatContainer = document.getElementById("chatContainer");
  const welcome = document.getElementById("welcome");

  // Chat scroll controller. The user always owns the scroll position while reading older messages.
  let chatFollowBottom = true;
  let chatScrollRaf = 0;
  let chatMutationObserver = null;
  let chatResizeObserver = null;
  function chatIsNearBottom(el, threshold) {
    if (!el) return true;
    const t = threshold == null ? 120 : threshold;
    return (el.scrollHeight - el.scrollTop - el.clientHeight) <= t;
  }
  function chatScrollBottom(force) {
    if (!chatContainer) return;
    if (!force && !chatFollowBottom && !chatIsNearBottom(chatContainer)) return;
    cancelAnimationFrame(chatScrollRaf);
    function apply() {
      if (!chatContainer) return;
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
    chatScrollRaf = requestAnimationFrame(function () {
      apply();
      // second pass after layout (images / typewriter / thinking steps)
      requestAnimationFrame(apply);
    });
  }
  function chatMarkNewContent() {
    if (chatFollowBottom) chatScrollBottom(false);
  }
  chatContainer?.addEventListener("scroll", function () {
    chatFollowBottom = chatIsNearBottom(chatContainer);
  }, { passive: true });
  if (chatContainer && typeof MutationObserver !== "undefined") {
    chatMutationObserver = new MutationObserver(function () { chatMarkNewContent(); });
    chatMutationObserver.observe(chatContainer, { childList: true, subtree: true, characterData: true });
  }
  if (chatContainer && typeof ResizeObserver !== "undefined") {
    chatResizeObserver = new ResizeObserver(function () { chatMarkNewContent(); });
    chatResizeObserver.observe(chatContainer);
  }
  window.addEventListener("resize", function () {
    if (chatFollowBottom) chatScrollBottom(false);
  }, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", function () {
      if (chatFollowBottom) chatScrollBottom(false);
    }, { passive: true });
  }
  const userInput = document.getElementById("userInput");
  const sendBtn = document.getElementById("sendBtn");
  const knowledgeList = document.getElementById("knowledgeList");
  const knowledgeSearch = document.getElementById("knowledgeSearch");
  const blockchainView = document.getElementById("blockchainView");
  const chainStatus = document.getElementById("chainStatus");
  const neuronGrid = document.getElementById("neuronGrid");
  const teachSubject = document.getElementById("teachSubject");
  const teachFact = document.getElementById("teachFact");
  const teachCategory = document.getElementById("teachCategory");
  const teachSubmit = document.getElementById("teachSubmit");
  const teachFeedback = document.getElementById("teachFeedback");
  const aiNameInput = document.getElementById("aiName");
  const responseStyle = document.getElementById("responseStyle");
  const autoLearn = document.getElementById("autoLearn");
  const correctMode = document.getElementById("correctMode");
  const exportBtn = document.getElementById("exportBtn");
  const importBtn = document.getElementById("importBtn");
  const importFile = document.getElementById("importFile");
  const clearBtn = document.getElementById("clearBtn");
  const resetAll = document.getElementById("resetAll");
  const addFactBtn = document.getElementById("addFactBtn");
  const refreshChain = document.getElementById("refreshChain");
  const verifyChain = document.getElementById("verifyChain");
  const aiLabOutput = document.getElementById("aiLabOutput");

  /** Reliable file download across Android browsers, WebViews and file:// pages.
      If the browser blocks a synthetic download after an async operation, a visible
      user-tap download link is created instead of silently failing. */
  function lmDownloadBlob(blob, filename, container) {
    filename = filename || "localmind-download.json";
    container = container || null;
    try {
      if (window.navigator && navigator.msSaveOrOpenBlob) {
        navigator.msSaveOrOpenBlob(blob, filename);
        return { ok: true, method: "msSave" };
      }
    } catch (e) {}

    let url = "";
    try { url = URL.createObjectURL(blob); } catch (e) {}

    function makeLink(href) {
      const a = document.createElement("a");
      a.href = href;
      a.download = filename;
      a.rel = "noopener";
      a.textContent = "⬇️ Download " + filename;
      a.className = "btn primary";
      a.style.cssText = "display:inline-block;margin:8px 0;padding:10px 14px;";
      return a;
    }

    // Keep a real, visible link as a reliable fallback on Android/WebView.
    if (container) {
      try {
        const old = container.querySelector(".lm-download-fallback");
        if (old) old.remove();
        const wrap = document.createElement("div");
        wrap.className = "lm-download-fallback";
        const link = makeLink(url);
        wrap.appendChild(link);
        container.appendChild(wrap);
        // Best-effort automatic download. If the WebView blocks it, the link remains.
        try { link.click(); } catch (_) {}
        return { ok: true, method: "anchor-fallback", url: url, link: link };
      } catch (e) {}
    }

    // Direct anchor fallback.
    try {
      const a = makeLink(url);
      a.style.cssText += "position:fixed;left:12px;bottom:12px;z-index:2147483647;";
      document.body.appendChild(a);
      try { a.click(); } catch (_) {}
      return { ok: true, method: "anchor", url: url, link: a };
    } catch (e) {
      // Last-resort data URL for smaller exports.
      try {
        if (blob.size < 4e6) {
          const reader = new FileReader();
          reader.onload = function () {
            const a = makeLink(reader.result);
            a.style.cssText += "position:fixed;left:12px;bottom:12px;z-index:2147483647;";
            document.body.appendChild(a);
            try { a.click(); } catch (_) {}
          };
          reader.readAsDataURL(blob);
          return { ok: true, method: "dataUrl" };
        }
      } catch (_) {}
      return { ok: false, error: (e && e.message) || "Download is blocked by this browser." };
    }
  }

  function lmDownloadJSON(obj, filename) {
    const json = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    return lmDownloadBlob(blob, filename || "localmind-export.json", arguments.length > 2 ? arguments[2] : null);
  }

  const aiAgentTask = document.getElementById("aiAgentTask");
  const aiLabFiles = document.getElementById("aiLabFiles");

  // Sidebar toggle
  openSidebar?.addEventListener("click", () => sidebar.classList.add("open"));
  closeSidebar?.addEventListener("click", () => sidebar.classList.remove("open"));

  // Offline AI Lab handlers
  
/* ---------- Local LLM + Multimodal UI ---------- */

  /* External backends (Ollama / LM Studio / …) */
  function updateExtActiveLine() {
    const el = document.getElementById("extActiveLine");
    if (!el || !window.ExternalLLM) return;
    const s = ExternalLLM.status();
    if (s.activeBackend && s.activeModel) {
      const p = ExternalLLM.getPreset(s.activeBackend);
      el.textContent = "Active: " + (p.icon || "") + " " + p.name + " → " + s.activeModel;
    } else {
      el.textContent = "No external backend active";
    }
  }
  function fillExtModelSelect(models) {
    const sel = document.getElementById("extModelSelect");
    if (!sel) return;
    sel.innerHTML = "";
    if (!models || !models.length) {
      const o = document.createElement("option");
      o.value = "";
      o.textContent = "— no models (probe first) —";
      sel.appendChild(o);
      return;
    }
    models.forEach(function (m) {
      const o = document.createElement("option");
      o.value = m;
      o.textContent = m;
      sel.appendChild(o);
    });
  }
  async function refreshExtBackendsList() {
    const box = document.getElementById("extBackendsList");
    if (!box || !window.ExternalLLM) return;
    box.innerHTML = "Probing localhost backends…";
    const probes = await ExternalLLM.probeAll();
    const lines = [];
    ["ollama", "lmstudio", "llamacpp", "custom"].forEach(function (id) {
      const p = probes[id] || {};
      const preset = ExternalLLM.getPreset(id);
      const status = p.online
        ? ('<span style="color:#34d399">● online</span> — ' + (p.models || []).length + ' model(s)')
        : ('<span style="color:#f87171">● offline</span>' + (p.error ? ' <span style="opacity:0.7">(' + p.error + ')</span>' : ''));
      lines.push('<div style="margin:6px 0"><strong>' + (preset.icon || "") + " " + preset.name + "</strong> <code style=\"opacity:0.7\">" + preset.baseUrl + "</code><br>" + status +
        (p.online && p.models && p.models.length ? "<br><span style=\"opacity:0.8\">" + p.models.slice(0, 6).join(", ") + (p.models.length > 6 ? "…" : "") + "</span>" : "") +
        "</div>");
    });
    box.innerHTML = lines.join("");
    const backendSel = document.getElementById("extBackendSelect");
    const id = backendSel ? backendSel.value : "ollama";
    if (probes[id] && probes[id].models) fillExtModelSelect(probes[id].models);
    updateExtActiveLine();
  }
  document.getElementById("extProbeBtn")?.addEventListener("click", function () {
    refreshExtBackendsList();
    if (aiLabOutput) aiLabOutput.textContent = "Probed local backends (Ollama, LM Studio, llama.cpp, custom).";
  });
  document.getElementById("extStatusBtn")?.addEventListener("click", async function () {
    if (!window.LLMBridge) return;
    const r = await LLMBridge.handleLLMCommand("llm status");
    if (aiLabOutput) aiLabOutput.textContent = r.reply || "";
  });
  document.getElementById("extDisconnectBtn")?.addEventListener("click", function () {
    if (!window.ExternalLLM) return;
    ExternalLLM.setActive(null, null);
    updateExtActiveLine();
    if (aiLabOutput) aiLabOutput.textContent = "External backend disconnected.";
  });
  document.getElementById("extBackendSelect")?.addEventListener("change", async function () {
    if (!window.ExternalLLM) return;
    const id = this.value;
    const info = await ExternalLLM.probe(id);
    fillExtModelSelect(info.models || []);
  });
  document.getElementById("extActivateBtn")?.addEventListener("click", async function () {
    if (!window.ExternalLLM) return;
    const backend = document.getElementById("extBackendSelect")?.value || "ollama";
    const model = document.getElementById("extModelSelect")?.value || "";
    const customUrl = document.getElementById("extCustomUrl")?.value;
    if (backend === "custom" && customUrl) ExternalLLM.setCustomBaseUrl(customUrl);
    const info = await ExternalLLM.probe(backend);
    if (!info.online) {
      if (aiLabOutput) aiLabOutput.textContent = ExternalLLM.getPreset(backend).name + " is offline. Start the app/server first.";
      return;
    }
    const useModel = model || (info.models && info.models[0]);
    if (!useModel) {
      if (aiLabOutput) aiLabOutput.textContent = "No model available. For Ollama run: ollama pull llama3.2";
      return;
    }
    ExternalLLM.setActive(backend, useModel);
    updateExtActiveLine();
    if (aiLabOutput) aiLabOutput.textContent = "Activated " + ExternalLLM.getPreset(backend).name + " → " + useModel;
  });
  setTimeout(function () {
    if (window.ExternalLLM) refreshExtBackendsList().catch(function () {});
  }, 800);

function updateLlmStatusLine() {
    const el = document.getElementById("llmStatusLine");
    if (!el || !window.LocalLLM) return;
    const s = LocalLLM.status();
    if (s.ready) el.textContent = "Ready — " + (s.modelId || "model loaded");
    else if (s.loading) el.textContent = "Loading… " + (s.progressText || "");
    else if (s.error) el.textContent = "Error: " + s.error;
    else el.textContent = s.hasWebGPU ? "Local LLM not loaded (WebGPU available)" : "WebGPU not available — local LLM disabled";
  }
  window.addEventListener("localmind-llm-progress", function (ev) {
    const wrap = document.getElementById("llmProgressWrap");
    const bar = document.getElementById("llmProgressBar");
    const txt = document.getElementById("llmProgressText");
    if (wrap) wrap.style.display = "block";
    if (bar) bar.style.width = Math.round((ev.detail.progress || 0) * 100) + "%";
    if (txt) txt.textContent = ev.detail.text || "";
    updateLlmStatusLine();
  });
  window.addEventListener("localmind-llm-ready", function () {
    updateLlmStatusLine();
    const wrap = document.getElementById("llmProgressWrap");
    if (wrap) setTimeout(function () { wrap.style.display = "none"; }, 1500);
  });
  document.getElementById("llmLoadBtn")?.addEventListener("click", async function () {
    if (!window.LocalLLM) return;
    const sel = document.getElementById("llmModelSelect");
    const id = sel ? sel.value : null;
    const wrap = document.getElementById("llmProgressWrap");
    if (wrap) wrap.style.display = "block";
    updateLlmStatusLine();
    const r = await LocalLLM.init(id);
    updateLlmStatusLine();
    if (aiLabOutput) {
      aiLabOutput.textContent = r.ok
        ? ("Local LLM ready: " + r.modelId + (r.cached ? " (cached)" : ""))
        : ("Load failed: " + (r.error || "unknown"));
    }
  });
  document.getElementById("llmUnloadBtn")?.addEventListener("click", async function () {
    if (!window.LocalLLM) return;
    await LocalLLM.unload();
    updateLlmStatusLine();
    if (aiLabOutput) aiLabOutput.textContent = "Local LLM unloaded.";
  });
  document.getElementById("llmStatusBtn")?.addEventListener("click", function () {
    if (!window.LocalLLM) return;
    const s = LocalLLM.status();
    if (aiLabOutput) {
      aiLabOutput.textContent = JSON.stringify({
        ready: s.ready, loading: s.loading, modelId: s.modelId,
        progress: s.progress, progressText: s.progressText,
        hasWebGPU: s.hasWebGPU, error: s.error
      }, null, 2);
    }
    updateLlmStatusLine();
  });

  window.addEventListener("localmind-mm-progress", function (ev) {
    const wrap = document.getElementById("mmProgressWrap");
    const bar = document.getElementById("mmProgressBar");
    const txt = document.getElementById("mmProgressText");
    if (wrap) wrap.style.display = "block";
    if (bar) bar.style.width = Math.round((ev.detail.progress || 0) * 100) + "%";
    if (txt) txt.textContent = ev.detail.text || "";
  });
  document.getElementById("mmLoadBtn")?.addEventListener("click", async function () {
    if (!window.Multimodal) return;
    const wrap = document.getElementById("mmProgressWrap");
    if (wrap) wrap.style.display = "block";
    // force full model load when user explicitly clicks Load (still soft-fails offline)
    const r = await Multimodal.init({ caption: true, vqa: true, force: true, allowOfflineMeta: true });
    if (aiLabOutput) {
      if (r.ok && r.mode === "offline-meta") {
        aiLabOutput.textContent =
          "Offline / CDN blocked — running in metadata-only mode.\n" +
          "Connect to the internet once so Transformers.js + the caption model can download and cache.\n" +
          (r.warning ? "\nDetail: " + r.warning : "");
      } else if (r.ok) {
        aiLabOutput.textContent = "Multimodal ready (mode: " + r.mode + ")";
      } else {
        aiLabOutput.textContent = "Load failed: " + (r.error || "unknown");
      }
    }
    if (wrap && r.ok) setTimeout(function () { wrap.style.display = "none"; }, 1500);
  });
  document.getElementById("mmStatusBtn")?.addEventListener("click", function () {
    if (!window.Multimodal) return;
    if (aiLabOutput) aiLabOutput.textContent = JSON.stringify(Multimodal.status(), null, 2);
  });
  document.getElementById("mmImageInput")?.addEventListener("change", async function (e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file || !window.Multimodal) return;
    const prev = document.getElementById("mmPreview");
    if (prev) {
      prev.innerHTML = "";
      const img = document.createElement("img");
      img.style.maxWidth = "100%";
      img.style.maxHeight = "220px";
      img.style.borderRadius = "8px";
      img.src = URL.createObjectURL(file);
      prev.appendChild(img);
      const p = document.createElement("p");
      p.textContent = "Analyzing…";
      prev.appendChild(p);
    }
    try {
      if (!Multimodal.status().ready) {
        await Multimodal.init({ caption: true, allowOfflineMeta: true });
      }
      const r = await Multimodal.understand(file, "Describe this image in detail.");
      if (prev) {
        const p = prev.querySelector("p");
        if (p) p.textContent = r.answer || r.caption || JSON.stringify(r);
      }
      if (aiLabOutput) {
        aiLabOutput.textContent = (r.answer || r.caption || "") + "\n\nMethod: " + (r.method || "");
      }
    } catch (err) {
      if (prev) {
        const p = prev.querySelector("p");
        if (p) p.textContent = "Failed: " + (err.message || err);
      }
      if (aiLabOutput) aiLabOutput.textContent = "Failed: " + (err.message || err);
    }
  });

  // Chat image input — routes to pending set photo / gallery, else soft multimodal
  document.getElementById("imageInput")?.addEventListener("change", async function (e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    welcome?.remove();
    const sizeKb = Math.round((file.size || 0) / 1024);
    appendMessage("user", "[Image] " + (file.name || "image") + " (" + sizeKb + " KB)");
    sendBtn.disabled = true;

    async function savePending(kind) {
      try {
        if (kind === "profile-photo") {
          if (typeof Profile === "undefined") throw new Error("Profile module missing");
          if (!(file.type || "").startsWith("image/")) throw new Error("Please choose an image file for profile photo.");
          const r = await Profile.setAvatarFromFile(file);
          const av = await Profile.getAvatar();
          appendMessage(
            "assistant",
            "Profile photo saved ✅ (" + (r.width || "?") + "×" + (r.height || "?") + "). Type **`profile`** to see it.",
            "→ Profile photo",
            av && av.dataUrl
              ? { type: "image", dataUrl: av.dataUrl, prompt: "profile photo", message: "Your photo" }
              : null
          );
          return true;
        }
        if (kind === "profile-video") {
          if (typeof Profile === "undefined") throw new Error("Profile module missing");
          const r = await Profile.setVideoFromFile(file);
          const vid = await Profile.getVideo();
          appendMessage(
            "assistant",
            "Profile video saved ✅ (**" + (r.name || file.name) + "**). Type **`profile`** to play it.",
            "→ Profile video",
            vid && vid.dataUrl
              ? {
                  type: "video",
                  dataUrl: vid.dataUrl,
                  videoDataUrl: vid.dataUrl,
                  videoMime: vid.mime || r.mime,
                  videoName: vid.name || r.name,
                  message: "Your profile video"
                }
              : null
          );
          return true;
        }
        if (kind === "gallery-photo" || kind === "gallery-video") {
          if (typeof MediaGallery === "undefined") throw new Error("MediaGallery module missing");
          const r = await MediaGallery.addFromFile(file);
          const item = await MediaGallery.getByIndex(r.count);
          const creative = item ? await MediaGallery.creativeForItem(item) : null;
          appendMessage(
            "assistant",
            "Saved to **media gallery** ✅\n\n• #" + r.count + " **" + (r.name || file.name) +
            "**\n• Type **`gallery`** to browse, or **`gallery show " + r.count + "`**.",
            "→ Gallery",
            creative
          );
          return true;
        }
      } catch (err) {
        appendMessage(
          "assistant",
          "Could not save media: " + (err && err.message ? err.message : err),
          "→ Media error"
        );
        return true; // handled
      }
      return false;
    }

    try {
      const pending = takePendingMedia();
      if (pending) {
        await savePending(pending);
        return;
      }

      // No pending save intent — multimodal / offline soft path
      const online = typeof navigator === "undefined" ? true : !!navigator.onLine;
      if (!online || !window.Multimodal) {
        // Still offer one-tap save into gallery if module exists
        let extra = "";
        if (typeof MediaGallery !== "undefined" && (file.type || "").startsWith("image/")) {
          try {
            const r = await MediaGallery.addFromFile(file);
            extra = "\n\nAlso saved to **gallery** as #" + r.count + " (**" + (r.name || file.name) + "**). Type `gallery`.";
            const item = await MediaGallery.getByIndex(r.count);
            const creative = item ? await MediaGallery.creativeForItem(item) : null;
            appendMessage(
              "assistant",
              "**Image received** ✅\n\n• **File:** " + (file.name || "image") +
              "\n• **Size:** " + sizeKb + " KB" + extra +
              "\n\nTo set as **profile** photo: type `set photo` then pick again, or say `set photo` and use Image within 2 minutes.",
              "→ Image (offline)",
              creative
            );
            return;
          } catch (ge) {
            extra = "\n\n_Gallery save: " + (ge.message || ge) + "_";
          }
        }
        appendMessage(
          "assistant",
          "**Image received** ✅\n\n• **File:** " + (file.name || "image") +
          "\n• **Size:** " + sizeKb + " KB\n\n" +
          "To **save**: type `set photo` or `add photo`, then use the Image button within 2 minutes." + extra,
          "→ Image (offline)"
        );
        return;
      }

      typewriterMessage("assistant", "Understanding image…", "→ Multimodal", null);
      try {
        if (!Multimodal.status().ready) {
          await Multimodal.init({ caption: true, vqa: true, allowOfflineMeta: true });
        }
        const r = await Multimodal.understand(file, "");
        const reply = r.answer || r.caption || ("Image: " + (file.name || "file"));
        const method = r.method || "caption";
        appendMessage("assistant", reply, "→ Multimodal (" + method + ")");
      } catch (err) {
        appendMessage(
          "assistant",
          "**Image received** ✅ (" + sizeKb + " KB). Vision model unavailable.\n\n" +
          "Save with `set photo` / `add photo` then Image button.\n\n_" + (err.message || err) + "_",
          "→ Image (offline)"
        );
      }
    } catch (err) {
      appendMessage("assistant", "Image handling error: " + (err && err.message ? err.message : err), "→ Image error");
    } finally {
      sendBtn.disabled = false;
    }
  });

  // Initial status paint
  setTimeout(updateLlmStatusLine, 400);

  /* Mission Control is provided by SpaceComms and the reasoning router. */

  document.getElementById("aiDiagnoseBtn")?.addEventListener("click", async function(){
    if(!aiLabOutput || !window.LocalAISuite) return;
    aiLabOutput.textContent = "Running diagnostics…";
    try { const rows=await LocalAISuite.diagnostics(); aiLabOutput.textContent=rows.map(x=>(x.ok?"✓ ":"✗ ")+x.name+(x.error?" — "+x.error:"")).join("\n"); } catch(e){ aiLabOutput.textContent="Diagnostics failed: "+e.message; }
  });
  document.getElementById("aiMemoryBtn")?.addEventListener("click", async function(){
    if(!aiLabOutput || !window.LocalAISuite) return;
    try { const rows=await LocalAISuite.all(); const docs=rows.filter(x=>x.kind==='document').length; aiLabOutput.textContent="Offline AI memory\n\nItems: "+rows.length+"\nDocuments: "+docs+"\nIndexed database: IndexedDB\nPersistent: yes"; } catch(e){ aiLabOutput.textContent="Memory check failed: "+e.message; }
  });
  document.getElementById("aiRunAgent")?.addEventListener("click", async function(){
    const task=(aiAgentTask?.value||"").trim(); if(!task||!window.LocalAISuite) return;
    aiLabOutput.textContent="Planning and retrieving local context…";
    try { const r=await LocalAISuite.runAgent(task); aiLabOutput.textContent=r.reply; } catch(e){ aiLabOutput.textContent="Agent failed: "+e.message; }
  });
  aiLabFiles?.addEventListener("change", async function(e){
    if(!window.LocalAISuite) return; const fs=Array.from(e.target.files||[]); if(!fs.length)return;
    aiLabOutput.textContent="Indexing "+fs.length+" file(s)…"; let ok=0,err=[];
    for(const f of fs){try{await LocalAISuite.ingest(f);ok++;}catch(x){err.push(f.name+": "+x.message);}}
    aiLabOutput.textContent="Indexed: "+ok+(err.length?"\nErrors:\n"+err.join("\n"):""); e.target.value="";
  });
  document.getElementById("aiExportBtn")?.addEventListener("click", async function(){
    try {
      if (aiLabOutput) aiLabOutput.textContent = "Preparing AI memory export…";
      let suite = null;
      try {
        if (window.LocalAISuite && LocalAISuite.exportData) suite = await LocalAISuite.exportData();
      } catch (e1) {
        suite = { error: String(e1 && e1.message ? e1.message : e1) };
      }
      let core = null;
      try {
        if (typeof AI !== "undefined" && AI.exportAll) core = AI.exportAll();
      } catch (e2) {
        core = { error: String(e2 && e2.message ? e2.message : e2) };
      }
      let pools = null;
      try {
        if (typeof LMTWallet !== "undefined" && LMTWallet.exportPools) pools = LMTWallet.exportPools();
      } catch (e3) {}
      const data = {
        version: 2,
        exported: new Date().toISOString(),
        suite: suite,
        core: core,
        pools: pools,
        note: "Kanairoex full memory backup (IndexedDB suite + knowledge/chain + token pools)"
      };
      const filename = "localmind-ai-memory.json";
      const result = lmDownloadJSON(data, filename, aiLabOutput);
      const nSuite = (suite && suite.memory && suite.memory.length) || 0;
      const nFacts = (core && core.knowledge && core.knowledge.length) || 0;
      if (aiLabOutput) {
        if (result && result.ok) {
          aiLabOutput.textContent =
            "✓ Download started: " + filename + "\n" +
            "Suite items: " + nSuite + " · Knowledge facts: " + nFacts + "\n" +
            "Method: " + (result.method || "anchor") + "\n" +
            "If nothing saved, check browser download permissions or try a different browser.";
        } else {
          aiLabOutput.textContent = "Export built but download blocked: " + ((result && result.error) || "unknown") +
            "\nTry long-press / check Downloads folder.";
        }
      }
    } catch (e) {
      if (aiLabOutput) aiLabOutput.textContent = "Export failed: " + (e && e.message ? e.message : e);
      console.error(e);
    }
  });

  // Central navigation function. All current and dynamically-created navigation
  // buttons use this so no panel can remain visible after switching views.
  window.KanairoexNavigate = function (panel, button) {
    document.querySelectorAll(".nav-btn").forEach(function (b) {
      b.classList.toggle("active", b === button || b.dataset.panel === panel);
    });
    document.querySelectorAll(".panel").forEach(function (p) {
      p.classList.remove("active");
      p.setAttribute("aria-hidden", "true");
    });
    const targetPanel = document.getElementById("panel-" + panel);
    if (targetPanel) {
      targetPanel.classList.add("active");
      targetPanel.setAttribute("aria-hidden", "false");
    }
    if (panelTitle) {
      const label = button ? button.textContent.replace(/^[^\s]+\s*/, "") : panel;
      panelTitle.textContent = label;
    }
    sidebar?.classList.remove("open");
    if (panel === "chat") {
      chatFollowBottom = true;
      chatScrollBottom(true);
    }

    if (panel === "knowledge" && typeof renderKnowledge === "function") renderKnowledge();
    if (panel === "blockchain" && typeof renderBlockchain === "function") renderBlockchain();
    if (panel === "neurons" && typeof renderNeurons === "function") renderNeurons();
    if (panel === "settings" && typeof loadSettingsUI === "function") loadSettingsUI();
  };

  // One delegated navigation handler. This also covers navigation buttons created later.
  // Keeping a single handler prevents duplicate panel switches and scroll jumps.
  document.addEventListener("click", function (event) {
    const btn = event.target.closest && event.target.closest(".nav-btn");
    if (!btn || !btn.dataset.panel) return;
    window.KanairoexNavigate(btn.dataset.panel, btn);
  });

  // Auto-resize textarea
  userInput.addEventListener("input", () => {
    userInput.style.height = "auto";
    userInput.style.height = Math.min(userInput.scrollHeight, 160) + "px";
  });


  function downloadJSONObject(filename, data) {
    try {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || "localmind-export.json";
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        try { document.body.removeChild(a); URL.revokeObjectURL(url); } catch (_) {}
      }, 500);
      return true;
    } catch (e) {
      console.warn("downloadJSONObject", e);
      return false;
    }
  }


  // When user types set photo / add photo, then uses Image button instead of the system picker
  window.__lmPendingMedia = window.__lmPendingMedia || null;
  function setPendingMedia(kind) {
    window.__lmPendingMedia = { kind: kind, ts: Date.now() };
  }
  function takePendingMedia() {
    const p = window.__lmPendingMedia;
    window.__lmPendingMedia = null;
    if (!p || !p.kind) return null;
    if (Date.now() - (p.ts || 0) > 120000) return null; // 2 min window
    return p.kind;
  }

  // Send message
  async function sendMessage(text) {
    text = text == null ? "" : String(text);
    if (!text.trim()) return;
    welcome?.remove();
    chatFollowBottom = true;

    appendMessage("user", text);
    userInput.value = "";
    userInput.style.height = "auto";
    sendBtn.disabled = true;

    const requestStartedAt = Date.now();
    let requestFinished = false;
    const unlockWatchdog = setTimeout(function () {
      if (!requestFinished && sendBtn) {
        sendBtn.disabled = false;
        sendBtn.title = "Recovered from a slow operation. You can continue using Kanairoex.";
      }
    }, 30000);

    setTimeout(async () => {
      try {
        let result = AI.process(text);

        // Advanced tech / Local LLM / Multimodal async commands
        if (result && result._advancedPromise) {
          try {
            const adv = await result._advancedPromise;
            const emptyReply = !adv || adv.reply == null || String(adv.reply).trim() === "";
            // Fall back to classic engine when advanced path has nothing useful
            if (!adv || adv._fallbackClassic || (emptyReply && !adv.error && !adv._pickP2PFile && !adv._downloadJSON && !adv._pickProfilePhoto && !adv._pickProfileVideo && !adv._pickGalleryPhoto && !adv._pickGalleryVideo)) {
              result = AI.process(text, { _skipLLM: true });
            } else if (adv.error && emptyReply) {
              result = {
                thinking: (adv.thinking) || result.thinking || "→ Advanced technology",
                reply: "Error: " + adv.error,
                creative: null
              };
            } else {
              result = {
                thinking: (adv.thinking) || result.thinking || "→ Advanced technology",
                reply: adv.reply != null ? String(adv.reply) : "",
                creative: adv.creative || null,
                source: adv.source || null,
                _pickP2PFile: !!adv._pickP2PFile,
                _pickProfilePhoto: !!adv._pickProfilePhoto,
                _pickProfileVideo: !!adv._pickProfileVideo,
                _pickGalleryPhoto: !!adv._pickGalleryPhoto,
                _pickGalleryVideo: !!adv._pickGalleryVideo
              };
              if (adv._downloadJSON && adv._downloadJSON.data) {
                try {
                  downloadJSONObject(
                    adv._downloadJSON.filename || "localmind-export.json",
                    adv._downloadJSON.data
                  );
                  result.reply = (result.reply || "") + "\n\n_Download started (JSON)._";
                } catch (_) {}
              }
              try {
                const history = AI.loadHistory();
                history.push({ role: "user", content: text, ts: Date.now() });
                history.push({
                  role: "assistant",
                  content: result.reply,
                  thinking: result.thinking,
                  ts: Date.now()
                });
                AI.saveHistory(history);
              } catch (_) {}
            }
          } catch (err) {
            result = {
              thinking: "→ Advanced technology error",
              reply: "Advanced command failed: " + (err && err.message ? err.message : err),
              creative: null
            };
          }
        }

        // Mic speech → text → re-process as user message
        if (result && result._listenPromise) {
          try {
            typewriterMessage("assistant", "Listening… speak now.", result.thinking, null);
            const heard = await result._listenPromise;
            if (heard && String(heard).trim()) {
              result = {
                thinking: "→ Speech recognized",
                reply: "Heard: **" + heard + "**\n\n_Processing…_",
                creative: null
              };
              // Continue as if user typed the transcript
              setTimeout(function () { sendMessage(String(heard).trim()); }, 400);
            } else {
              result = { thinking: "→ Speech", reply: "No speech detected.", creative: null };
            }
          } catch (err) {
            result = {
              thinking: "→ Speech error",
              reply: "Speech failed: " + (err && err.message ? err.message : err),
              creative: null
            };
          }
        }

        // P2P file picker
        if (result && result._pickP2PFile) {
          const input = document.getElementById("p2pFileInput");
          if (!input) {
            result = { thinking: result.thinking, reply: "P2P file input missing in UI.", creative: null };
          } else {
            typewriterMessage("assistant", result.reply || "Choose a file…", result.thinking, null);
            await new Promise(function (resolve) {
              const onChange = async function (e) {
                input.removeEventListener("change", onChange);
                const file = e.target.files && e.target.files[0];
                input.value = "";
                if (!file) {
                  result = { thinking: "→ P2P file", reply: "No file selected.", creative: null };
                  resolve();
                  return;
                }
                try {
                  const r = await WebRTCPeer.sendFile(file);
                  result = {
                    thinking: "→ P2P file send",
                    reply: "Sent **" + r.name + "** (" + r.size + " bytes) over P2P.\nImages, videos, and any file type are supported when the channel is open.",
                    creative: null
                  };
                } catch (err) {
                  result = {
                    thinking: "→ P2P file error",
                    reply: "File send failed: " + (err && err.message ? err.message : err),
                    creative: null
                  };
                }
                resolve();
              };
              input.addEventListener("change", onChange);
              input.click();
            });
          }
        }

        // Profile photo / video pickers (remember media like we remember name)
        if (result && (result._pickProfilePhoto || result._pickProfileVideo)) {
          const wantPhoto = !!result._pickProfilePhoto;
          setPendingMedia(wantPhoto ? "profile-photo" : "profile-video");
          const input = document.createElement("input");
          input.type = "file";
          input.accept = wantPhoto ? "image/*" : "video/*";
          input.style.display = "none";
          document.body.appendChild(input);
          typewriterMessage("assistant", result.reply || (wantPhoto ? "Choose a photo…" : "Choose a video…"), result.thinking, null);
          await new Promise(function (resolve) {
            const onChange = async function (e) {
              input.removeEventListener("change", onChange);
              const file = e.target.files && e.target.files[0];
              try { document.body.removeChild(input); } catch (_) {}
              if (!file) {
                result = { thinking: "→ Profile media", reply: "No file selected.", creative: null };
                resolve();
                return;
              }
              try {
                if (typeof Profile === "undefined") throw new Error("Profile module not loaded.");
                if (wantPhoto) {
                  const r = await Profile.setAvatarFromFile(file);
                  const av = await Profile.getAvatar();
                  window.__lmPendingMedia = null;
                  result = {
                    thinking: "→ Profile photo saved",
                    reply: "Profile photo saved ✅ (" + (r.width || "?") + "×" + (r.height || "?") + "). Type **`profile`** to see it. It is included when you `share profile`.",
                    creative: av && av.dataUrl ? { type: "image", dataUrl: av.dataUrl, prompt: "profile photo", message: "Your photo" } : null
                  };
                } else {
                  const r = await Profile.setVideoFromFile(file);
                  const vid = await Profile.getVideo();
                  result = {
                    thinking: "→ Profile video saved",
                    reply:
                      "Profile video saved ✅ (**" + (r.name || "video") + "**, " +
                      Math.round((r.size || 0) / 1024) + " KB).\n\n" +
                      "Play it below, or type **`profile`** anytime to see photo + video. " +
                      "`share profile` sends name/photo/bio; use `p2p file` to send the clip.",
                    creative: vid && vid.dataUrl
                      ? {
                          type: "video",
                          dataUrl: vid.dataUrl,
                          videoDataUrl: vid.dataUrl,
                          videoMime: vid.mime || r.mime || "video/mp4",
                          videoName: vid.name || r.name || "profile-video",
                          message: "Your profile video"
                        }
                      : null
                  };
                }
              } catch (err) {
                result = {
                  thinking: "→ Profile media error",
                  reply: "Could not save: " + (err && err.message ? err.message : err),
                  creative: null
                };
              }
              resolve();
            };
            input.addEventListener("change", onChange);
            input.click();
          });
        }

        // Media gallery photo / video pickers (multi-item memory)
        if (result && (result._pickGalleryPhoto || result._pickGalleryVideo)) {
          const wantPhoto = !!result._pickGalleryPhoto;
          setPendingMedia(wantPhoto ? "gallery-photo" : "gallery-video");
          const input = document.createElement("input");
          input.type = "file";
          input.accept = wantPhoto ? "image/*" : "video/*";
          input.style.display = "none";
          document.body.appendChild(input);
          typewriterMessage(
            "assistant",
            result.reply || (wantPhoto ? "Choose a gallery photo…" : "Choose a gallery video…"),
            result.thinking,
            null
          );
          await new Promise(function (resolve) {
            const onChange = async function (e) {
              input.removeEventListener("change", onChange);
              const file = e.target.files && e.target.files[0];
              try { document.body.removeChild(input); } catch (_) {}
              if (!file) {
                result = { thinking: "→ Gallery", reply: "No file selected.", creative: null };
                resolve();
                return;
              }
              try {
                if (typeof MediaGallery === "undefined") throw new Error("MediaGallery module not loaded.");
                const r = await MediaGallery.addFromFile(file);
                window.__lmPendingMedia = null;
                const item = await MediaGallery.getByIndex(r.count);
                const creative = item ? await MediaGallery.creativeForItem(item) : null;
                result = {
                  thinking: "→ Gallery " + (r.kind || "media") + " saved",
                  /* pending cleared below */
                  reply:
                    "Saved to **media gallery** ✅\n\n" +
                    "• #" + r.count + " **" + (r.name || file.name) + "** (" + (r.kind || "") + ")\n" +
                    "• Size: " + MediaGallery.formatBytes(r.size || file.size || 0) +
                    (r.width ? " · " + r.width + "×" + r.height : "") + "\n\n" +
                    "Type **`gallery`** to browse all, or **`gallery show " + r.count + "`** to open this one.",
                  creative: creative
                };
              } catch (err) {
                result = {
                  thinking: "→ Gallery error",
                  reply: "Could not save to gallery: " + (err && err.message ? err.message : err),
                  creative: null
                };
              }
              resolve();
            };
            input.addEventListener("change", onChange);
            input.click();
          });
        }

        // SYNC NOW
        if (result && result.syncNow && typeof OfflineAssistant !== "undefined") {
          try {
            const syncResult = await OfflineAssistant.syncNow();
            result = { thinking: "→ SYNC NOW", reply: syncResult.message, creative: null };
          } catch (err) {
            result = { thinking: "→ SYNC NOW failed", reply: "Sync failed: " + (err.message || err), creative: null };
          }
        }

        // Video search path — also recover from legacy/stale reasoning markers so an old cached reasoning.js cannot leave VIDEO_SEARCH on screen.
        if (result && !result.videoSearch && typeof VideoResearch !== "undefined" && typeof result.reply === "string" && /^VIDEO_SEARCH:/i.test(result.reply)) {
          result.videoSearch = { query: result.reply.replace(/^VIDEO_SEARCH:/i, "").trim() };
        }
        if (result && result.videoSearch && typeof VideoResearch !== "undefined") {
          const vi = result.videoSearch;
          try {
            const vd = await VideoResearch.search(vi.query, 8);
            VideoResearch.saveMetadata(vd);
            result = { thinking: "→ Searching video sources\n→ Collecting results\n→ Saving video metadata to offline memory", reply: "Found **" + vd.videos.length + " videos** for **" + vd.query + "**.\n\nVideo metadata and links have been saved to LocalMind memory.\n\nYou can watch the videos below.", creative: { type: "video-search", items: vd.videos } };
          } catch (err) {
            const fallbackUrl = err && err.searchUrl;
            result = {
              thinking: "→ Video search failed on public API instances",
              reply: "I couldn't retrieve video cards from the public video-search services right now." +
                (fallbackUrl ? "\n\nYou can still open the video search directly below." : "\n\nTry again while online."),
              creative: fallbackUrl ? { type: "video-search-fallback", url: fallbackUrl, query: vi.query } : null
            };
          }
        }

        // Image search path — people, animals, cars, planes, objects, etc. (Openverse + Wikimedia)
        if (result && !result.imageSearch && typeof ImageResearch !== "undefined" && typeof result.reply === "string" && /^IMAGE_SEARCH:/i.test(result.reply)) {
          result.imageSearch = { query: result.reply.replace(/^IMAGE_SEARCH:/i, "").trim() };
        }
        if (result && result.imageSearch && typeof ImageResearch !== "undefined") {
          const ii = result.imageSearch;
          try {
            const idata = await ImageResearch.search(ii.query, 12);
            ImageResearch.saveMetadata(idata);
            result = {
              thinking: "→ Searching image sources (Openverse, Wikimedia)\n→ Collecting Creative Commons results\n→ Saving image metadata to offline memory",
              reply:
                "Found **" + idata.images.length + " images** for **" + idata.query + "**.\n\n" +
                "Sources: " + (idata.sources || []).join(", ") + ".\n" +
                "Licenses are typically Creative Commons / public domain — check each source before reuse.\n\n" +
                "Thumbnails below; open full image or original source.",
              creative: { type: "image-search", items: idata.images, query: idata.query }
            };
          } catch (err) {
            const fallbackUrl = err && err.searchUrl;
            result = {
              thinking: "→ Image search failed on public API instances",
              reply:
                "I couldn't retrieve image cards from the public image-search services right now." +
                (fallbackUrl ? "\n\nYou can still browse Wikimedia Commons below." : "\n\nTry again while online.") +
                "\n\n_If this keeps failing after a deploy: hard-refresh the site (clear site data) so the new image-research.js loads._",
              creative: fallbackUrl ? { type: "image-search-fallback", url: fallbackUrl, query: ii.query } : null
            };
          }
        }

        // GitHub code research: public repositories/files, snippets, license and source links.
        if (result && result.githubCodeSearch && typeof GitHubCodeResearch !== "undefined") {
          const gi = result.githubCodeSearch;
          try {
            const gd = await GitHubCodeResearch.search(gi.query, 6);
            GitHubCodeResearch.save(gd);
            if (!gd.results || !gd.results.length) {
              const ghUrl = 'https://github.com/search?q=' + encodeURIComponent(gd.query || gi.query) + '&type=repositories';
              result = {
                thinking: '→ Searching GitHub\n→ No public matches for this query',
                reply: 'Found **0 GitHub results** for **' + (gd.query || gi.query) + '**.\n\nTry a shorter query (e.g. `website`, `portfolio`, `react app`) or open GitHub search directly.',
                creative: { type: 'github-code-search-fallback', url: ghUrl, query: gd.query || gi.query }
              };
            } else {
              const lines = gd.results.map(function(r, i) {
                return (i + 1) + '. **' + (r.repo || r.name) + '**' + (r.path ? ' — `' + r.path + '`' : '') +
                  '\nLanguage: ' + (r.language || 'unknown') + ' · License: ' + (r.license || 'not reported') +
                  '\nSource: ' + (r.htmlUrl || r.repoUrl) + (r.snippet ? '\n\n```' + (r.language || '') + '\n' + r.snippet + '\n```' : (r.description ? '\n' + r.description : ''));
              }).join('\n\n');
              result = { thinking: '→ Searching GitHub\n→ Ranking public code results\n→ Fetching available source snippets\n→ Saving code research to offline memory', reply: 'Found **' + gd.results.length + ' GitHub results** for **' + gd.query + '**.\n\n' + lines + '\n\n✓ GitHub research saved to offline memory.', creative: { type: 'github-code-search', items: gd.results } };
            }
          } catch (err) {
            const ghUrl = 'https://github.com/search?q=' + encodeURIComponent(gi.query) + '&type=repositories';
            result = { thinking: '→ GitHub code research failed', reply: 'GitHub code search failed: ' + (err.message || err) + '\n\nTry again while online. Unauthenticated GitHub API has low rate limits.\n\nYou can still search on GitHub directly.', creative: { type: 'github-code-search-fallback', url: ghUrl, query: gi.query } };
          }
        }

        // Encyclopaedia Britannica / Oxford reference research.
        if (result && result.referenceSearch && typeof ReferenceResearch !== "undefined") {
          const ri = result.referenceSearch;
          try {
            const rd = await ReferenceResearch.search(ri.query, ri.type);
            ReferenceResearch.save(rd);
            result = { thinking: '→ Consulting reference sources\n→ Comparing public knowledge with the requested reference\n→ Saving reference research to offline memory', reply: String(rd.content || '') + '\n\n✓ Reference research saved to offline memory.\nSources:\n' + (rd.sources || []).map(function(x){ return '• ' + x.name + ' — ' + x.url; }).join('\n'), creative: { type: 'reference-search', officialUrl: rd.officialUrl, title: rd.title, sources: rd.sources || [] } };
          } catch (err) {
            result = { thinking: '→ Reference lookup failed', reply: 'Reference lookup failed: ' + (err.message || err), creative: null };
          }
        }

        // Online fetch path (deep multi-source research)
        if (result && result.online && typeof Online !== "undefined") {
          const oi = result.online;
          const thinkingLines = [
            "Connecting online…",
            "Gathering full article + web sources for: " + oi.query,
            "Wikipedia (full text) + DuckDuckGo Instant Answer…",
            "Storing complete result into offline memory…"
          ];
          try {
            let data;
            if (oi.type === "url") {
              data = await Online.learnUrl(oi.query);
            } else if (typeof ResearchManager !== "undefined") {
              data = await ResearchManager.research(oi.query, function(p) {
                try {
                  if (p && p.stage === "source") thinkingLines.push("Source " + p.index + ": " + (p.title || "research"));
                  if (p && p.stage === "warning") thinkingLines.push("Skipped: " + (p.title || "source"));
                } catch (_) {}
              });
              Online.storeInMemory(data.title || oi.query, data.content || data.extract || "", (data.sources && data.sources[0] && data.sources[0].url) || "online research");
              if (typeof OfflineAssistant !== "undefined" && OfflineAssistant.saveStructured) OfflineAssistant.saveStructured(data.title || oi.query, (data.content || ""), (data.sources && data.sources[0] && data.sources[0].url) || "online", 90);
              if (Array.isArray(data.chunks)) data.chunks.forEach(function(ch, idx) {
                Online.storeInMemory((data.title || oi.query) + " — research part " + (idx + 1), ch.text || "", (data.sources && data.sources[0] && data.sources[0].url) || "online research");
              });
            } else {
              data = await Online.learnTopic(oi.query);
            }
            if (typeof OfflineAssistant !== "undefined") {
              OfflineAssistant.saveStructured(
                data.title || oi.query,
                (data.content || data.extract || "").slice(0, 2000),
                data.url || "online",
                30
              );
              OfflineAssistant.addWatch(data.title || oi.query);
              try { localStorage.setItem("localmind_last_sync", new Date().toISOString()); } catch(e) {}
            }
            const body = String(data.content || data.extract || "").slice(0, 120000);
            const srcLine = (data.sources && data.sources.length)
              ? data.sources.map(function (s) { return s.name + (s.url ? " — " + s.url : ""); }).join("\n")
              : (data.url || "online");
            const chars = data.chars || body.length;
            let natural = body;
            if (typeof SpeakGen !== "undefined" && SpeakGen.compose) {
              try {
                const composed = SpeakGen.compose(oi.query, [{ subject: data.title || oi.query, content: (data.summary || body).slice(0, 1200) }], { text: body.slice(0, 2000) });
                natural = composed.text + "\n\n---\nSaved offline (~" + chars + " chars). Sources:\n" + srcLine;
              } catch (e) {
                natural = body;
              }
            }
            result = {
              thinking: thinkingLines.map(function (t) { return "→ " + t; }).join("\n"),
              reply: natural + (chars > 120000 ? "\n\n…The complete research is stored in offline memory." : "\n\n✓ Complete research saved to offline memory."),
              creative: null
            };
          } catch (err) {
            result = {
              thinking: thinkingLines.map(function (t) { return "→ " + t; }).join("\n"),
              reply:
                "Online fetch failed: " + (err.message || err) +
                "\n\nTips:\n• Exact form: **look up photosynthesis**\n" +
                "• Check status: **online status**\n" +
                "• Site must be HTTPS (GitHub Pages is fine)\n" +
                "• Hard-refresh (Ctrl+Shift+R) so the new `online.js` loads\n" +
                "• Allow network to **en.wikipedia.org**\n" +
                "• Or teach offline: **Remember that …**",
              creative: null
            };
          }
        }

        // Strip ONLINE_FETCH marker if present
        if (result && result.reply && result.reply.indexOf("ONLINE_FETCH:") === 0) {
          result.reply = "Starting online lookup…";
        }

        if (result && result.reply != null) {
          typewriterMessage("assistant", String(result.reply), result.thinking, result.creative);
        } else if (result && result.reply == null && !result._advancedPromise) {
          appendMessage("assistant", "(No reply generated.)");
          sendBtn.disabled = false;
        } else {
          sendBtn.disabled = false;
        }
      } catch (e) {
        console.error("Send handler error", e);
        appendMessage("assistant", "Error: " + (e && e.message ? e.message : e));
        sendBtn.disabled = false;
      } finally {
        requestFinished = true;
        clearTimeout(unlockWatchdog);
        if (sendBtn && (Date.now() - requestStartedAt) > 30000) sendBtn.disabled = false;
        updateStats();
        userInput.focus();
      }
    }, 120);
  }



  function downloadDataUrl(dataUrl, filename) {
    try {
      const parts = String(dataUrl).split(",");
      const mime = (parts[0].match(/:(.*?);/) || [])[1] || "image/png";
      const bin = atob(parts[1] || "");
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const blob = new Blob([arr], { type: mime });
      if (typeof lmDownloadBlob === "function") {
        lmDownloadBlob(blob, filename || "localmind-image.png");
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || "localmind-image.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = filename || "localmind-image.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  }


  function buildThinkingPanel(thinking) {
    const lines = String(thinking || "").split(/\n/).map(function (l) {
      return l.replace(/^→\s*/, "").trim();
    }).filter(Boolean);

    const wrap = document.createElement("div");
    wrap.className = "think-panel thinking-live";

    const header = document.createElement("button");
    header.type = "button";
    header.className = "think-header";
    header.setAttribute("aria-expanded", "true");

    const chevron = document.createElement("span");
    chevron.className = "think-chevron";
    chevron.textContent = "▾";

    const title = document.createElement("span");
    title.className = "think-title";
    title.textContent = "Thinking…";

    const timer = document.createElement("span");
    timer.className = "think-timer";
    timer.textContent = "";

    header.appendChild(chevron);
    header.appendChild(title);
    header.appendChild(timer);
    wrap.appendChild(header);

    const body = document.createElement("div");
    body.className = "think-body";
    wrap.appendChild(body);

    const t0 = Date.now();
    let done = false;
    let tickId = null;

    function fmtElapsed() {
      const s = (Date.now() - t0) / 1000;
      if (s < 60) return s.toFixed(1) + "s";
      const m = Math.floor(s / 60);
      const r = Math.floor(s % 60);
      return m + "m " + r + "s";
    }

    // No live counting — timer only set once when thinking finishes

    header.addEventListener("click", function () {
      const open = wrap.classList.toggle("collapsed");
      header.setAttribute("aria-expanded", open ? "false" : "true");
      chevron.textContent = open ? "▸" : "▾";
    });

    let li = 0;
    function addStep(text, kind) {
      const row = document.createElement("div");
      row.className = "think-step think-step-" + (kind || "default");
      const icon = document.createElement("span");
      icon.className = "think-icon";
      if (kind === "done") icon.textContent = "✓";
      else if (kind === "run") icon.textContent = "⚙";
      else if (kind === "idea") icon.textContent = "💡";
      else icon.textContent = "•";
      const label = document.createElement("span");
      label.className = "think-label";
      label.textContent = text;
      row.appendChild(icon);
      row.appendChild(label);
      body.appendChild(row);
      return row;
    }

    function finish() {
      done = true;
      if (tickId) clearTimeout(tickId);
      tickId = null;
      const elapsed = fmtElapsed();
      title.textContent = "Thought for " + elapsed;
      timer.textContent = elapsed; // final duration only — no further counting
      wrap.classList.remove("thinking-live");
      wrap.classList.add("think-done");
      // auto-collapse after a moment
      setTimeout(function () {
        wrap.classList.add("collapsed");
        chevron.textContent = "▸";
        header.setAttribute("aria-expanded", "false");
      }, 1200);
    }

    function runSteps(onDone) {
      if (li < lines.length) {
        const line = lines[li];
        let kind = "idea";
        if (/fetch|online|lookup|search|load/i.test(line)) kind = "run";
        if (/generat|build|code|map|draw/i.test(line)) kind = "run";
        if (/error|fail/i.test(line)) kind = "default";
        addStep(line, kind);
        if (typeof Neurons !== "undefined") {
          try {
            const lab = "think:" + line.slice(0, 20);
            Neurons.activate(lab, 1);
            if (li > 0 && Neurons.coActivate) {
              Neurons.coActivate(["think:" + (lines[li - 1] || "").slice(0, 20), lab], 1);
            }
          } catch (e) {}
        }
        li++;
        const chatContainer = document.getElementById("chatContainer");
        if (chatContainer) chatScrollBottom(false);
        setTimeout(function () { runSteps(onDone); }, 380 + Math.random() * 320);
      } else {
        addStep("Answer ready", "done");
        finish();
        if (onDone) onDone();
      }
    }

    return {
      el: wrap,
      lines: lines,
      runSteps: runSteps,
      finish: finish,
      durationMs: function () {
        return Math.min(12000, 500 + lines.length * 500);
      }
    };
  }

  function typewriterMessage(role, content, thinking, creative) {
    const msg = document.createElement("div");
    msg.className = "message " + role;

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = role === "user" ? "👤" : "🧠";

    const bubble = document.createElement("div");
    bubble.className = "bubble";

    let thinkPanel = null;
    if (thinking && role === "assistant") {
      thinkPanel = buildThinkingPanel(thinking);
      bubble.appendChild(thinkPanel.el);
    }

    const textSpan = document.createElement("span");
    textSpan.className = "typewriter-text";
    bubble.appendChild(textSpan);

    msg.appendChild(avatar);
    msg.appendChild(bubble);
    chatContainer.appendChild(msg);
    chatFollowBottom = true;
    chatScrollBottom(true);

    // Type after thinking panel finishes
    let i = 0;
    const plain = content == null ? "" : String(content);
    const speed = plain.length > 8000 ? 1 : plain.length > 4000 ? 3 : 8 + Math.random() * 8;

    function type() {
      if (!plain.length) {
        textSpan.textContent = "";
        sendBtn.disabled = false;
        return;
      }
      if (i < plain.length) {
        // type a small chunk for speed
        let chunkSize = plain.length > 8000 ? 32 : plain.length > 4000 ? 12 : 2;
        // Avoid splitting emoji surrogate pairs
        let end = Math.min(plain.length, i + chunkSize);
        if (end < plain.length) {
          const c = plain.charCodeAt(end - 1);
          if (c >= 0xd800 && c <= 0xdbff) end++; // include low surrogate
        }
        const chunk = plain.slice(i, end);
        textSpan.textContent += chunk;
        i += chunk.length;
        chatScrollBottom(false);
        setTimeout(type, speed);
      } else {
        // finished – full Markdown + optional KaTeX
        if (typeof Markdown !== "undefined" && Markdown.renderInto) {
          Markdown.renderInto(textSpan, plain).catch(() => {
            textSpan.textContent = plain;
          });
        } else {
          let html = plain
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
            .replace(/`([^`]+)`/g, "<code>$1</code>")
            .replace(/\n/g, "<br>");
          textSpan.innerHTML = html;
        }

        if (creative && role === "assistant") {
          renderCreative(bubble, creative);
        }
        sendBtn.disabled = false;
      }
    }
    if (thinkPanel) {
      thinkPanel.runSteps(function () { setTimeout(type, 200); });
    } else {
      type();
    }
  }

  function renderCreative(bubble, creative) {
    if (creative.type === "video-search" && Array.isArray(creative.items)) {
      const grid=document.createElement("div");
      grid.style.cssText="margin-top:12px;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;";
      creative.items.forEach(function(v){
        const card=document.createElement("div"); card.style.cssText="border:1px solid var(--border);border-radius:12px;overflow:hidden;background:#0a0c10;";
        if(v.thumbnail){ const img=document.createElement("img"); img.src=v.thumbnail; img.alt=v.title||"video"; img.loading="lazy"; img.style.cssText="width:100%;height:130px;object-fit:cover;display:block;"; card.appendChild(img); }
        const body=document.createElement("div"); body.style.cssText="padding:10px;display:flex;flex-direction:column;gap:7px;";
        const title=document.createElement("div"); title.textContent=v.title||"Video"; title.style.cssText="font-weight:600;line-height:1.3;"; body.appendChild(title);
        if(v.uploader){const u=document.createElement("div");u.textContent=v.uploader;u.style.cssText="font-size:12px;opacity:.7;";body.appendChild(u);}
        const row=document.createElement("div");row.style.cssText="display:flex;gap:7px;flex-wrap:wrap;";
        const watch=document.createElement("button");watch.className="btn primary";watch.textContent="▶ Watch";watch.onclick=function(){ window.open(v.url,"_blank","noopener,noreferrer"); };row.appendChild(watch);
        if(v.embed){const emb=document.createElement("button");emb.className="btn secondary";emb.textContent="▣ Play here";emb.onclick=function(){ const frame=document.createElement("iframe"); frame.src=v.embed; frame.title=v.title||"Video"; frame.allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"; frame.allowFullscreen=true; frame.style.cssText="width:100%;height:220px;border:0;border-radius:8px;margin-top:7px;"; if(!card.querySelector("iframe")) card.appendChild(frame); };row.appendChild(emb);}
        body.appendChild(row); card.appendChild(body); grid.appendChild(card);
      });
      bubble.appendChild(grid);
      const note=document.createElement("div"); note.textContent="Video links are saved to LocalMind memory. Videos are not automatically copied unless the source explicitly provides a permitted downloadable file."; note.style.cssText="font-size:12px;opacity:.7;margin-top:8px;"; bubble.appendChild(note);
    }

    if (creative.type === "image-search" && Array.isArray(creative.items)) {
      const grid = document.createElement("div");
      grid.style.cssText = "margin-top:12px;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;";
      creative.items.forEach(function (img) {
        const card = document.createElement("div");
        card.style.cssText = "border:1px solid var(--border);border-radius:12px;overflow:hidden;background:#0a0c10;";
        const src = img.thumbnail || img.url;
        if (src) {
          const el = document.createElement("img");
          el.src = src;
          el.alt = img.title || "image";
          el.loading = "lazy";
          el.referrerPolicy = "no-referrer";
          el.style.cssText = "width:100%;height:140px;object-fit:cover;display:block;background:#111;";
          el.onerror = function () {
            el.style.display = "none";
          };
          card.appendChild(el);
        }
        const body = document.createElement("div");
        body.style.cssText = "padding:10px;display:flex;flex-direction:column;gap:6px;";
        const title = document.createElement("div");
        title.textContent = img.title || "Image";
        title.style.cssText = "font-weight:600;line-height:1.3;font-size:13px;";
        body.appendChild(title);
        if (img.creator) {
          const c = document.createElement("div");
          c.textContent = img.creator;
          c.style.cssText = "font-size:11px;opacity:.7;";
          body.appendChild(c);
        }
        if (img.license) {
          const lic = document.createElement("div");
          lic.textContent = img.license;
          lic.style.cssText = "font-size:10px;opacity:.6;";
          body.appendChild(lic);
        }
        const row = document.createElement("div");
        row.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;";
        if (img.url || img.thumbnail) {
          const openBtn = document.createElement("button");
          openBtn.className = "btn primary";
          openBtn.textContent = "Open";
          openBtn.onclick = function () {
            window.open(img.url || img.thumbnail, "_blank", "noopener,noreferrer");
          };
          row.appendChild(openBtn);
        }
        if (img.sourceUrl) {
          const srcBtn = document.createElement("button");
          srcBtn.className = "btn secondary";
          srcBtn.textContent = "Source";
          srcBtn.onclick = function () {
            window.open(img.sourceUrl, "_blank", "noopener,noreferrer");
          };
          row.appendChild(srcBtn);
        }
        body.appendChild(row);
        card.appendChild(body);
        grid.appendChild(card);
      });
      bubble.appendChild(grid);
      const note = document.createElement("div");
      note.textContent =
        "Image metadata is saved to LocalMind memory. Prefer checking the license on the source page before downloading or reusing.";
      note.style.cssText = "font-size:12px;opacity:.7;margin-top:8px;";
      bubble.appendChild(note);
    }

    if (creative.type === "image-search-fallback" && creative.url) {
      const row = document.createElement("div");
      row.style.cssText = "margin-top:12px;display:flex;flex-direction:column;gap:8px;";
      const btn = document.createElement("button");
      btn.className = "btn primary";
      btn.textContent = "Open Wikimedia image search";
      btn.onclick = function () {
        window.open(creative.url, "_blank", "noopener,noreferrer");
      };
      row.appendChild(btn);
      const note = document.createElement("div");
      note.style.cssText = "font-size:12px;opacity:.7;";
      note.textContent =
        "Public image APIs were unavailable. LocalMind will try Openverse / Wikimedia again next time.";
      row.appendChild(note);
      bubble.appendChild(row);
    }

    if (creative.type === "github-code-search" && Array.isArray(creative.items)) {
      const wrap=document.createElement("div"); wrap.style.cssText="margin-top:12px;display:flex;flex-direction:column;gap:10px;";
      creative.items.forEach(function(r){
        const card=document.createElement("div"); card.style.cssText="border:1px solid var(--border);border-radius:12px;padding:10px;background:#0a0c10;";
        const title=document.createElement("div"); title.textContent=(r.repo||r.name)+(r.path?" — "+r.path:""); title.style.cssText="font-weight:700;"; card.appendChild(title);
        const meta=document.createElement("div"); meta.textContent=(r.language||"unknown")+" · License: "+(r.license||"not reported"); meta.style.cssText="font-size:12px;opacity:.72;margin:4px 0;"; card.appendChild(meta);
        const row=document.createElement("div"); row.style.cssText="display:flex;gap:7px;flex-wrap:wrap;";
        if(r.htmlUrl||r.repoUrl){const b=document.createElement("button");b.className="btn primary";b.textContent="Open GitHub";b.onclick=function(){window.open(r.htmlUrl||r.repoUrl,"_blank","noopener,noreferrer")};row.appendChild(b);}
        if(r.rawUrl){const b=document.createElement("button");b.className="btn secondary";b.textContent="Open raw code";b.onclick=function(){window.open(r.rawUrl,"_blank","noopener,noreferrer")};row.appendChild(b);}
        card.appendChild(row);
        if(r.snippet){const pre=document.createElement("pre"); pre.textContent=r.snippet; pre.style.cssText="margin-top:8px;max-height:360px;overflow:auto;white-space:pre-wrap;word-break:break-word;font-size:12px;padding:10px;border-radius:8px;background:#050609;"; card.appendChild(pre);}
        wrap.appendChild(card);
      });
      bubble.appendChild(wrap);
      const note=document.createElement("div"); note.textContent="GitHub source links and retrieved snippets are saved to LocalMind memory. Always review the repository license before reusing code."; note.style.cssText="font-size:12px;opacity:.7;margin-top:8px;"; bubble.appendChild(note);
    }

    if (creative.type === "reference-search" && creative.officialUrl) {
      const row=document.createElement("div"); row.style.cssText="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;";
      const b=document.createElement("button"); b.className="btn primary"; b.textContent="Open official reference"; b.onclick=function(){window.open(creative.officialUrl,"_blank","noopener,noreferrer")}; row.appendChild(b);
      (creative.sources||[]).forEach(function(src){ if(!src.url || src.url===creative.officialUrl) return; const x=document.createElement("button"); x.className="btn secondary"; x.textContent="Open "+(src.name||"source"); x.onclick=function(){window.open(src.url,"_blank","noopener,noreferrer")}; row.appendChild(x); });
      bubble.appendChild(row);
    }

    if (creative.type === "video-search-fallback" && creative.url) {
      const row = document.createElement("div");
      row.style.cssText = "margin-top:12px;display:flex;flex-direction:column;gap:8px;";
      const btn = document.createElement("button");
      btn.className = "btn primary";
      btn.textContent = "▶ Open video search";
      btn.onclick = () => window.open(creative.url, "_blank", "noopener,noreferrer");
      row.appendChild(btn);
      const note = document.createElement("div");
      note.style.cssText = "font-size:12px;opacity:.7;";
      note.textContent = "The public video API instances were unavailable. LocalMind will use them again on the next search.";
      row.appendChild(note);
      bubble.appendChild(row);
    }

    if (creative.type === "github-code-search-fallback" && creative.url) {
      const row = document.createElement("div");
      row.style.cssText = "margin-top:12px;display:flex;flex-direction:column;gap:8px;";
      const btn = document.createElement("button");
      btn.className = "btn primary";
      btn.textContent = "Open GitHub search";
      btn.onclick = () => window.open(creative.url, "_blank", "noopener,noreferrer");
      row.appendChild(btn);
      const note = document.createElement("div");
      note.style.cssText = "font-size:12px;opacity:.7;";
      note.textContent = "Unauthenticated GitHub API limits are low. Opening GitHub directly always works while online.";
      row.appendChild(note);
      bubble.appendChild(row);
    }

    if (creative.type === "embed" && creative.url) {
      const row = document.createElement("div");
      row.style.cssText = "margin-top:10px;display:flex;flex-direction:column;gap:8px;";
      const openBtn = document.createElement("button");
      openBtn.className = "btn primary";
      openBtn.textContent = creative.label || ("Open " + (creative.title || "site"));
      openBtn.onclick = () => window.open(creative.url, "_blank", "noopener,noreferrer");
      row.appendChild(openBtn);
      const frame = document.createElement("iframe");
      frame.src = creative.url;
      frame.title = creative.title || "Embedded site";
      frame.style.cssText = "width:100%;height:420px;border:1px solid #2a3a52;border-radius:10px;background:#0a0c10;";
      frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox");
      row.appendChild(frame);
      const note = document.createElement("div");
      note.style.cssText = "font-size:12px;opacity:0.7;";
      note.textContent = "If the site blocks embedding, use Open to interact in a new tab.";
      row.appendChild(note);
      bubble.appendChild(row);
    }
    if (creative.type === "zip" && creative.bytes) {
      const row = document.createElement("div");
      row.style.cssText = "margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;";
      const dl = document.createElement("button");
      dl.className = "btn secondary";
      dl.textContent = "⬇ Download " + (creative.filename || "site.zip");
      dl.onclick = () => {
        const blob = new Blob([creative.bytes], { type: "application/zip" });
        if (typeof lmDownloadBlob === "function") {
          lmDownloadBlob(blob, creative.filename || "site.zip");
        } else {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = creative.filename || "site.zip";
          document.body.appendChild(a);
          a.click();
          a.remove();
        }
      };
      row.appendChild(dl);
      if (creative.previewHtml) {
        const prev = document.createElement("button");
        prev.className = "btn primary";
        prev.textContent = "▶ Preview website";
        prev.onclick = () => {
          const html = (window.__lm_site_preview || creative.previewHtml);
          const w = window.open("", "_blank", "width=960,height=720");
          if (w) { w.document.open(); w.document.write(html); w.document.close(); }
        };
        row.appendChild(prev);
      }
      bubble.appendChild(row);

      // Editable complete source (HTML / CSS / JS)
      if (creative.files) {
        const editor = document.createElement("div");
        editor.className = "source-editor";
        editor.style.cssText = "margin-top:12px;border:1px solid var(--border,#2a3a52);border-radius:10px;overflow:hidden;";
        const tabs = document.createElement("div");
        tabs.style.cssText = "display:flex;gap:0;background:#121820;";
        const panes = document.createElement("div");
        const names = ["index.html", "styles.css", "app.js"].filter(function (n) { return creative.files[n]; });
        const areas = {};
        names.forEach(function (name, idx) {
          const tab = document.createElement("button");
          tab.type = "button";
          tab.textContent = name;
          tab.style.cssText = "flex:1;padding:8px;border:none;background:" + (idx === 0 ? "#1a2332" : "transparent") + ";color:#c5d4e8;cursor:pointer;font-size:12px;";
          const ta = document.createElement("textarea");
          ta.value = creative.files[name];
          ta.spellcheck = false;
          ta.style.cssText = "width:100%;min-height:220px;padding:12px;border:none;background:#0a0c10;color:#e7ecf3;font-family:ui-monospace,monospace;font-size:12px;display:" + (idx === 0 ? "block" : "none") + ";resize:vertical;";
          areas[name] = ta;
          tab.onclick = function () {
            names.forEach(function (n) { areas[n].style.display = "none"; });
            Array.prototype.forEach.call(tabs.children, function (c) { c.style.background = "transparent"; });
            ta.style.display = "block";
            tab.style.background = "#1a2332";
          };
          tabs.appendChild(tab);
          panes.appendChild(ta);
        });
        editor.appendChild(tabs);
        editor.appendChild(panes);
        const applyRow = document.createElement("div");
        applyRow.style.cssText = "padding:8px;display:flex;gap:8px;flex-wrap:wrap;background:#121820;";
        const applyBtn = document.createElement("button");
        applyBtn.className = "btn primary";
        applyBtn.textContent = "Apply edits & refresh preview";
        applyBtn.onclick = function () {
          const html = areas["index.html"] ? areas["index.html"].value : "";
          const css = areas["styles.css"] ? areas["styles.css"].value : "";
          const js = areas["app.js"] ? areas["app.js"].value : "";
          // rebuild single-file preview
          let preview = html;
          if (css) {
            if (/<link[^>]+styles\.css/i.test(preview)) {
              preview = preview.replace(/<link[^>]+href=["']styles\.css["'][^>]*>/i, "<style>\n" + css + "\n</style>");
            } else if (/<\/head>/i.test(preview)) {
              preview = preview.replace(/<\/head>/i, "<style>\n" + css + "\n</style></head>");
            } else {
              preview = "<style>" + css + "</style>" + preview;
            }
          }
          if (js) {
            if (/<script[^>]+src=["']app\.js["'][^>]*><\/script>/i.test(preview)) {
              preview = preview.replace(/<script[^>]+src=["']app\.js["'][^>]*><\/script>/i, "<script>\n" + js + "\n</script>");
            } else if (/<\/body>/i.test(preview)) {
              preview = preview.replace(/<\/body>/i, "<script>\n" + js + "\n</script></body>");
            } else {
              preview = preview + "<script>" + js + "</script>";
            }
          }
          window.__lm_site_preview = preview;
          creative.previewHtml = preview;
          creative.files = {
            "index.html": html,
            "styles.css": css,
            "app.js": js
          };
          // rebuild zip bytes if Coder available
          if (typeof Coder !== "undefined" && Coder.makeZip) {
            try { creative.bytes = Coder.makeZip(creative.files); } catch (e) {}
          }
          applyBtn.textContent = "Applied — use Preview";
          setTimeout(function () { applyBtn.textContent = "Apply edits & refresh preview"; }, 1500);
        };
        applyRow.appendChild(applyBtn);
        const hint = document.createElement("span");
        hint.style.cssText = "font-size:12px;opacity:0.7;align-self:center;";
        hint.textContent = "Edit the files, then Apply and Preview.";
        applyRow.appendChild(hint);
        editor.appendChild(applyRow);
        bubble.appendChild(editor);
      }
    }
    if (creative.type === "code" && creative.code) {
      const pre = document.createElement("pre");
      pre.style.cssText = "margin-top:12px;padding:12px;background:#0a0c10;border-radius:8px;overflow:auto;max-height:200px;font-size:12px;";
      pre.textContent = creative.code.slice(0, 8000);
      bubble.appendChild(pre);
      const row = document.createElement("div");
      row.style.cssText = "margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;";
      const dl = document.createElement("button");
      dl.className = "btn secondary";
      dl.textContent = "⬇ Download " + (creative.filename || "code.txt");
      dl.onclick = () => {
        const mime = (creative.filename || "").endsWith(".zip") ? "application/zip"
          : (creative.filename || "").endsWith(".html") ? "text/html" : "text/plain";
        const blob = new Blob([creative.code], { type: mime });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = creative.filename || "code.txt";
        document.body.appendChild(a);
        a.click();
        a.remove();
      };
      row.appendChild(dl);
      if ((creative.language === "html" || (creative.filename || "").endsWith(".html"))) {
        const prev = document.createElement("button");
        prev.className = "btn primary";
        prev.textContent = "▶ Preview website";
        prev.onclick = () => {
          const w = window.open("", "_blank", "width=900,height=700");
          if (w) {
            w.document.open();
            w.document.write(creative.code);
            w.document.close();
          } else {
            // fallback iframe panel
            let frame = bubble.querySelector(".site-preview");
            if (!frame) {
              frame = document.createElement("iframe");
              frame.className = "site-preview";
              frame.style.cssText = "width:100%;height:360px;margin-top:10px;border:1px solid var(--border);border-radius:8px;background:#fff;";
              bubble.appendChild(frame);
            }
            frame.srcdoc = creative.code;
          }
        };
        row.appendChild(prev);
      }
      const copy = document.createElement("button");
      copy.className = "btn secondary";
      copy.textContent = "Copy code";
      copy.onclick = async () => {
        try { await navigator.clipboard.writeText(creative.code); copy.textContent = "Copied"; } catch(e) { copy.textContent = "Copy failed"; }
      };
      row.appendChild(copy);
      bubble.appendChild(row);
      return;
    }

    if ((creative.type === "image" || creative.type === "profile" || creative.type === "profile-media") && creative.dataUrl) {
      const img = document.createElement("img");
      img.src = creative.dataUrl;
      img.alt = creative.prompt || creative.message || "Profile photo";
      img.style.cssText = "max-width:100%;border-radius:10px;margin-top:12px;display:block;border:1px solid var(--border);";
      bubble.appendChild(img);
      const dl = document.createElement("button");
      dl.className = "btn secondary";
      dl.textContent = "⬇ Download image";
      dl.style.marginTop = "8px";
      dl.onclick = () => downloadDataUrl(creative.dataUrl, (creative.filename || "localmind-photo") + ".jpg");
      bubble.appendChild(dl);
    }
    // Multi-media gallery grid
    if (creative.type === "gallery" && Array.isArray(creative.items) && creative.items.length) {
      const grid = document.createElement("div");
      grid.style.cssText =
        "margin-top:12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;";
      creative.items.forEach(function (it) {
        const card = document.createElement("div");
        card.style.cssText =
          "border:1px solid var(--border);border-radius:10px;overflow:hidden;background:#0a0c10;display:flex;flex-direction:column;";
        const cap = document.createElement("div");
        cap.style.cssText = "font-size:11px;padding:6px 8px;opacity:0.85;";
        cap.textContent = "#" + (it.index || "") + " " + (it.name || it.kind || "item");
        card.appendChild(cap);
        if (it.kind === "video" && it.dataUrl) {
          const vid = document.createElement("video");
          vid.src = it.dataUrl;
          vid.controls = true;
          vid.playsInline = true;
          vid.preload = "metadata";
          vid.style.cssText = "width:100%;max-height:160px;display:block;background:#000;";
          card.appendChild(vid);
        } else if (it.dataUrl) {
          const img = document.createElement("img");
          img.src = it.dataUrl;
          img.alt = it.name || "gallery";
          img.style.cssText = "width:100%;height:120px;object-fit:cover;display:block;";
          card.appendChild(img);
        }
        grid.appendChild(card);
      });
      bubble.appendChild(grid);
      const hint = document.createElement("div");
      hint.style.cssText = "font-size:12px;opacity:0.7;margin-top:8px;";
      hint.textContent = "Open one: gallery show N · Delete: gallery delete N";
      bubble.appendChild(hint);
    }

    // In-chat video player (profile video, uploaded clips, etc.)
    if (
      creative.type === "video" ||
      creative.type === "profile" ||
      creative.type === "profile-media" ||
      creative.videoDataUrl
    ) {
      const vSrc = creative.videoDataUrl || (creative.type === "video" ? creative.dataUrl : null);
      if (vSrc) {
        const wrap = document.createElement("div");
        wrap.style.cssText = "margin-top:12px;display:flex;flex-direction:column;gap:8px;";
        const label = document.createElement("div");
        label.style.cssText = "font-size:12px;opacity:0.8;";
        label.textContent = creative.videoName || creative.message || "Profile video";
        wrap.appendChild(label);
        const vid = document.createElement("video");
        vid.src = vSrc;
        vid.controls = true;
        vid.playsInline = true;
        vid.preload = "metadata";
        if (creative.videoMime) {
          try { vid.setAttribute("type", creative.videoMime); } catch (_) {}
        }
        vid.style.cssText =
          "max-width:100%;width:100%;max-height:360px;border-radius:10px;display:block;border:1px solid var(--border);background:#0a0c10;";
        wrap.appendChild(vid);
        const row = document.createElement("div");
        row.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;";
        const dlv = document.createElement("button");
        dlv.className = "btn secondary";
        dlv.textContent = "⬇ Download video";
        dlv.onclick = function () {
          try {
            downloadDataUrl(
              vSrc,
              creative.videoName || creative.filename || "localmind-profile-video.mp4"
            );
          } catch (e) {
            const a = document.createElement("a");
            a.href = vSrc;
            a.download = creative.videoName || "localmind-profile-video.mp4";
            document.body.appendChild(a);
            a.click();
            a.remove();
          }
        };
        row.appendChild(dlv);
        wrap.appendChild(row);
        bubble.appendChild(wrap);
      }
    }
    if (creative.type === "audio" && creative.buffer) {
      const controls = document.createElement("div");
      controls.style.cssText = "margin-top:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;";
      const playBtn = document.createElement("button");
      playBtn.className = "btn primary";
      playBtn.textContent = "▶ Play song";
      playBtn.onclick = () => Creative.playBuffer(creative.buffer);
      controls.appendChild(playBtn);
      const dlBtn = document.createElement("button");
      dlBtn.className = "btn secondary";
      dlBtn.textContent = "⬇ Download WAV";
      dlBtn.onclick = () => {
        const blob = Creative.bufferToWav(creative.buffer);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "localmind-song.wav";
        a.click();
        URL.revokeObjectURL(url);
      };
      controls.appendChild(dlBtn);
      bubble.appendChild(controls);
    }
    if (creative.type === "movie" && creative.scenes) {
      const movieBox = document.createElement("div");
      movieBox.style.cssText = "margin-top:14px;";
      creative.scenes.forEach(scene => {
        const sc = document.createElement("div");
        sc.style.cssText = "margin-bottom:14px;padding:10px;background:var(--bg);border-radius:8px;border:1px solid var(--border);";
        sc.innerHTML = `<strong>Scene ${scene.number}</strong> <span style="color:var(--text-muted);font-size:12px;">(${scene.duration})</span><br><span style="font-size:13px;">${escapeHtml(scene.description)}</span>`;
        if (scene.visual) {
          const img = document.createElement("img");
          img.src = scene.visual;
          img.style.cssText = "max-width:100%;border-radius:6px;margin-top:8px;display:block;";
          sc.appendChild(img);
        }
        movieBox.appendChild(sc);
      });
      const scriptBtn = document.createElement("button");
      scriptBtn.className = "btn secondary";
      scriptBtn.textContent = "📄 View full script";
      scriptBtn.style.marginTop = "8px";
      scriptBtn.onclick = () => {
        const w = window.open("", "_blank");
        w.document.write(`<pre style="font-family:monospace;padding:20px;white-space:pre-wrap;">${escapeHtml(creative.script)}</pre>`);
      };
      movieBox.appendChild(scriptBtn);
      bubble.appendChild(movieBox);
    }
  }


    function appendMessage(role, content, thinking, creative) {
    const msg = document.createElement("div");
    msg.className = "message " + role;

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = role === "user" ? "👤" : "🧠";

    const bubble = document.createElement("div");
    bubble.className = "bubble";

    if (thinking && role === "assistant") {
      const panel = buildThinkingPanel(thinking);
      // history: show finished collapsed state immediately
      panel.lines.forEach(function (line) {
        // steps already not rendered - run synchronously
      });
      // Render all steps at once, collapsed
      const body = panel.el.querySelector(".think-body");
      const lines = String(thinking).split(/\n/).map(function (l) {
        return l.replace(/^→\s*/, "").trim();
      }).filter(Boolean);
      lines.forEach(function (line) {
        const row = document.createElement("div");
        row.className = "think-step think-step-idea";
        row.innerHTML = "<span class=\"think-icon\">💡</span><span class=\"think-label\"></span>";
        row.querySelector(".think-label").textContent = line;
        body.appendChild(row);
      });
      panel.el.classList.remove("thinking-live");
      panel.el.classList.add("think-done", "collapsed");
      const title = panel.el.querySelector(".think-title");
      if (title) title.textContent = "Thought process";
      const chevron = panel.el.querySelector(".think-chevron");
      if (chevron) chevron.textContent = "▸";
      const timer = panel.el.querySelector(".think-timer");
      if (timer) timer.textContent = "";
      bubble.appendChild(panel.el);
    }

    // Simple markdown-ish rendering (never crash on null/undefined)
    const safeContent = content == null ? "" : String(content);
    let html = safeContent
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\n/g, "<br>");

    const contentDiv = document.createElement("div");
    contentDiv.className = "msg-content";
    contentDiv.innerHTML = html;
    bubble.appendChild(contentDiv);

    // Creative outputs (image, video, audio, movie, code, …)
    if (creative && role === "assistant") {
      renderCreative(bubble, creative);
    }

    msg.appendChild(avatar);
    msg.appendChild(bubble);
    chatContainer.appendChild(msg);
    chatFollowBottom = true;
    chatScrollBottom(true);
  }

  sendBtn.addEventListener("click", () => sendMessage(userInput.value));
  userInput.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(userInput.value);
    }
  });

  // Quick chips
  document.querySelectorAll(".chip").forEach(chip => {
    chip.addEventListener("click", () => {
      sendMessage(chip.dataset.prompt);
    });
  });

  // Knowledge panel
  function renderKnowledge(filter = "") {
    const facts = Knowledge.search(filter);
    knowledgeList.innerHTML = "";
    if (facts.length === 0) {
      knowledgeList.innerHTML = '<p style="color:var(--text-muted)">No facts stored yet. Teach me something!</p>';
      return;
    }
    facts.forEach(f => {
      const card = document.createElement("div");
      card.className = "fact-card";
      card.innerHTML = `
        <div class="subject">${escapeHtml(f.subject)}</div>
        <div class="content">${escapeHtml(f.content)}</div>
        <div class="meta">
          <span class="category">${f.category}</span>
          <span>${new Date(f.created).toLocaleDateString()}</span>
          <span>used ${f.uses || 0}×</span>
        </div>
      `;
      knowledgeList.appendChild(card);
    });
  }

  knowledgeSearch?.addEventListener("input", () => renderKnowledge(knowledgeSearch.value));

  addFactBtn?.addEventListener("click", () => {
    navBtns.forEach(b => b.classList.remove("active"));
    document.querySelector('[data-panel="teach"]').classList.add("active");
    panels.forEach(p => p.classList.remove("active"));
    document.getElementById("panel-teach").classList.add("active");
    panelTitle.textContent = "Teach Mode";
  });

  // Blockchain panel
  function renderBlockchain() {
    const chain = Blockchain.getChain();
    blockchainView.innerHTML = "";
    chain.slice().reverse().forEach(block => {
      const card = document.createElement("div");
      card.className = "block-card";
      const dataStr = typeof block.data === "object"
        ? JSON.stringify(block.data, null, 2)
        : String(block.data);
      card.innerHTML = `
        <div class="block-header">
          <span>Block #${block.index}</span>
          <span>${new Date(block.timestamp).toLocaleString()}</span>
        </div>
        <div class="hash">hash: ${block.hash}</div>
        <div class="hash">prev: ${block.previousHash}</div>
        <div class="data">${escapeHtml(dataStr)}</div>
      `;
      blockchainView.appendChild(card);
    });
  }

  refreshChain?.addEventListener("click", renderBlockchain);
  verifyChain?.addEventListener("click", () => {
    const result = Blockchain.verify();
    chainStatus.className = "chain-status " + (result.valid ? "valid" : "invalid");
    chainStatus.textContent = result.message;
  });

  // Neurons panel — units + Hebbian synapses
  function renderNeurons() {
    const strongest = Neurons.getStrongest(20);
    const links = (Neurons.getStrongestLinks && Neurons.getStrongestLinks(12)) || [];
    const stats = (Neurons.getStats && Neurons.getStats()) || {};
    neuronGrid.innerHTML = "";

    const head = document.createElement("div");
    head.style.cssText = "grid-column:1/-1;margin-bottom:8px;font-size:13px;color:var(--text-muted);line-height:1.5;";
    head.innerHTML = "<strong>Hebbian engine</strong> · Δw = η·xᵢ·xⱼ · η=" + (stats.eta != null ? stats.eta : "0.12") +
      " · neurons <strong>" + (stats.neurons || 0) + "</strong> · links <strong>" + (stats.links || 0) + "</strong> · updates <strong>" + (stats.hebbUpdates || 0) + "</strong>" +
      "<br><span style='opacity:0.85'>Ask: <code>How do your neurons learn?</code> · Cells that fire together wire together.</span>";
    neuronGrid.appendChild(head);

    if (strongest.length === 0) {
      const p = document.createElement("p");
      p.style.color = "var(--text-muted)";
      p.textContent = "No neurons activated yet. Start chatting — co-activated concepts will form links.";
      neuronGrid.appendChild(p);
      return;
    }

    strongest.forEach(function (n) {
      const card = document.createElement("div");
      card.className = "neuron-card";
      card.innerHTML = "<div class=\"label\">" + escapeHtml(n.label) + "</div>" +
        "<div class=\"strength-bar\"><div class=\"strength-fill\" style=\"width:" + n.strength + "%\"></div></div>" +
        "<div class=\"uses\">" + n.uses + " firings · strength " + Math.round(n.strength) + "</div>";
      neuronGrid.appendChild(card);
    });

    if (links.length) {
      const syn = document.createElement("div");
      syn.style.cssText = "grid-column:1/-1;margin-top:12px;";
      syn.innerHTML = "<h4 style=\"margin:0 0 8px;font-size:13px;\">Strongest synapses (Hebbian w)</h4>";
      const list = document.createElement("div");
      list.style.cssText = "display:flex;flex-direction:column;gap:6px;font-size:12px;";
      links.forEach(function (L) {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--bg);border-radius:8px;border:1px solid var(--border);";
        const pct = Math.round((L.w || 0) * 100);
        row.innerHTML = "<span style=\"flex:1\"><strong>" + escapeHtml(L.a) + "</strong> ↔ <strong>" + escapeHtml(L.b) +
          "</strong></span><span style=\"color:var(--accent)\">w=" + (L.w || 0) + "</span>" +
          "<span style=\"opacity:0.7\">LTP " + (L.ltp || 0) + "</span>" +
          "<div style=\"width:48px;height:4px;background:#222;border-radius:2px;overflow:hidden\"><div style=\"width:" + pct + "%;height:100%;background:#5b8def\"></div></div>";
        list.appendChild(row);
      });
      syn.appendChild(list);
      neuronGrid.appendChild(syn);
    }
  }

  // Teach panel
  teachSubmit?.addEventListener("click", () => {
    const subject = teachSubject.value.trim();
    const content = teachFact.value.trim();
    const category = teachCategory.value;
    if (!subject || !content) {
      teachFeedback.className = "feedback";
      teachFeedback.style.color = "var(--danger)";
      teachFeedback.textContent = "Please fill both subject and fact.";
      return;
    }
    Knowledge.add(subject, content, category);
    teachFeedback.className = "feedback success";
    teachFeedback.textContent = "✓ Fact stored in blockchain memory.";
    teachSubject.value = "";
    teachFact.value = "";
    updateStats();
    setTimeout(() => { teachFeedback.textContent = ""; }, 3000);
  });

  // Settings
  function loadSettingsUI() {
    const s = AI.loadSettings();
    aiNameInput.value = s.aiName;
    responseStyle.value = s.responseStyle;
    autoLearn.checked = s.autoLearn;
    correctMode.checked = s.correctMode;
  }

  function persistSettings() {
    AI.saveSettings({
      aiName: aiNameInput.value || "Kanairoex",
      responseStyle: responseStyle.value,
      autoLearn: autoLearn.checked,
      correctMode: correctMode.checked
    });
  }

  [aiNameInput, responseStyle, autoLearn, correctMode].forEach(el => {
    el?.addEventListener("change", persistSettings);
  });

  clearBtn?.addEventListener("click", () => {
    if (confirm("Clear conversation display only? (Memory is kept)")) {
      chatContainer.innerHTML = "";
      const w = document.createElement("div");
      w.className = "welcome";
      w.id = "welcome";
      w.innerHTML = `
        <div class="welcome-icon">🧠</div>
        <h3>Welcome to Kanairoex</h3>
        <p>Your private AI that lives entirely in your browser.</p>
      `;
      chatContainer.appendChild(w);
      chatFollowBottom = true;
      chatScrollBottom(true);
    }
  });

  resetAll?.addEventListener("click", () => {
    if (confirm("This will permanently delete ALL knowledge, blockchain, neurons and history. Continue?")) {
      AI.clearAll();
      location.reload();
    }
  });

  // Stats
  function updateStats() {
    const s = AI.getStats();
    document.getElementById("statBlocks").textContent = s.blocks;
    document.getElementById("statFacts").textContent = s.facts;
    document.getElementById("statNeurons").textContent = s.neurons + (typeof Neurons.getLinkCount === "function" ? ("/" + Neurons.getLinkCount()) : "");
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Restore history on load

  // Network indicator + PWA install
  const netStatus = document.getElementById("netStatus");
  function refreshNet() {
    if (!netStatus) return;
    const on = typeof navigator !== "undefined" ? navigator.onLine : true;
    netStatus.textContent = on ? "Online" : "Offline";
    netStatus.style.color = on ? "#3ecf8e" : "#f0a050";
  }
  refreshNet();
  window.addEventListener("online", refreshNet);
  window.addEventListener("offline", refreshNet);

  let deferredPrompt = null;
  const installBtn = document.getElementById("installBtn");
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) installBtn.style.display = "";
  });
  installBtn?.addEventListener("click", async function () {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try { await deferredPrompt.userChoice; } catch (e) {}
    deferredPrompt = null;
    installBtn.style.display = "none";
  });

  function restoreHistory() {
    const history = AI.loadHistory();
    if (!history.length) return;
    welcome?.remove();
    // Only last 40 messages for faster first paint
    const slice = history.length > 40 ? history.slice(-40) : history;
    for (let i = 0; i < slice.length; i++) {
      const m = slice[i];
      if (!m || m.content == null || m.content === "") continue;
      try {
        appendMessage(m.role || "assistant", String(m.content), m.thinking);
      } catch (e) {
        console.warn("skip bad history message", e);
      }
    }
  }

  // Init
  updateStats();
  restoreHistory();
  userInput.focus();
  // Preload knowledge during idle time so chat stays responsive
  function startPreload() {
    if (typeof Preload === "undefined") return;
    Preload.run().then(r => {
      if (r && r.total) console.log("Preloaded facts:", r.total);
      updateStats();
    }).catch(() => {});
  }
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(function () { startPreload(); }, { timeout: 2500 });
  } else {
    setTimeout(startPreload, 600);
  }

  // Theme toggle
  document.getElementById("themeBtn")?.addEventListener("click", () => {
    document.body.classList.toggle("light");
    localStorage.setItem("localmind_theme", document.body.classList.contains("light") ? "light" : "dark");
  });
  if (localStorage.getItem("localmind_theme") === "light") {
    document.body.classList.add("light");
  }

  // File input + drag/drop — also honors pending set photo / add photo / gallery video
  async function loadUserFile(file) {
    if (!file) return;
    const mime = file.type || "";
    const isImage = mime.indexOf("image/") === 0;
    const isVideo = mime.indexOf("video/") === 0;
    const sizeKb = Math.round((file.size || 0) / 1024);

    async function savePending(kind) {
      try {
        if (kind === "profile-photo") {
          if (typeof Profile === "undefined") throw new Error("Profile module missing");
          if (!isImage) throw new Error("Choose an image for profile photo.");
          const r = await Profile.setAvatarFromFile(file);
          const av = await Profile.getAvatar();
          window.__lmPendingMedia = null;
          appendMessage(
            "assistant",
            "Profile photo saved ✅ (" + (r.width || "?") + "×" + (r.height || "?") + "). Type **`profile`** to see it.",
            "→ Profile photo",
            av && av.dataUrl
              ? { type: "image", dataUrl: av.dataUrl, prompt: "profile photo", message: "Your photo" }
              : null
          );
          return true;
        }
        if (kind === "profile-video") {
          if (typeof Profile === "undefined") throw new Error("Profile module missing");
          if (!isVideo) throw new Error("Choose a video for profile video.");
          const r = await Profile.setVideoFromFile(file);
          const vid = await Profile.getVideo();
          window.__lmPendingMedia = null;
          appendMessage(
            "assistant",
            "Profile video saved ✅ (**" + (r.name || file.name) + "**). Type **`profile`** to play it.",
            "→ Profile video",
            vid && vid.dataUrl
              ? {
                  type: "video",
                  dataUrl: vid.dataUrl,
                  videoDataUrl: vid.dataUrl,
                  videoMime: vid.mime || r.mime,
                  videoName: vid.name || r.name,
                  message: "Your profile video"
                }
              : null
          );
          return true;
        }
        if (kind === "gallery-photo" || kind === "gallery-video") {
          if (typeof MediaGallery === "undefined") throw new Error("MediaGallery module missing");
          const r = await MediaGallery.addFromFile(file);
          window.__lmPendingMedia = null;
          const item = await MediaGallery.getByIndex(r.count);
          const creative = item ? await MediaGallery.creativeForItem(item) : null;
          appendMessage(
            "assistant",
            "Saved to **media gallery** ✅\n\n• #" + r.count + " **" + (r.name || file.name) +
            "**\n• Type **`gallery`** or **`gallery show " + r.count + "`**.",
            "→ Gallery",
            creative
          );
          return true;
        }
      } catch (err) {
        appendMessage(
          "assistant",
          "Could not save media: " + (err && err.message ? err.message : err),
          "→ Media error"
        );
        return true;
      }
      return false;
    }

    // Pending set photo / add photo / set video / add video (from chat commands)
    const pending = typeof takePendingMedia === "function" ? takePendingMedia() : null;
    if (pending && (isImage || isVideo)) {
      welcome?.remove();
      appendMessage(
        "user",
        (isVideo ? "[Video] " : "[Image] ") + (file.name || "file") + " (" + sizeKb + " KB)"
      );
      await savePending(pending);
      return;
    }

    // Images without pending intent
    if (isImage) {
      welcome?.remove();
      appendMessage("user", "[Image] " + (file.name || "image") + " (" + sizeKb + " KB)");
      // Auto-save to gallery when possible so Load file is useful offline
      if (typeof MediaGallery !== "undefined") {
        try {
          const r = await MediaGallery.addFromFile(file);
          const item = await MediaGallery.getByIndex(r.count);
          const creative = item ? await MediaGallery.creativeForItem(item) : null;
          appendMessage(
            "assistant",
            "**Image loaded** ✅ and saved to **gallery** as #" + r.count + " (**" + (r.name || file.name) + "**).\n\n" +
            "• Type **`gallery`** to browse\n" +
            "• Type **`set photo`** then **Load file** / **Image** within 2 minutes to make it your profile photo",
            "→ Gallery",
            creative
          );
          return;
        } catch (ge) {
          // fall through
        }
      }
      try {
        const online = typeof navigator === "undefined" ? true : !!navigator.onLine;
        if (online && window.Multimodal) {
          if (!Multimodal.status().ready) {
            await Multimodal.init({ caption: true, vqa: true, allowOfflineMeta: true });
          }
          const r = await Multimodal.understand(file, "");
          const method = r.method || "caption";
          appendMessage("assistant", r.answer || r.caption || ("Image: " + file.name), "→ Multimodal (" + method + ")");
          return;
        }
      } catch (_) {}
      appendMessage(
        "assistant",
        "**Image received** ✅ (" + sizeKb + " KB).\n\n" +
        "To save as profile: `set photo` then Load file / Image.\n" +
        "To save in gallery: `add photo` then Load file / Image.",
        "→ Image (offline)"
      );
      return;
    }

    // Videos without pending intent → gallery if possible
    if (isVideo && typeof MediaGallery !== "undefined") {
      welcome?.remove();
      appendMessage("user", "[Video] " + (file.name || "video") + " (" + sizeKb + " KB)");
      try {
        const r = await MediaGallery.addFromFile(file);
        const item = await MediaGallery.getByIndex(r.count);
        const creative = item ? await MediaGallery.creativeForItem(item) : null;
        appendMessage(
          "assistant",
          "**Video loaded** ✅ and saved to **gallery** as #" + r.count + ".\n\n" +
          "Type **`gallery`** or **`gallery show " + r.count + "`**. For profile: `set video` then Load file again.",
          "→ Gallery",
          creative
        );
        return;
      } catch (ve) {
        appendMessage("assistant", "Could not save video: " + (ve.message || ve), "→ Gallery error");
        return;
      }
    }

    try {
      const info = await Files.loadFile(file);
      if (typeof KanairoexV3 !== "undefined") KanairoexV3.rememberFile(file, info.text || info.content || "");
      let msg = "Loaded file **" + info.name + "** (" + info.size + " bytes).";
      if (info.type === "text" && info.content) {
        if (info.content.length > 4000 && typeof LMUpgrade !== "undefined" && LMUpgrade.studyLongDocument) {
          msg = LMUpgrade.studyLongDocument(info.name, info.content, "study and summarize").reply;
        } else if (typeof KanairoexThinking !== "undefined") {
          const study = KanairoexThinking.studyText(info.name, info.content, "study and summarize this file");
          msg = KanairoexThinking.renderStudy(study);
        }
        msg += "\n\n_Ask: summary · key points · reason about …_";
      } else if ((file.type || "").startsWith("audio/")) {
        msg = "Audio file **" + info.name + "** stored as upload record.\n" +
          "Full offline music/speech model analysis is not included.\n" +
          "Tip: type `listen` to use the mic (Web Speech API) in supported browsers.";
      } else {
        msg += " Ask me about it (summary, word count, keywords…).";
      }
      appendMessage("assistant", msg);
      updateStats();
    } catch (err) {
      appendMessage("assistant", "Failed to load file: " + (err.message || err));
    }
  }

  document.getElementById("fileInput")?.addEventListener("change", async (e) => { await loadUserFile(e.target.files[0]); e.target.value = ""; });
  [document.body, document.getElementById("chatContainer")].forEach(function(target){
    target?.addEventListener("dragover", function(e){ e.preventDefault(); document.body.classList.add("drag-active"); });
    target?.addEventListener("dragleave", function(){ document.body.classList.remove("drag-active"); });
    target?.addEventListener("drop", async function(e){ e.preventDefault(); document.body.classList.remove("drag-active"); const f=e.dataTransfer?.files?.[0]; if(f) await loadUserFile(f); });
  });


  // P2P inbound files (image/video/any)
  try {
    if (typeof WebRTCPeer !== "undefined" && WebRTCPeer.setCallbacks) {
      const prev = WebRTCPeer._lmAppHooked;
      if (!prev) {
        WebRTCPeer._lmAppHooked = true;
        const existing = WebRTCPeer._callbacks || {};
        WebRTCPeer.setCallbacks({
          onMessage: function (msg, meta) {
            if (msg && msg.type === "file-received") {
              const name = msg.name || "file";
              const size = msg.size || 0;
              const mime = msg.mime || "";
              let extra = "";
              if (msg.blobUrl) {
                if ((mime || "").startsWith("image/")) {
                  extra = "\n\n![received](" + msg.blobUrl + ")";
                } else {
                  extra = "\n\n[Download " + name + "](" + msg.blobUrl + ")";
                }
              }
              appendMessage("assistant", "📥 Received **" + name + "** (" + size + " bytes)" + (mime ? " · " + mime : "") + extra);
            }
            if (typeof existing.onMessage === "function") existing.onMessage(msg, meta);
          },
          onStatus: existing.onStatus
        });
      }
    }
  } catch (e) {}

  // First-run guide
  try {
    if (typeof LMUpgrade !== "undefined" && LMUpgrade.onboardNeeded && LMUpgrade.onboardNeeded()) {
      setTimeout(function () {
        appendMessage("assistant", LMUpgrade.onboardText());
      }, 600);
    }
  } catch (e) {}

    // P2P receive handlers (tokens + files + chat)
  if (typeof WebRTCPeer !== "undefined" && WebRTCPeer.setCallbacks) {
    const tokenBuffers = {};
    WebRTCPeer.setCallbacks({
      onStatus: function (msg) {
        console.log("[P2P]", msg);
      },
      onToken: function (msg) {
        const id = msg.streamId || "default";
        if (!tokenBuffers[id]) tokenBuffers[id] = "";
        tokenBuffers[id] += msg.token || "";
        if (msg.done) {
          appendMessage("assistant", "**P2P token stream received:**\n\n" + tokenBuffers[id]);
          delete tokenBuffers[id];
        }
      },
      onFile: function (info) {
        const sizeKb = ((info.size || 0) / 1024).toFixed(1);
        let html = "**P2P file received:** " + info.name + " (" + sizeKb + " KB)";
        if (info.url) {
          html += "\n\n[Download " + info.name + "](" + info.url + ")";
        }
        appendMessage("assistant", html);
        // Auto-offer download
        try {
          const a = document.createElement("a");
          a.href = info.url;
          a.download = info.name || "received.bin";
          a.rel = "noopener";
          a.textContent = "Save " + (info.name || "file");
          a.style.cssText = "display:inline-block;margin:8px 0;padding:6px 12px;background:#1a73e8;color:#fff;border-radius:8px;text-decoration:none;";
          const last = chatContainer && chatContainer.lastElementChild;
          if (last) {
            const bubble = last.querySelector(".bubble") || last;
            bubble.appendChild(a);
          }
        } catch (_) {}
      },
      onMessage: function (msg) {
        if (!msg || (!msg.type && !msg.protocol)) return;
        if (msg.type === "dwn-record" || (msg.protocol && msg.recordId && msg.type !== "profile-share")) {
          try {
            const proto = msg.protocol || "?";
            const did = String(msg.author || (msg.proof && msg.proof.did) || "").slice(0, 28);
            const ver = msg._verified === false ? " ⚠️ unverified" : msg.proof ? " 🔐 signed" : "";
            if (proto === "chat" && msg.data && msg.data.text) {
              appendMessage("assistant", "**DWN chat**" + ver + (did ? " from `" + did + "…`" : "") + "\n\n" + msg.data.text);
            } else if (proto === "profile" && msg.data) {
              appendMessage("assistant", "**DWN profile**" + ver + "\n\n• Name: **" + (msg.data.name || "Unknown") +
                "**\n• Bio: " + (msg.data.bio || "_(none)_") +
                "\n• Wallet: `" + (msg.data.lmtAddress || "n/a") + "`" +
                (did ? "\n• DID: `" + did + "…`" : ""));
              if (msg.data.avatarDataUrl) {
                appendMessage("assistant", "Peer photo:", null, {
                  type: "image", dataUrl: msg.data.avatarDataUrl, prompt: "dwn profile", message: msg.data.name || "Peer"
                });
              }
            } else if (proto === "token" && msg.data) {
              appendMessage("assistant", "**DWN token receipt**" + ver + ": " + (msg.data.amount || "?") + " " + (msg.data.asset || "LMT"));
            } else if ((proto === "file" || proto === "media") && msg.data) {
              appendMessage("assistant", "**DWN " + proto + "**" + ver + ": **" + (msg.data.name || "file") + "** (" + (msg.data.size || 0) + " B)");
            } else {
              appendMessage("assistant", "**DWN record** (" + proto + ")" + ver);
            }
          } catch (err) {
            appendMessage("assistant", "DWN display error: " + (err.message || err));
          }
          return;
        }
        if (msg.type === "profile-share") {
          try {
            if (typeof Profile !== "undefined" && Profile.receiveShare) {
              const p = Profile.receiveShare(msg);
              let text = "**Peer profile received**\n\n• Name: **" + (p && p.name ? p.name : "Unknown") +
                "**\n• Bio: " + (p && p.bio ? p.bio : "_(none)_") +
                "\n• Wallet: `" + (p && p.address ? p.address : "n/a") + "`";
              appendMessage("assistant", text);
              if (p && p.avatarDataUrl) {
                appendMessage("assistant", "Peer photo:", null, {
                  type: "image",
                  dataUrl: p.avatarDataUrl,
                  prompt: "peer profile",
                  message: p.name || "Peer"
                });
              }
            }
          } catch (err) {
            appendMessage("assistant", "Could not save peer profile: " + (err.message || err));
          }
        } else if (msg.type === "hello") {
          appendMessage(
            "assistant",
            "**P2P peer connected** (hello)" +
              (msg.address ? "\nPeer wallet: `" + msg.address + "`" : "") +
              (msg.did ? "\nPeer DID: `" + String(msg.did).slice(0, 36) + "…`" : "")
          );
        } else if (msg.type === "chat" && msg.text) {
          appendMessage("assistant", "**P2P message:** " + msg.text +
            (msg.fromDid ? "\n_DID `" + String(msg.fromDid).slice(0, 28) + "…`_" : ""));
        } else if (msg.type === "knowledge" && msg.payload) {
          const n = Array.isArray(msg.payload) ? msg.payload.length : 1;
          appendMessage("assistant", "**P2P knowledge received:** " + n + " fact(s).");
          try {
            if (typeof Knowledge !== "undefined" && Array.isArray(msg.payload)) {
              msg.payload.forEach(function (f) {
                if (f && f.subject && f.content) Knowledge.add(f.subject, f.content, f.category || "p2p");
              });
              updateStats();
            }
          } catch (_) {}
        } else if (msg.type === "lmt-transfer" || msg.type === "token-transfer") {
          try {
            if (typeof LMTWallet !== "undefined") {
              Promise.resolve(LMTWallet.receiveAsync ? LMTWallet.receiveAsync(msg) : LMTWallet.receive(msg)).then(function(res) {
                if (res.ok) {
                  const sym = res.symbol || msg.symbol || "LMT";
                  appendMessage(
                    "assistant",
                    "**Token received over P2P:** +" + res.amount + " " + sym + " from `" + (msg.from || "peer") + "`\n" +
                    "New balance: **" + res.balance + " " + sym + "**"
                  );
                } else {
                  appendMessage("assistant", "Token transfer ignored: " + (res.reason || "unknown"));
                }
              }).catch(function(e) {
                appendMessage("assistant", "Token receive error: " + (e.message || e));
              });
            }
          } catch (e) {
            appendMessage("assistant", "Token receive error: " + (e.message || e));
          }
        } else if (msg.type === "memory-node") {
          try {
            if (typeof MemoryNode !== "undefined" && MemoryNode.absorb) {
              const res = MemoryNode.absorb(msg);
              if (!res.skipped) {
                const parts = [];
                if (res.knowledgeAdded) parts.push("+" + res.knowledgeAdded + " facts");
                if (res.poolsAdded) parts.push("+" + res.poolsAdded + " token listings");
                if (res.poolsUpdated) parts.push(res.poolsUpdated + " pools updated");
                appendMessage(
                  "assistant",
                  "**Node protection sync** 🛡️\n\nPeer `" + (res.from || "node") + "` shared memory.\n" +
                    (parts.length ? parts.join(" · ") : "Already in sync.") +
                    "\n\n_Your knowledge is mirrored so you protect each other offline._"
                );
                // Reciprocate
                try { MemoryNode.shareNow("reply"); } catch (_) {}
                if (typeof updateStats === "function") updateStats();
              }
            }
          } catch (e) {
            appendMessage("assistant", "Memory node error: " + (e.message || e));
          }
        } else if (msg.type === "pool-registry" && msg.tokens) {
          try {
            if (typeof LMTWallet !== "undefined" && LMTWallet.mergePools) {
              const res = LMTWallet.mergePools(msg);
              appendMessage(
                "assistant",
                "**Global pool update (P2P)** 💎\n\n" +
                  "• New listings: **" + (res.added || 0) + "**\n" +
                  "• Updated pools: **" + (res.updated || 0) + "**\n" +
                  "• Tokens listed: **" + (res.total || 0) + "**\n\n" +
                  "Run `markets` to browse · `swap 50 LMT TOKEN` to buy from the pool."
              );
              // Reply with our pools so peer stays in sync
              try { LMTWallet.broadcastPools(); } catch (_) {}
            }
          } catch (e) {
            appendMessage("assistant", "Pool merge error: " + (e.message || e));
          }
        } else if (msg.type === "file-progress") {
          console.log("[P2P file]", msg.name, msg.received + "/" + msg.total);
        }
      }
    });
  }

  // Final stability guard: keep one authoritative chat scroller and prevent
  // accidental scroll locking caused by focus/keyboard/layout changes.
  (function installScrollStability() {
    if (!chatContainer) return;
    function clampChatScroll() {
      const max = Math.max(0, chatContainer.scrollHeight - chatContainer.clientHeight);
      if (chatContainer.scrollTop > max) chatContainer.scrollTop = max;
    }
    chatContainer.style.overflowY = "auto";
    chatContainer.style.overflowX = "hidden";
    chatContainer.style.touchAction = "pan-y";
    chatContainer.addEventListener("touchstart", function () {
      chatContainer.style.overscrollBehaviorY = "contain";
    }, { passive: true });
    chatContainer.addEventListener("wheel", function (e) {
      if (chatContainer.scrollHeight > chatContainer.clientHeight) {
        e.stopPropagation();
      }
    }, { passive: true });
    window.addEventListener("orientationchange", function () {
      setTimeout(clampChatScroll, 100);
      setTimeout(function () {
        if (chatFollowBottom) chatScrollBottom(true);
      }, 350);
    }, { passive: true });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        if (chatFollowBottom) chatScrollBottom(false);
        clampChatScroll();
      }).catch(function(){});
    }
  })();

})();
