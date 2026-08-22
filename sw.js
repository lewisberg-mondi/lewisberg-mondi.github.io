/* Kanairoex offline cache — performance build */
const CACHE = "kanairoex-v28-online";
const CORE = [
  "./index.html",
  "./styles.css",
  "./manifest.json",
  "./icon.svg",
  "./app.js",
  "./ai-core.js",
  "./reasoning.js",
  "./knowledge.js",
  "./response.js",
  "./blockchain.js",
  "./neurons.js",
  "./sw.js"
];
const ASSETS = CORE.concat([
  "./DEPLOY.md", "./PRACTICAL.md", "./README.md", "./COGNITIVE-ARCHITECTURE.md",
  "./advanced/crypto-utils.js", "./advanced/idb-store.js", "./advanced/index.js",
  "./advanced/lmt-wallet.js", "./advanced/memory-node.js", "./advanced/opfs.js",
  "./advanced/webrtc-peer.js", "./chats.js", "./coder.js", "./cognitive-engine.js",
  "./dictionary.js", "./dwn-local.js", "./external-llm.js", "./files.js", "./i18n.js",
  "./identity.js", "./interpreter.js", "./llm-bridge.js", "./lm-upgrade.js",
  "./local-ai-suite.js", "./local-llm.js", "./math.js", "./mind.js", "./mood-emoji.js",
  "./multimodal.js", "./offline-assistant.js", "./offline-connectivity.js",
  "./offline-web-vault.js", "./online.js", "./predict.js", "./preload.js",
  "./profile.js", "./media-gallery.js", "./usdt-buy.js", "./usdt-withdraw.js",
  "./mmf.js", "./question.js", "./quiz.js", "./rag.js", "./rules.js",
  "./secure-memory.js", "./self-evolution.js", "./study-hub.js", "./summarizer.js",
  "./thinking-engine.js", "./token-economy.js", "./toolsx.js", "./v3-upgrades.js",
  "./v4-core.js", "./v4-ui.js", "./verify.js", "./voice.js", "./worldtime.js", "./writer.js",
  "./data/knowledge_pack.json", "./data/encyclopedia.json", "./data/brain_ai_map.json",
  "./data/neuro_tech_concepts.json", "./data/neuron_concepts.json",
  "./data/student_language_world.json", "./data/religion_vocab_business.json"
]);

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Core first (must not fail install)
    await Promise.all(CORE.map(async asset => {
      try {
        const response = await fetch(asset, { cache: "no-store" });
        if (response && response.ok) await cache.put(asset, response);
      } catch (_) {}
    }));
    // Optional assets in background — don't block install
    Promise.all(ASSETS.filter(a => CORE.indexOf(a) < 0).map(async asset => {
      try {
        const response = await fetch(asset, { cache: "no-store" });
        if (response && response.ok) await cache.put(asset, response);
      } catch (_) {}
    })).catch(() => {});
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    const isNavigation =
      event.request.mode === "navigate" ||
      (event.request.headers.get("accept") || "").includes("text/html");

    if (isNavigation && cached) {
      fetch(event.request).then(response => {
        if (response && response.ok) caches.open(CACHE).then(c => c.put(event.request, response.clone()));
      }).catch(() => {});
      return cached;
    }
    if (!isNavigation && cached) return cached;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(event.request, { signal: controller.signal });
      if (response && response.ok) {
        const cache = await caches.open(CACHE);
        cache.put(event.request, response.clone()).catch(() => {});
      }
      return response;
    } catch (_) {
      if (cached) return cached;
      if (isNavigation) {
        const fallback = await caches.match("./index.html");
        return fallback || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
      }
      return new Response("Offline resource unavailable", { status: 503 });
    } finally {
      clearTimeout(timer);
    }
  })());
});
