# Kanairoex AI v40 — Intelligence & Reliability Guide

## What changed

v40 adds a single Brain Controller above the existing Reasoning/AI Core instead of replacing the existing engines.

### Brain pipeline

1. **Context** — recent turns, active topic, lightweight entity tracking and reference context.
2. **Planner** — classifies the request, estimates complexity, identifies tools and missing information.
3. **Existing Reasoning/AI Core** — executes the project's existing deterministic and model-backed capabilities.
4. **Evidence Engine** — ranks source quality and estimates confidence from actual source metadata.
5. **Verifier** — checks response shape, special routing markers and creative payloads.
6. **Memory update** — stores a compact conversation state for follow-up questions.

## Reliability rules

- The system must not claim a public API succeeded when it failed.
- Image search can fall back from Openverse/Wikimedia fetch to Wikimedia JSONP and Wikipedia thumbnail/direct Commons search.
- Important factual answers expose a confidence/evidence object internally through `result.brain`.
- Conflicting taught facts are no longer silently replaced. Kanairoex stages the new claim and asks for `confirm this correction`.
- Service-worker cache version is v40 and the brain modules are network-first.

## Commands

- `look up image of Jesus`
- `search images of lions`
- `look up Topic`
- `research Topic`
- `diagnose`
- `diagnose all`
- `Remember that ...`
- `confirm this correction`

## Developer diagnostics

Open the browser console after deployment:

```js
BrainController.health()
BrainController.diagnose()
ImageResearch.diagnose()
KanairoexBenchmark.run()
```

The diagnostic functions report capability state; they do not pretend that a remote provider is reachable when the browser/network blocks it.

## Deployment

1. Upload the **contents** of the v40 folder to GitHub Pages.
2. Serve the site over HTTPS.
3. Hard-refresh once after deployment so the v40 service worker replaces older caches.
4. Test `look up image of Jesus`.
5. If a provider is blocked, the UI should show a usable fallback rather than a generic failure.

## Limitations

A small browser model is not equivalent to a large cloud model. v40 improves orchestration, evidence discipline, context and verification; it does not magically increase the parameter count of the local model. Internet-dependent research still requires a working browser/network path.
