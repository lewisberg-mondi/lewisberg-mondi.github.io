/* Kanairoex / LocalMind service worker — network-aware application cache. */
const CACHE = "kanairoex-v32-deep-research-video";
const CORE = [
  "./index.html", "./styles.css", "./manifest.json", "./icon.svg", "./app.js",
  "./ai-core.js", "./reasoning.js", "./online.js", "./knowledge.js", "./response.js",
  "./blockchain.js", "./neurons.js", "./sw.js"
];
const ASSETS = CORE.concat([
  "./research-manager.js", "./video-research.js", "./offline-web-vault.js", "./offline-connectivity.js", "./offline-assistant.js", "./preload.js",
  "./question.js", "./profile.js", "./mood-emoji.js", "./voice.js", "./v3-upgrades.js", "./v4-core.js", "./v4-ui.js",
  "./thinking-engine.js", "./lm-upgrade.js", "./self-evolution.js", "./token-economy.js", "./local-ai-suite.js",
  "./cognitive-engine.js", "./local-llm.js", "./multimodal.js", "./external-llm.js", "./secure-memory.js",
  "./llm-bridge.js", "./identity.js", "./dwn-local.js", "./study-hub.js", "./writer.js", "./summarizer.js",
  "./coder.js", "./dictionary.js", "./math.js", "./mind.js", "./media-gallery.js", "./usdt-buy.js", "./usdt-withdraw.js",
  "./mmf.js", "./rag.js", "./rules.js", "./self-evolution.js", "./space-comms.js", "./toolsx.js", "./verify.js", "./worldtime.js",
  "./data/knowledge_pack.json", "./data/encyclopedia.json", "./data/brain_ai_map.json", "./data/neuro_tech_concepts.json",
  "./data/neuron_concepts.json", "./data/student_language_world.json", "./data/religion_vocab_business.json"
]);

// These are the files most likely to change during GitHub Pages deployments.
// They use network-first with cached fallback so new versions are picked up.
const NETWORK_FIRST = new Set(["index.html", "app.js", "ai-core.js", "reasoning.js", "online.js", "research-manager.js", "video-research.js", "sw.js"]);

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(CORE.map(async asset => {
      try {
        const response = await fetch(asset, { cache: "no-store" });
        if (response && response.ok) await cache.put(asset, response);
      } catch (_) {}
    }));
    Promise.all(ASSETS.filter(a => !CORE.includes(a)).map(async asset => {
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
  if (url.origin !== self.location.origin) return; // never intercept external web research APIs

  const filename = url.pathname.split("/").pop() || "index.html";
  const networkFirst = NETWORK_FIRST.has(filename) || event.request.mode === "navigate";

  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (networkFirst) {
      try {
        const response = await fetch(event.request, { cache: "no-store" });
        if (response && response.ok) (await caches.open(CACHE)).put(event.request, response.clone()).catch(() => {});
        return response;
      } catch (_) {
        if (cached) return cached;
      }
    } else if (cached) {
      return cached;
    }

    try {
      const response = await fetch(event.request);
      if (response && response.ok) (await caches.open(CACHE)).put(event.request, response.clone()).catch(() => {});
      return response;
    } catch (_) {
      if (cached) return cached;
      if (event.request.mode === "navigate") {
        const fallback = await caches.match("./index.html");
        return fallback || new Response("Offline", { status: 503 });
      }
      return new Response("Offline resource unavailable", { status: 503 });
    }
  })());
});
