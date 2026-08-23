# Kanairoex / LocalMind — Final Research & Video Stabilization Test Report

Date: 2026-08-23

## Automated tests

- JavaScript syntax checks: PASS (96 files)
- HTML script-reference check: PASS (81 references)
- Wallet/token regression suite: PASS
- Ledger/supply/security regression suite: PASS
- Web-research + video integration suite: PASS
- Video intent: PASS
- Video normalization: PASS
- Invidious/Piped fallback routing: PASS (mocked integration)
- Long research completion/chunking: PASS (mocked integration)
- Online intent detection: PASS
- Legacy `VIDEO_SEARCH:` marker recovery: PASS (static route check)
- Service-worker cache version: PASS (`kanairoex-v34-research-video-stable`)
- Critical script cache-busting: PASS (`?v=34`)

## Important deployment note

The automated integration test uses mocked network responses because the build/test container has no outbound DNS/network access. Real web-source availability varies by public API instance. The browser build therefore uses multiple Piped and Invidious public instances and falls back to the YouTube search page if all public API sources are unavailable.

## Fixes included

1. Long research can assemble up to 120,000 characters and stores the result in chunks for memory retention.
2. Research progress is collected per source and skipped-source warnings are retained.
3. Video search uses multiple Piped and Invidious sources and deduplicates results.
4. Legacy/stale `VIDEO_SEARCH:...` responses are converted into real video-search requests instead of being displayed as raw text.
5. Video results render thumbnails, Watch, and Play here actions when an embeddable YouTube URL exists.
6. Research and video metadata are stored in LocalMind memory.
7. GitHub Pages cache busting was strengthened with versioned critical scripts and service-worker cache `v34`.
8. Existing stale test paths were corrected to the current project layout.

## Image-search stabilization (2026-08-23)

- Image intent `look up image of Jesus`: PASS.
- Openverse + Wikimedia normalization: PASS.
- Blocked-CORS simulation: PASS.
- Wikimedia JSONP fallback simulation: PASS.
- Wikipedia representative-thumbnail fallback simulation: PASS.
- Service-worker image module: NETWORK_FIRST + cache `v37`.
- Versioned deployment URLs: `image-research.js?v=37`, `app.js?v=37`, `sw.js?v=37`.

---

## v39 final release

The v39 release supersedes this earlier report. Run `node RUN-ALL-TESTS.js` from the project root to execute the complete deterministic regression suite. The final v39 test result is recorded in `V39-TEST-REPORT.md` and `TEST-OUTPUT.txt`.
