# Web Research Architecture

## What works on GitHub Pages

The app now performs browser-side research against public, CORS-capable endpoints when the device is online:

1. Wikipedia REST page summaries.
2. Wikipedia MediaWiki search/article extraction as fallback.
3. Wikidata entity search/description as an independent fallback.
4. DuckDuckGo Instant Answer as an optional secondary source.

A successful result is normalized, shown in chat, added to LocalMind knowledge, and saved to the offline page vault.

## Commands

- `look up Jesus`
- `search online for artificial intelligence`
- `learn about Kenya`
- `online status`
- `online on`
- `online off`
- `list offline pages`

## Important limitation

GitHub Pages is static hosting. Browser JavaScript cannot become an unrestricted Google/Bing-style crawler by itself. Direct access to arbitrary websites is also limited by CORS. The no-key build therefore uses public browser-accessible research sources and never reports a lookup as successful when all sources fail.

For unrestricted multi-engine search later, connect the same normalized research interface to a small server/edge function that owns search API credentials. Do not put private API keys in GitHub Pages JavaScript.

## Service-worker updates

The service worker is versioned as `kanairoex-v31-web-research` and uses network-first behavior for `index.html`, `app.js`, `ai-core.js`, `reasoning.js`, `online.js`, and the service worker itself. Registration also uses `updateViaCache: "none"`. This prevents an old cached `online.js` from silently defeating a new GitHub Pages deployment.

## Deep Research + Video Search (v32)

- Deep research now gathers the main Wikipedia result plus related Wikipedia topics, combines them, deduplicates sources, and saves the full report to LocalMind memory.
- The UI no longer truncates the displayed research to 4,500 characters; long answers can display up to 30,000 characters while the full research is stored locally.
- Research progress is tracked through stages so a completed request is not treated as finished until all selected sources have been processed.
- Video searches such as `search videos about Jesus` use public Piped API instances as browser-friendly adapters. Piped documents an unauthenticated `/search` endpoint for video/channel/playlist search.
- Video results include thumbnails, watch links and an embedded-player option when the source supports it.
- Video metadata and links are saved to LocalMind memory. Arbitrary online videos are **not** automatically copied to local storage; downloading is only appropriate when the source provides a permitted downloadable file.
- GitHub Pages remains a static frontend. Public third-party adapters can fail or change, so the application rotates through several configured Piped instances and reports failure instead of pretending that a search succeeded.

## Image Search (v36)

- Commands such as `search images of lions`, `find pictures of cars`, `show photos of airplanes`, `images of people`, or `picture of a plane` trigger public image research.
- Sources (no API key): **Openverse** (Creative Commons) and **Wikimedia Commons**.
- Results show a thumbnail grid with Open / Source actions; licenses are displayed when available.
- Metadata is saved to LocalMind memory. Images are not bulk-downloaded automatically — open the source to respect license terms.
- Profile/gallery commands (`set photo`, `add photo`) are not treated as online image search.
