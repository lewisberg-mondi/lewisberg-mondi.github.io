# GitHub Pages / Hosted Web Fix — v41

## Why local worked but GitHub Pages failed

A local editor can succeed because its browser/network path to Wikipedia, Wikimedia and Openverse may be different from the deployed site. Static GitHub Pages cannot add server-side CORS headers, so a direct browser `fetch()` can be rejected even when the same request works locally.

## v41 solution

The application now uses a layered transport strategy:

1. Direct CORS request.
2. Wikimedia JSONP where supported.
3. Public CORS relay for public metadata requests:
   - `https://api.allorigins.win/raw?url=`
   - `https://corsproxy.io/?url=`
4. Wikipedia thumbnail/JSONP fallback for image search.
5. Direct Commons/Wikipedia search link as the final manual fallback.

The relay is only used after direct access fails. Image binaries/thumbnails are still loaded from their original source URLs; the relay is used for public API metadata.

MediaWiki documents anonymous CORS with `origin=*` and JSONP through the `callback` parameter. See the official documentation: https://www.mediawiki.org/wiki/API%3ACross-site_requests

## Service-worker fix

The service worker cache is now:

`kanairoex-v41-hosted-fallbacks`

All intelligence/research script references and service-worker registration use `?v=41`, and registration uses `updateViaCache: "none"` followed by `reg.update()`.

## After deployment

1. Replace the old repository files with the v41 files.
2. Wait for GitHub Pages to publish.
3. Open the site.
4. Reload once. If the old UI remains, clear the site data for the domain and reopen it.
5. Test:

```text
look up image of Elon Musk
look up image of Jesus
look up photos of photosynthesis
look up photos of lions
```

## Diagnostics

Open the browser console and run:

```js
ImageResearch.diagnose()
Online.status()
await Online.probe()
```

`ImageResearch.diagnose().last` records provider failures and the transport strategy used.

## Important reliability note

No static GitHub Pages application can guarantee that every third-party API is reachable from every ISP, browser, country or network. v41 makes the hosted app substantially more resilient by adding independent browser-safe and relay transports. For maximum production control, deploy a first-party proxy/edge worker instead of depending on public relays.
