# Catalog recovery and initial-load measurements

Measured 2026-09-09 on Windows, Node 24.19.0 and headless Edge. Baseline is the checkout before roadmap items 1–2. Final build includes the persistent player and all existing functionality. No remote enrichment or new anime attributes were added.

## Results

| Measure | Before | After |
| --- | ---: | ---: |
| Catalog payload, uncompressed bytes | 17,403,344 | 8,254,276 (−52.6%) |
| Catalog payload, gzip bytes | 2,012,125 | 1,843,104 (−8.4%) |
| Initial JavaScript, uncompressed bytes | 532,820 | 500,886 (−6.0%) |
| Initial JavaScript, build-reported gzip | 160.79 kB | 154.79 kB |
| Browser catalog resource duration, median | 83.7 ms | 39.4 ms |
| Browser catalog body read + JSON parse, median | 159.1 ms | 61.2 ms |
| Navigation to first 100 rendered rows, median | 377.3 ms | 264.6 ms (−29.9%) |
| Node JSON parse + reconstruction, median | 33.9 ms | 35.7 ms |
| Node initial filter/sort, median | 58.7 ms | 34.3 ms |

Browser measurements use five fresh contexts against the production build served at `/anime_db/` over uncompressed localhost HTTP. External API/media requests are blocked to isolate bundled startup; browser storage is disposable. The row marker is a DOM commit observed by MutationObserver, not a screenshot paint measurement. Resource duration includes request/response time; body-read and parse timing overlaps transfer, so these columns must not be added. Node measurements use ten samples after one warmup, with fresh catalog objects each time; filter/sort code is unchanged, and sequential microbenchmarks are sensitive to JIT/GC effects.

These are local measurements, not a claim of the same speedup on GitHub Pages or slower devices. In particular, compressed transfer savings are 8.4%, considerably smaller than the raw payload reduction. The >500 kB JavaScript advisory remains at 500.89 kB.

Raw browser row timings in ms:

- Before: 459.4, 373.9, 350.6, 430.5, 377.3.
- After: 279.4, 264.4, 254.4, 264.6, 268.8.

## Implementation and evaluated options

`public/data/anime_catalog.json` remains the canonical, unchanged 38,821-song catalog. The Vite plugin derives `data/catalog.compact.json` during every build and serves it on demand in development. It encodes existing fields with per-column dictionaries and row references. The decoder reconstructs the original song objects, preserving IDs, optional/missing/null fields, all title variants, seasons, artists and media URLs. The full-catalog round-trip test compares every field of every song. No generated transport file needs to be committed or manually refreshed.

A compact search-only candidate, omitting `video_url`, `audio_url` and `anilist_id`, measured 3,872,030 bytes raw / 1,168,030 bytes gzip. Deferred metadata would save more initial transfer, but adds a second loading/recovery path for playback, links and collection resolution. This iteration keeps complete metadata in the compact payload, preserving immediate exact-ID resolution and synchronous downstream consumers. Both candidate sizes are reproducible with the profiling script. Existing normalized-text and eight-query result caches remain unchanged; worker-based search remains roadmap item 3.

Add, Edit, Notes, Data and Add-to-playlist dialogs now download on first use. Previously mounted dialogs retain their existing state behavior, and the persistent player remains mounted independently of dialog boundaries. Browser checks confirm the chunks are absent initially and that dialogs open with their existing focus behavior.

Catalog and artist aliases load as one cache transaction. HTTP, network, JSON or schema failures reject the request and clear its pending promise. Concurrent callers share an attempt; only successful results are cached. Alias failures cannot silently disable complete artist search. Retry revalidates HTTP resources and restores results in place; the title/season provider also receives the recovered catalog. Empty successful results remain distinct from loading errors.

## Reproduce and verify

```powershell
npm.cmd run lint
npm.cmd test
npm.cmd run build
node --import tsx scripts/profile-catalog.ts
node scripts/profile-initial-load.mjs
node tests/catalog-loading.mjs
node tests/browser-fixtures.mjs
git diff --check
```

Browser scripts now use the pinned Playwright development dependency and its matching Chromium browser (`npx playwright install chromium`). Set `BROWSER_CHANNEL=msedge` to use Edge as in these historical measurements; `PLAYWRIGHT_MODULE` can optionally point to another installation's `index.mjs`. These tools start temporary local servers and fresh browser contexts, and close them when finished. The mobile recovery screenshot is written to the system temporary directory as `catalog-recovery-mobile.png`.

Validation: TypeScript; all 93 service tests; production build; repeated HTTP failure and keyboard Retry for both catalog and aliases; successful/no-match search distinction; complete Heike results after recovery; all five deferred dialogs; note/playlist focus restoration; real catalog exact-ID media resolution despite unrelated filters; preserved media source during search; 390 px recovery layout inspection. Existing StrictMode sharing, catalog URL, player queue and collection ordering fixtures pass. Network/JSON/schema failures and valid empty catalogs are covered by loader tests. The default relative deployment base is verified under `/anime_db/`.
