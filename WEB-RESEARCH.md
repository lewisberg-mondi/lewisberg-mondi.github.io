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
