# AniList request behavior

Catalog browsing and filtering use the bundled song catalog. AniList is used for anime search and missing artwork/details.

- Full successful details are cached in `anime_details_v1` for seven days, with a maximum of 500 entries. Expiry is checked on demand; there is no background refresh. Invalid storage and failed lookups are not persisted as successful details.
- The existing cover URL cache lasts 30 days. The player uses this cache directly instead of fetching details just to display a cover.
- Hover lookups wait 400 ms and are canceled if the pointer leaves before then.
- Playback preloads only the current and next song. Visible queue rows can request their own missing artwork.
- Browser searches and artwork requests share `anilistClient.ts`. The Express proxy uses the same implementation, with one queue shared by its endpoints.
- Requests run serially, with at least 2.5 seconds between starts (at most 24 starts per minute per queue). Identical pending requests share a response; at most 20 distinct requests may be pending.
- HTTP 429/403/5xx, equivalent GraphQL errors, unreadable successful replies, network failures and exhausted rate-limit headers cause a cooldown of at least 60 seconds. Longer `Retry-After` or `X-RateLimit-Reset` values are respected when available. Requests time out after ten seconds.
- Queued requests encountering a cooldown finish without contacting AniList. There is no automatic retry loop. Empty artwork results also have a short in-memory cooldown.
- Browser pacing/cooldowns persist in `anilist_request_pacing_v1`. Web Locks coordinate same-origin tabs where supported. Without storage or Web Locks, cross-tab/reload coordination is limited; the in-memory queue still applies. Different visitors and separate server processes do not share a global quota.
- A proxy error response or empty artwork result does not trigger another direct AniList call from the browser. Static hosting can still use the direct client when the proxy is absent.

The pacing is deliberately below the temporarily reduced limit published in [AniList's rate-limit documentation](https://docs.anilist.co/guide/rate-limiting). Outage handling also follows [AniList's API stability guidance](https://docs.anilist.co/guide/considerations).

## Verification

`npm test` covers pacing, deduplication, bounded queues, rate-limit/reset headers, GraphQL errors, outages, persisted cooldowns, cache expiry/capacity/corruption, and proxy fallback behavior with fake responses.

After `npm run build`, `node tests/anilist-usage.mjs` checks the real UI's brief hover behavior, detail reuse after reload, and cooldown persistence across reloads and tabs. All provider requests are fulfilled locally or aborted. Set `PLAYWRIGHT_MODULE` if Playwright is installed outside the project.

The implementation passed 109 unit tests, TypeScript checking, the production build, the AniList-usage browser test and all five existing browser fixtures. No live AniList requests were made during verification.
