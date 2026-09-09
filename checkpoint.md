# Anime Song Database — checkpoint

Updated: 2026-09-09

## Current state

Implemented: bilingual titles/search, artist matching, season/year filters, pagination, local Saved Songs and named playlists, notes, backups, audio/video playback, editable queues, drag reordering, remembered volume, and public song/search links.

Latest changes: roadmap item **5 completed**. My Collection now includes Manage playlists with checkbox selection, selected counts, Select all, Cancel/Done and named bulk-delete confirmation. Deletion uses one storage write, protects Saved Songs, and preserves notes, other memberships and the active playback queue. Roadmap items **3–4 are also complete**. Catalog filtering/sorting now runs in a worker with request IDs, canceled-request protection, bounded caching and retryable worker failures. Add to playlist now has a charcoal/emerald song summary with anime cover art from the existing cover cache/lookup (music-icon fallback), playlist counts and selected rows, improved spacing, and atomic create-and-add. Full measurements and tradeoffs: [search responsiveness](docs/search-responsiveness.md). Earlier compact loading and deferred dialogs remain; see [initial-load performance](docs/initial-load-performance.md).

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
| 6 | Play next and explicit repeat | Add to queue already appends; Play next is an optional shortcut inserting immediately after the current song. Add explicit Off / Repeat one / Repeat all controls with defined queue behavior. Preserve occurrence IDs and uninterrupted playback. |
| 7 | Recent songs and session restoration | Local listening history and queue/current-position restoration after reopening. Keep history clearable, avoid unexpected autoplay, and handle unavailable tracks and older stored data. |
| 8 | Device media controls | Supported Media Session metadata and play/pause/previous/next/seek actions. Keep device controls synchronized with the player; degrade gracefully where unsupported. |
| 9 | Mobile layout polish | Reduce horizontal scrolling in navigation and decade controls. Check narrow screens, long titles, touch targets and player/queue clearance. |
| 10 | Undo removals | Brief Undo action for removing songs from Saved Songs or playlists. Restore identity, membership and order without affecting other lists or notes; expose storage failures. |

Next priority is **6 — Play next and explicit repeat**, when requested. Items 6 onward were not implemented in this pass. Inspect existing queueing and drag behavior before extending it; do not reimplement completed features.

## Later work

- **Accounts and usernames:** choose a managed authentication provider and database; preserve guest use, recovery and account isolation. GitHub Pages alone cannot provide private cloud storage.
- **Cloud Saved Songs:** depends on accounts; preview local migration, preserve IDs/order/custom songs, support retries and account switching. Notes and named playlists remain local unless separately requested.
- **Cross-device validation:** verify two accounts/devices, access rules, concurrent changes, offline recovery and backups before declaring cloud persistence complete.
- Shared/public playlists and cloud notes/full playlist sync remain outside the current roadmap.

## Contracts to preserve

- Canonical catalog: `public/data/anime_catalog.json`, 38,821 songs; `dist/` is generated. Search English, romaji and alternate titles regardless of display language. Fold Latin accents without collapsing Japanese voicing; retain correct artist phrase/ID matching.
- Filter, deduplicate and sort all matches before pagination (100 rows in the UI). Keep catalog IDs, `source_song_id`, manual `local_song_id`, playlist IDs and queue occurrence IDs distinct. Never renumber saved songs during reorder/removal.
- Catalog clicks start one song; collection clicks use the visible list. Queue append/reorder must not interrupt media. The current queue is session-only and clears on player close, until restoration is implemented. Preserve current wrap/stop behavior until explicit repeat controls replace it.
- Saved Songs, playlist memberships and notes are independent. Preserve guest data, empty libraries and visible storage errors. Never clear browser storage or repeat completed title enrichment as setup.
- Backup v2 contains entries, notes and playlists; v1 preserves playlists; legacy imports replace songs only. Keep preview, validation and rollback. Queue/catalog/display preferences are outside the current backup format.
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
| Playback | `src/context/PlayerContext.tsx`, `src/services/playerQueue.ts`, `src/components/player/` |
| Local data / backups | `src/services/api.ts`, `notesStorage.ts`, `dataBackup.ts`; `src/components/DataModal.tsx` |

## Verification and handoff

Playlist management validation: production-browser checks cover selection/deselection, Select all, Cancel/Escape/Done, named confirmation, keyboard focus, atomic failed-save retry, reload persistence, deleting every custom playlist, nonempty notes and shared memberships. Real local audio continues when its source playlist is deleted, and Next advances the retained queue. Desktop and 390 px screenshots were visually checked; 320×568 and 390×460 selection/dialog overflow checks pass. Existing single-delete cancellation, picker and collection-order regressions pass.

Latest code validation: TypeScript, all **99 service tests**, production build and whitespace checks passed. Real-worker browser checks cover result parity, aliases, offsets beyond 500, private-note merging, cancellation and Retry. Production loading/media and existing sharing, catalog URL, player queue and collection ordering fixtures pass. Playlist tests cover keyboard create/toggle, counts, duplicate names, storage failures, persistence and focus restoration after resizing. Desktop and 390 px picker screenshots were visually checked; 320×568 and 390×460 overflow/focus checks pass. Vite still reports the >500 kB chunk advisory (initial JS 505.82 kB, worker 4.64 kB).

Performance: canonical catalog remains **17.4 MB**, generated client payload **8.25 MB** raw / **1.84 MB** gzip. At 4× CPU throttle the broad-query longest main-thread task improved **1,822 → 204 ms**, and results-ready time **2,716 → 1,049 ms**. Initial worker cloning/startup adds cost: current unthrottled median first rows **347 ms**, compared with the earlier checkpoint's **265 ms**. The worker keeps an extra catalog copy; remaining row-render work can still cause ~200–245 ms tasks under throttling. These local measurements are not production-network or physical-device guarantees. See the search responsiveness report.

For code changes: `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run build`, `git diff --check`, plus relevant browser checks. Fixtures: `/tests/song-sharing.html`, `/tests/catalog-url.html`, `/tests/player-queue.html`, `/tests/collection-order.html`. Preserve the user's normal browser data. For documentation-only edits, review the diff and run the whitespace check.

Useful regressions: Heike matches only `song-34830`/`song-34831`; legitimate IKE/SPYAIR aliases work; accented/unaccented fhána matches agree; pagination reaches results beyond 500; sharing/filtering preserve playback.

Browser runners: `node tests/catalog-loading.mjs`, `node tests/browser-fixtures.mjs`, `node tests/playlist-picker.mjs` and `node tests/playlist-management.mjs` use temporary local servers and isolated storage. Production uses `/anime_db/`. Repository started clean on `main` at `e47893b`; this pass leaves local uncommitted changes and does not publish. A development server is started at **http://localhost:3000** for the requested manual testing.
