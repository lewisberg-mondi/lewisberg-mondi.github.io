/**
 * Preload offline knowledge packs (bulk, non-blocking, staggered)
 */
const Preload = (() => {
  const FLAG = "localmind_preloaded_v7_perf";

  async function loadJson(path) {
    try {
      const res = await fetch(path);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  function idle(ms) {
    return new Promise(function (resolve) {
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(function () { resolve(); }, { timeout: ms || 400 });
      } else {
        setTimeout(resolve, ms || 40);
      }
    });
  }

  async function run() {
    if (localStorage.getItem(FLAG)) return { ok: true, already: true };
    let total = 0;
    await idle(80);
    if (typeof Knowledge === "undefined") return { ok: false, total: 0 };

    // Phase 1 — small essential packs
    const pack = await loadJson("data/knowledge_pack.json");
    if (pack) {
      total += Knowledge.addBulk(pack.countries || [], "geo", 40);
      total += Knowledge.addBulk(pack.science || [], "science", 30);
      total += Knowledge.addBulk(pack.technology || [], "tech", 30);
      total += Knowledge.addBulk(pack.space || [], "space", 15);
      total += Knowledge.addBulk(pack.study || [], "study", 15);
    }
    await idle(120);

    // Phase 2 — medium
    const neuro = await loadJson("data/neuro_tech_concepts.json");
    const neuronConcepts = await loadJson("data/neuron_concepts.json");
    if (neuronConcepts) total += Knowledge.addBulk(neuronConcepts, "neuroscience", 60);
    if (neuro) total += Knowledge.addBulk(neuro, "education", 50);
    await idle(120);

    const brainMap = await loadJson("data/brain_ai_map.json");
    if (brainMap) total += Knowledge.addBulk(brainMap, "neuroscience", 30);
    await idle(150);

    // Phase 3 — heavier (encyclopedia / vocab) after UI is interactive
    const enc = await loadJson("data/encyclopedia.json");
    if (enc) total += Knowledge.addBulk(enc, "encyclopedia", 60);
    await idle(150);

    const slw = await loadJson("data/student_language_world.json");
    if (slw) total += Knowledge.addBulk(slw, "education", 40);
    await idle(200);

    const rvb = await loadJson("data/religion_vocab_business.json");
    if (rvb) {
      const core = rvb.filter(x =>
        /Bible|Quran|Gnostic|Business idea:|Optical|Fiber|SFP|English:|WDM|Wavelength/i.test(x.subject || "")
      );
      total += Knowledge.addBulk(core.length ? core : (rvb || []).slice(0, 40), "education", 40);
    }

    try {
      if (typeof Knowledge !== "undefined" && Knowledge.flush) Knowledge.flush();
    } catch (_) {}

    localStorage.setItem(FLAG, String(Date.now()));
    try {
      if (typeof Blockchain !== "undefined") Blockchain.addBlock({ type: "preload", facts: total });
    } catch (_) {}
    try {
      if (typeof Neurons !== "undefined") Neurons.activate("preload:done", 1);
    } catch (_) {}
    return { ok: true, total };
  }

  return { run };
})();

if (typeof window !== "undefined") window.Preload = Preload;
