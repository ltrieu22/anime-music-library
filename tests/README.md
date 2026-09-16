# Offline tests

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

Audit verification: 99 unit tests passed in about 2.9 seconds with no unmocked fetch attempts; all five browser fixtures and TypeScript checking passed. A deliberate blocked-fetch probe confirmed the unit runner exits with failure even when the fetch exception is caught. Historical ad hoc browser sessions were not measured.
