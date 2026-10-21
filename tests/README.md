# Offline tests

- Run `npm ci`, `npx playwright install chromium`, and `npm run build`, then `npm run test:browser` for the complete browser suite. Playwright is pinned in `package.json` and the lockfile; the default browser is its matching Chromium. On Linux, `npx playwright install --with-deps chromium` also installs system dependencies. `BROWSER_CHANNEL=msedge` optionally selects installed Edge. CI runs the same suite after TypeScript, unit tests, and build checks, and deploys only after success; pull requests never deploy.

- `node tests/collection-reliability.mjs` checks failed manual/theme adds and edits with retained drafts and successful retries, reset rollback when either songs or notes cannot be written, preserved playlists/player on failure, exact-ID media recovery despite edited titles, unavailable media without identity guessing, and Add/Edit/Data dialog semantics, keyboard focus, Escape and layout at 320/390 px. It uses disposable storage and local/mock responses; external providers are blocked.

- After building, `node tests/mobile-layout.mjs` checks navigation, filter behavior, mobile touch targets, long unbroken titles, page overflow and queue/player clearance at six widths (320-1280 px). Uses isolated storage and blocks external providers; screenshots go to the system temporary directory.

- After building, `node tests/removal-undo.mjs` verifies Saved Songs, playlist memberships/single/bulk deletion and queue/current/Clear upcoming Undo, original IDs/order, keyboard access, cursor feedback, storage retry, focus-paused five-second expiry, notes, uninterrupted local audio and paused tail restoration. It uses isolated storage and blocks external providers.

- After building, `node tests/media-session.mjs` verifies device metadata/actions, seeking, repeat boundaries, paused restoration, cleanup and partial/absent API support using an instrumented Media Session, real local WAV audio, isolated storage and blocked external providers.

- `npm test` runs unit tests with `offline-unit-setup.mjs`. Unmocked fetches are blocked and fail the suite, even if application code catches the error. Provider tests must supply fake responses.
- `node tests/browser-fixtures.mjs` runs the five integration fixtures sequentially against local Vite. External requests are aborted before reaching the network. Browser contexts and the server close when the runner finishes.
- After building, `node tests/anilist-usage.mjs` verifies hover delays, persistent details and cooldowns across reloads/tabs with locally mocked AniList responses; all other external requests are blocked.
- The fixture HTML pages restrict connections, images, and media to local resources (plus data/blob media). The player fixture supplies fake artwork, so manually opening it does not query AniList.
- Production browser tests (`catalog-loading.mjs`, `playlist-picker.mjs`, `playlist-management.mjs`) and performance scripts also block external requests. Their harness serves local build files; it does not run the Express API proxy.
- After building, `node tests/play-next-repeat.mjs` checks Play next and explicit repeat in the production UI, using local WAV audio with byte-range support for real seeking/end events. It covers playing/paused/completed media, duplicates, keyboard/focus, unavailable tracks and 1280/390/320 px layouts, with isolated storage and blocked external requests.
- After building, `node tests/playback-restoration.mjs` checks paused reload/reopening, saved positions and repeat/occurrence identities, recent replay and clearing, corrupt data, missing media, storage failure/retry, cross-tab history, and player control bounds/overlap at seven widths from 320 to 2560 px. It uses local WAV audio and isolated storage, with all external requests blocked.
- Performance scripts run a bounded number of local trials: five initial-load trials or three search trials. They are not background monitors or scheduled jobs.

`npm run enrich:titles` is a separate data-maintenance command that makes real **AniSongDB** requests. It is not part of the test command and does not use AniList. Enrichment unit tests inject fake responses.

Historical audit verification: 99 unit tests passed in about 2.9 seconds with no unmocked fetch attempts; all five browser fixtures and TypeScript checking passed. A deliberate blocked-fetch probe confirmed the unit runner exits with failure even when the fetch exception is caught. Historical ad hoc browser sessions were not measured. The current suite includes additional regression tests; the commands above report current results.
