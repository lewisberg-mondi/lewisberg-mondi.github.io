# Kanairoex AI v37 — Debug & Repair Report

Date: 2026-08-23

## Problem reproduced from the supplied screenshots

The command:

```text
look up image of Jesus
```

was correctly recognized as an image-search request, but the UI eventually displayed a generic failure saying that public image-search services were unavailable. A second class of screenshots showed `Online fetch failed: Access denied`, and GitHub research returned zero results.

## Root causes found

### 1. Image search had no browser-specific fallback

`image-research.js` depended on normal cross-origin `fetch()` calls to Openverse and Wikimedia. If the browser, mobile WebView, network filter, or CORS policy rejected those requests, both providers could fail and the application had no automatic second path.

### 2. The service worker could keep an old image-search module

`image-research.js` was cached as a normal asset instead of being in the service worker's network-first set. That made stale image-search code possible after a GitHub Pages deployment.

The HTML was already versioning critical modules, but the service-worker cache itself was still on an older version and the image module was not treated as a changing module.

### 3. The final UI fallback was too generic

The previous message did not explain that the direct Wikimedia search link was still available, and it did not expose which fallback path had been attempted.

## Repair applied

### Image search pipeline

The repaired pipeline is now:

1. Openverse normal `fetch()`.
2. Wikimedia Commons normal `fetch()`.
3. Wikimedia Commons JSONP fallback when browser CORS/fetch is blocked.
4. Wikipedia REST representative thumbnail fallback for well-known topics.
5. Direct Wikimedia Commons search link if all automatic paths fail.

The result still preserves source URLs and license metadata. The app does not copy images into its own server.

### Cache repair

- Service-worker cache: `kanairoex-v37-image-search-fix`
- `image-research.js` is now `NETWORK_FIRST`.
- `image-research.js?v=38`
- `app.js?v=38`
- `sw.js?v=38`
- Other critical research scripts were bumped to `v37` in `index.html`.

### Diagnostics

The browser console can run:

```js
ImageResearch.diagnose()
```

This reports the configured endpoints, enabled fallback layers, and the last provider failures/successes.

## Tests performed

### Automated JavaScript tests

All existing project test files passed:

- image intent/search normalization
- image routing
- video research
- video routing
- web research
- GitHub/reference research
- deep research/video completion

### New regression test

`tests/image-fallbacks.test.js` simulates:

- Openverse failure + Wikimedia CORS failure → Wikimedia JSONP succeeds.
- Openverse failure + Wikimedia CORS failure + JSONP unavailable → Wikipedia thumbnail succeeds.

Result:

```text
PASS: blocked CORS -> Wikimedia JSONP -> Wikipedia thumbnail fallbacks
```

### Full project regression

Passed:

```text
TEST-system.js
TEST-token-system.js
TEST-ledger-supply.js
TEST-web-research.js
```

The system audit reported 103 JavaScript files syntax-checked and 81 HTML script references verified.

## Important limitation of this test environment

The build/test container did not have outbound DNS/network access, so it was not possible to perform a live HTTP request from this environment to Openverse or Wikimedia. The network behavior was therefore tested with deterministic mocks, and the public API/CORS documentation was checked separately.

## Deployment checklist

1. Upload the complete repaired folder to GitHub.
2. Keep `index.html` at the repository root (or configure Pages for the correct folder).
3. Enable GitHub Pages over HTTPS.
4. Wait for the Pages deployment to finish.
5. Open the deployed site.
6. Test:

```text
look up image of Jesus
search images of lions
find pictures of cars
show photos of airplanes
ImageResearch.diagnose()   # browser console only
```

If the browser still displays an older UI, close old tabs and reload so the v39 service worker can activate. A hard refresh is recommended after the first deployment.

## Other system observations

The supplied project is a large static, browser-first application. Its AI routing, image routing, video routing, web research, wallet/token modules, P2P/WebRTC modules, cognitive modules, and UI are all local JavaScript modules loaded by `index.html`.

The image failure was not caused by the natural-language intent parser: the supplied automated routing test already passed, and the production `Reasoning` path correctly emits `imageSearch` metadata for the image intent.

## GitHub browser-request repair

The supplied screenshot also showed a GitHub search returning zero results. The GitHub adapter was sending `X-GitHub-Api-Version` and a custom `User-Agent` from browser `fetch()`. The version header is not necessary because GitHub's REST API defaults to `2022-11-28`, and custom non-simple headers can trigger a CORS preflight. The browser adapter now uses only the `Accept` header and has a repository JSONP fallback.

Regression result:

```text
PASS: GitHub CORS failure -> repository JSONP fallback
```

---

## v39 superseding note

This historical v38 report is retained for traceability. The final v39 release adds the Brain Controller, planner, evidence engine, verifier, context manager, benchmark suite, v39 service-worker cache, and expanded regression tests. See `V39-INTELLIGENCE.md` and `V39-TEST-REPORT.md`.
