# Search responsiveness — 2026-09-09

Catalog filtering and sorting now run in a dedicated browser worker. The baseline first broad query produced a median **1,822 ms main-thread task** under 4× CPU throttling. With the worker, the longest main-thread task during that interaction fell to **204 ms**. This removes the largest measured search stall; it does not eliminate all UI rendering work.

## Measurement

`scripts/profile-search.mjs` uses a production build, a temporary loopback server, fresh Edge contexts, and CDP 4× CPU throttling. External requests are blocked. Each of three runs changes the input through `h`, `he`, `Heike`, `IKE`, `Gundam`, and empty, then selects Openings, Endings, and All Themes. These are scripted query-prefix changes, not field INP measurements or physical low-end-device tests. Elapsed times include the existing 200 ms query debounce, Playwright interaction overhead, search and rendering. Long tasks come from the page's PerformanceObserver; worker computation is intentionally outside that main-thread measurement. CPU emulation is an approximation and need not throttle worker execution identically.

Baseline: commit `e47893b`, before worker changes. Values below are medians across three runs on the same local machine.

| Interaction | Before longest task | After longest task | Before results ready | After results ready |
| --- | ---: | ---: | ---: | ---: |
| First broad query `h` | 1,822 ms | 204 ms | 2,716 ms | 1,049 ms |
| Next prefix `he` | 241 ms | 236 ms | 807 ms | 742 ms |
| `Heike` | No task ≥50 ms | No task ≥50 ms | 330 ms | 295 ms |
| `IKE` | 237 ms | 233 ms | 732 ms | 681 ms |
| Openings, empty query | 465 ms | 221 ms | 798 ms | 648 ms |
| Endings, empty query | 512 ms | 206 ms | 826 ms | 654 ms |

The remaining roughly 200–245 ms main-thread tasks show that the worker is not a complete rendering optimization. Rendering the desktop and mobile row trees still happens on the main thread. Further row-render profiling would be a separate improvement.

## Implementation and tradeoffs

- One lazy module worker receives the already-loaded catalog and aliases once. There are no duplicate catalog downloads. Later messages contain query controls and any matching private-note song snapshots; responses contain only the requested page and counts. The worker performs no network or storage access.
- The shared search implementation preserves title/artist matching, ordering, deterministic ties, season/year/theme filtering, deduplication before pagination, canonical metadata precedence and the eight-query cache. Private additional matches bypass the query cache. Private note text stays in the UI; query strings sent to this local worker never become external requests or public URLs.
- Request IDs separate concurrent consumers. Abort signals release obsolete UI requests, and the existing effect guard also protects artist hydration and navigation. Aborting does not interrupt a calculation already executing in the worker; its late result is ignored.
- A worker startup/runtime error rejects pending requests and terminates the worker. The visible catalog Retry creates a fresh worker. Environments without Worker retain the existing synchronous implementation. A worker blocked by CSP remains an explicit retryable error rather than silently returning empty results.
- Keeping catalog metadata in both contexts increases memory use and adds one initial structured clone. Five fresh unthrottled runs measured first rows at 338–364 ms, median **347 ms**, versus the previous checkpoint's **265 ms**. That historical comparison is approximate; the extra startup cost is accepted to keep subsequent broad searches off the UI thread. The generated catalog remains 8.25 MB; initial JS is 502.20 kB and the worker adds 4.64 kB raw. Vite's existing >500 kB advisory remains.
- Saved Songs, Notes and canonical artist-ID requests retain their existing paths. This change targets repeated searches of the 38,821-song bundled catalog.

## Verification and reproduction

Run `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run build`, and `git diff --check`. Set `PLAYWRIGHT_MODULE` to an installed Playwright `index.mjs` if it is not a local dependency, then run:

```powershell
node scripts/profile-search.mjs
node scripts/profile-initial-load.mjs
node tests/browser-fixtures.mjs
node tests/catalog-loading.mjs
node tests/playlist-picker.mjs
```

The real-worker browser fixture compares complete page objects against the shared synchronous implementation across query variants, aliases, sort directions, filters, offsets beyond 500, unknown season, private-note merging and cancellation. A timer verifies the UI can run while the broad query computes. Unit tests cover out-of-order replies, aborts, worker failures, constructor/serialization errors and recreation on Retry. Production browser checks verify the worker under `/anime_db/`, catalog recovery, exact-ID media, sharing and playback preservation.

The playlist picker checks cover empty and selected states, counts, keyboard create/toggle, duplicate names, failed writes, atomic create-with-song, persistence, focus wrapping, Escape and focus restoration across desktop/mobile resizing. Screenshots were inspected at desktop and 390 px; overflow/focus checks also passed at 320×568 and 390×460. Browsers use isolated storage and temporary servers.
