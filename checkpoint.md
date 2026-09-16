# Anime Song Database — checkpoint

Updated: 2026-09-16

## Current state

Latest change: roadmap item **8 completed**. Supported Media Session controls show song/artist/anime/artwork and handle play, pause, previous, next and seeking through the existing player. Native media events synchronize state/position; close removes metadata and handlers. Partial/absent support degrades gracefully. See [device media controls](docs/device-media-controls.md). The restored-session banner is now a compact “Session restored” notification that disappears after 3.5 seconds.

Implemented: bilingual titles/search, artist matching, season/year filters, pagination, local Saved Songs and named playlists, notes, backups, audio/video playback, editable queues, Play next, explicit repeat modes, drag reordering, remembered volume, recent songs, paused queue/position restoration, and public song/search links.

Latest changes: roadmap item **7 completed**. My Collection includes **Recent songs**, with the latest 100 distinct listened songs, replay, timestamps and confirmed clear with failed-save retry. History starts only when media actually plays; it stays separate from Saved Songs/playlists/notes and synchronizes across tabs. Reopening restores queue occurrence IDs, current index, position and repeat mode **paused, without calling Play**. Closing clears the saved queue. Invalid/older data, unavailable media, storage errors and retry are handled. Repeat now sits directly beside Next in the playback group; small screens stack controls with matching player/queue clearance. Details: [history and restoration](docs/playback-restoration.md).

Item **6 remains complete**. Play next inserts fresh occurrences immediately after current without interruption; Add to queue appends. Off / One / All remain explicit. One repeats natural endings while manual Next advances; All wraps the retained queue including history. Edits preserve the selected mode. A restored queue now restores that mode too; a fresh page without a saved queue starts Off. Details: [queue and repeat behavior](docs/player-queue.md).

**Analytics canceled and removed at the user's request (2026-09-11).** Application code, dependencies and deployment configuration are restored to the pre-analytics version at c501edf; existing API caching, pacing and playback behavior are preserved. Analytics was never published to GitHub Pages, and no activity events were collected. The Cloudflare Worker, secrets, hourly trigger and empty database have been deleted. The task-specific Wrangler login, encryption key and installed credential helper are removed. The owner deleted the GitHub OAuth application, and its settings now return 404. No analytics repository/environment variable was created. Do not resume analytics unless the user explicitly requests it.

Rollback verification: TypeScript, all 109 service tests, production build, five browser fixtures and the mocked AniList usage check pass. Rebuilt browser assets contain no analytics integration. The public site remains available and origin/main remains at c501edf. Only this checkpoint differs from the committed source; no rollback commit or public deployment was needed.

Earlier changes: roadmap item **5 completed**. My Collection now includes Manage playlists with checkbox selection, selected counts, Select all, Cancel/Done and named bulk-delete confirmation. Deletion uses one storage write, protects Saved Songs, and preserves notes, other memberships and the active playback queue. Roadmap items **3–4 are also complete**. Catalog filtering/sorting now runs in a worker with request IDs, canceled-request protection, bounded caching and retryable worker failures. Add to playlist now has a charcoal/emerald song summary with anime cover art from the existing cover cache/lookup (music-icon fallback), playlist counts and selected rows, improved spacing, and atomic create-and-add. Full measurements and tradeoffs: [search responsiveness](docs/search-responsiveness.md). Earlier compact loading and deferred dialogs remain; see [initial-load performance](docs/initial-load-performance.md).

This roadmap replaces the long batch history. Planned items are not completed features or permission to implement everything at once. Work on the user-selected item, verify it, then update this file. Inspect Git status and preserve existing edits.

Earlier batches 18–20 remain canceled: do not revive external enrichment runs, the proposed anime-discovery metadata index, or advanced anime-attribute filters. A compact index of existing searchable song fields below is a separate performance proposal.

## Prioritized roadmap

| Priority | Work | Expected result / completion check |
| --- | --- | --- |
| 1 | **Complete — Catalog loading recovery** | Persistent error and keyboard-accessible Retry; HTTP/network/JSON/schema and alias failures remain retryable. Browser Retry restores results without reloading. |
| 2 | **Complete — Initial-load performance** | Profiled transfer, parsing and first rendered rows. Lossless payload: 17.40 → 8.25 MB; local median first rows: 377 → 265 ms. Five dialogs load on demand. Search-only/deferred metadata evaluated; full metadata retained. Complete search, exact-ID media and `/anime_db/` verified; see measurement report. |
| 3 | **Complete — Search responsiveness** | Profiled query prefixes and filters at 4× CPU throttle. Worker preserves matching, ordering, pagination and private-note merging; obsolete requests cannot replace current results. Broad-query median longest main-thread task: 1,822 → 204 ms. Worker failures recover through Retry. See report for remaining rendering work and startup cost. |
| 4 | **Complete — Redesign Add to playlist** | Charcoal/emerald song summary, playlist icons/counts/selected states, clearer spacing and create section. Atomic create-and-add, visible validation/storage errors, keyboard toggles/focus, mobile overflow and focus restoration verified. |
| 5 | **Complete — Manage multiple playlists** | **Manage playlists** in My Collection offers checkboxes, selected count, Select all, Cancel/Done and **Delete selected (N)**. Confirmation lists selected names. Atomic deletion protects Saved Songs, notes and other memberships. Cancellation, failed-save retry, persistence, mobile/keyboard access and uninterrupted active-playlist playback/Next verified. |
| 6 | **Complete — Play next and explicit repeat** | Song/player menus insert immediately after current; Add to queue still appends. Explicit Off / Repeat one / Repeat all controls preserve occurrence IDs and uninterrupted playing/paused media. Natural endings, manual Next, duplicates, clear/remove, keyboard/focus and narrow layouts verified. |
| 7 | **Complete — Recent songs and session restoration** | Last 100 distinct songs in My Collection, replay, local times, confirmed clear and storage retry. Queue/current position/repeat restore paused after reload/reopening; duplicates, custom IDs, missing media and corrupt/unsupported data verified. Closing clears the saved queue. |
| 8 | **Complete — Device media controls** | Media Session metadata/artwork, explicit play/pause, existing previous/next/repeat semantics and clamped seeking. Native state/position synchronization, close/unmount cleanup and partial/absent API support verified. |
| 9 | Mobile layout polish | Reduce horizontal scrolling in navigation and decade controls. Check narrow screens, long titles, touch targets and player/queue clearance. |
| 10 | Undo removals | Brief Undo action for removing songs from Saved Songs or playlists. Restore identity, membership and order without affecting other lists or notes; expose storage failures. |

Next priority is **9 — Mobile layout polish**, when requested. Items 9 onward are not implemented. Inspect existing queueing, repeat, restoration and drag behavior before extending it; do not reimplement completed features.

## Recent work to preserve

AniList usage protections are implemented locally: shared serialized/paced requests, persisted rate-limit/outage cooldowns, seven-day successful detail caching, 30-day cover-URL caching (bounded to 500 entries), a 400 ms hover delay, and shared in-flight lookups. Playback prepares only the current and next track; the queue lazily looks up missing covers near visible rows. See `docs/anilist-api-usage.md`, `src/services/anilistClient.ts`, `animeDetailsCache.ts`, `coverCache.ts`, `api.ts`, and `server.ts`. Keep these protections in place. GraphQL returns metadata/image URLs; actual image downloads are separate requests. Offline unit setup and browser request interception prevent tests from calling live providers. The API changes passed 109 service tests, the browser fixtures and a dedicated mocked usage check.

Manage playlists now replaces the existing header buttons with Done, Select all and Delete (count), with no extra toolbar row. Shared alignment keeps card icons/text in place in both modes; Done exits selection, while deletion dialogs retain Cancel. `tests/playlist-management.mjs` checks card, icon and text coordinates at 1280, 390 and 320 px plus selection/deletion/playback behavior. Latest UI typecheck, build and browser checks passed. These changes belong to the pre-analytics version at commit c501edf and remain intact.

## Later work

- **Accounts and usernames:** choose a managed authentication provider and database; preserve guest use, recovery and account isolation. GitHub Pages alone cannot provide private cloud storage.
- **Cloud Saved Songs:** depends on accounts; preview local migration, preserve IDs/order/custom songs, support retries and account switching. Notes and named playlists remain local unless separately requested.
- **Cross-device validation:** verify two accounts/devices, access rules, concurrent changes, offline recovery and backups before declaring cloud persistence complete.
- Shared/public playlists and cloud notes/full playlist sync remain outside the current roadmap.

## Contracts to preserve

- Canonical catalog: `public/data/anime_catalog.json`, 38,821 songs; `dist/` is generated. Search English, romaji and alternate titles regardless of display language. Fold Latin accents without collapsing Japanese voicing; retain correct artist phrase/ID matching.
- Filter, deduplicate and sort all matches before pagination (100 rows in the UI). Keep catalog IDs, `source_song_id`, manual `local_song_id`, playlist IDs and queue occurrence IDs distinct. Never renumber saved songs during reorder/removal.
- Catalog/recent-song clicks start one song; collection clicks use the visible list. Queue append/Play next/reorder and repeat changes must not interrupt media. Queue/current position/repeat persist locally and restore paused, with no autoplay request. Closing or removing the final current occurrence clears the saved queue. Repeat is explicit and defaults Off without a saved queue; One replays on natural endings, All wraps the retained queue including history. Queue edits preserve the setting; removing current still advances or closes when no successor remains. Listening history is separate and clearable.
- Saved Songs, playlist memberships and notes are independent. Preserve guest data, empty libraries and visible storage errors. Never clear browser storage or repeat completed title enrichment as setup.
- Backup v2 contains entries, notes and playlists; v1 preserves playlists; legacy imports replace songs only. Keep preview, validation and rollback. Queue, listening history, catalog and display preferences are outside the current backup format.
- Routine search/filter changes keep URLs clean; history restores the catalog on Back/Forward/reload. Share search explicitly serializes public controls. Private queries/notes never enter public URLs or external requests; tabs keep separate search state.
- Song links use exact public IDs, including saved `source_song_id`, and omit catalog queries. Sharing/filtering must not restart playback. Keep custom-song, missing-media and blocked-autoplay feedback. Share search retains its dialog.
- Preserve keyboard access, focus restoration, reduced motion, responsive playback and remembered volume (40% default, stored zero valid). Missing season metadata remains Unknown; do not invent a season.

## Code map

| Area | Entry points |
| --- | --- |
| Main UI | `src/App.tsx`, `src/components/SongTable.tsx`, `FilterBar.tsx` |
| Sharing / URL state | `src/context/SongShareContext.tsx`; `src/services/songSharing.ts`, `catalogUrlState.ts`, `useCatalogSearchState.ts` |
| Catalog performance | `src/services/catalogEngine.ts`, `catalog.worker.ts`, `catalogWorkerClient.ts`, `catalogSearchSession.ts`, `catalogResults.ts`, `catalogSearch.ts`, `searchText.ts`; `scripts/profile-search.mjs` |
| Catalog loading / transport | `src/services/catalogLoader.ts`, `catalogPayload.ts`; `scripts/catalogAsset.ts`, `profile-catalog.ts`, `profile-initial-load.mjs` |
| Playlists | `src/components/collection/PlaylistSongPicker.tsx`, `CollectionLibrary.tsx`; `src/context/PlaylistsContext.tsx`; `src/services/playlistsStorage.ts` |
| Playback | `src/context/PlayerContext.tsx`, `src/services/playerQueue.ts`, `playbackStorage.ts`, `src/components/player/`, `src/components/collection/RecentSongs.tsx` |
| Local data / backups | `src/services/api.ts`, `notesStorage.ts`, `dataBackup.ts`; `src/components/DataModal.tsx` |

## Verification and handoff

Item 8 validation (2026-09-16): TypeScript, all **122 service tests**, production build, five browser fixtures, production playback-restoration and Play next/repeat regressions pass. New `tests/media-session.mjs` passes supported/partial/absent API scenarios with real local WAV playback and instrumented device actions. Covers metadata, idempotent play/pause, seek offsets/clamps/invalid values, previous restart, next/repeat boundaries, reload without autoplay and close cleanup. Physical lock-screen/headset behavior remains a manual device check. Existing Vite chunk advisory remains (initial JS approximately 530 kB). Changes remain local and unpublished; item 9 is next.

Item 7 and repeat-placement validation (2026-09-15): TypeScript, all **122 service tests**, production build and the five existing browser fixtures pass. Production `tests/playback-restoration.mjs` passes with actual local WAV audio: paused reload/reopening, exact position and duration clamp, repeat/duplicate identities, history replay/deduplication, clear cancellation/failure/retry, session/history save retry, cross-tab clearing, close persistence, missing media and corrupt/future data. Seven player widths (2560, 1280, 1024, 768, 640, 390, 320 px) pass control bounds/overlap checks; desktop and phone screenshots were visually reviewed. Play next/repeat, playlist management, playlist picker and production catalog-loading regressions pass. Tests use isolated storage and block external providers. The existing Vite chunk advisory remains (initial JS approximately 527 kB). Work is local and unpublished; item 8 is next.

Item 6 validation (2026-09-13): TypeScript, all **112 service tests**, production build and five browser fixtures pass. The player fixture includes 14 integration checks and preserves live drag/keyboard reorder. `node tests/play-next-repeat.mjs` verifies the production `/anime_db/` UI with real local WAV audio: Play next/append order, duplicate occurrences, natural repeat/end events, manual Next, uninterrupted playing/paused/completed media, clear upcoming with Repeat all, disabled unavailable tracks, keyboard/focus restoration and no reload autoplay. Player/queue screenshots at 1280×900, 390×460 and 320×568 were visually checked; overflow and repeat touch targets pass. All browser tests use isolated storage and block external providers. Existing Vite chunk advisory remains (initial JS approximately 513 kB). Changes remain local and unpublished; pre-existing checkpoint edits are preserved.

Playlist management validation: production-browser checks cover selection/deselection, Select all, Cancel/Escape/Done, named confirmation, keyboard focus, atomic failed-save retry, reload persistence, deleting every custom playlist, nonempty notes and shared memberships. Real local audio continues when its source playlist is deleted, and Next advances the retained queue. Desktop and 390 px screenshots were visually checked; 320×568 and 390×460 selection/dialog overflow checks pass. Existing single-delete cancellation, picker and collection-order regressions pass.

Earlier code validation: TypeScript, all **99 service tests**, production build and whitespace checks passed. Real-worker browser checks cover result parity, aliases, offsets beyond 500, private-note merging, cancellation and Retry. Production loading/media and existing sharing, catalog URL, player queue and collection ordering fixtures pass. Playlist tests cover keyboard create/toggle, counts, duplicate names, storage failures, persistence and focus restoration after resizing. Desktop and 390 px picker screenshots were visually checked; 320×568 and 390×460 overflow/focus checks pass. Vite still reports the >500 kB chunk advisory (initial JS 505.82 kB, worker 4.64 kB).

Performance: canonical catalog remains **17.4 MB**, generated client payload **8.25 MB** raw / **1.84 MB** gzip. At 4× CPU throttle the broad-query longest main-thread task improved **1,822 → 204 ms**, and results-ready time **2,716 → 1,049 ms**. Initial worker cloning/startup adds cost: current unthrottled median first rows **347 ms**, compared with the earlier checkpoint's **265 ms**. The worker keeps an extra catalog copy; remaining row-render work can still cause ~200–245 ms tasks under throttling. These local measurements are not production-network or physical-device guarantees. See the search responsiveness report.

For code changes: `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run build`, `git diff --check`, plus relevant browser checks. Fixtures: `/tests/song-sharing.html`, `/tests/catalog-url.html`, `/tests/player-queue.html`, `/tests/collection-order.html`. Preserve the user's normal browser data. For documentation-only edits, review the diff and run the whitespace check.

Useful regressions: Heike matches only `song-34830`/`song-34831`; legitimate IKE/SPYAIR aliases work; accented/unaccented fhána matches agree; pagination reaches results beyond 500; sharing/filtering preserve playback.

Browser runners: `node tests/catalog-loading.mjs`, `node tests/browser-fixtures.mjs`, `node tests/playlist-picker.mjs`, `node tests/playlist-management.mjs`, `node tests/play-next-repeat.mjs` and `node tests/playback-restoration.mjs` use temporary local servers and isolated storage. Production uses `/anime_db/`. This pass started clean on `main` at `9008fde`; it leaves local uncommitted changes and does not publish. For manual testing, run `npm.cmd run dev` and open **http://localhost:3000**.
