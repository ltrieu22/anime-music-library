# Anime Song Database — checkpoint

Updated: 2026-09-08

## Direction and status

Build a convenient place to find, save, organize, and listen to anime songs. Prioritize playback, queues, playlists, song sharing, and library persistence.

- **Complete:** batches 1, 2, 4–17, and 21–22.
- **Canceled:** batches 18–20. The proposed anime-discovery metadata index, external enrichment runs, and advanced anime-attribute filter pills are no longer wanted. Do not implement or restore this work. Batch 18 had research only; this chat made no implementation changes.
- **Next eligible:** batch 23 — drag to reorder songs (inspect the existing drag implementation before selecting remaining work).
- **Still planned:** batches 23–26 below. None is started by this implementation.

Batch numbers stay unchanged so earlier references remain meaningful. Work on one user-selected batch per session, verify it, update this checkpoint, and stop before the next batch. Inspect `git status` first and preserve unrelated work.

## Completed work

| Batches | Delivered |
| --- | --- |
| 1–2 | Correct artist-alias matching and accessible in-site song removal |
| 4–6 | Bilingual catalog titles, completed title enrichment, remembered EN/JP display and bilingual search |
| 7–8 | Editable playback queue, Add to queue, responsive queue panel and move controls |
| 9–11 | My Collection library, Saved Songs, named playlists, membership/order/playback and versioned backups |
| 12–14 | Clickable artist cursors, player entrance animation and remembered master volume (40% default) |
| 15–16 | Accent-insensitive search/highlighting and complete catalog pagination |
| 17 | Season/year labels, basic season filter, chronological sorting and backward-compatible saved metadata |
| 21 | On-demand shareable catalog searches, clean routine URLs, reload/Back/Forward restoration through history state and private-tab isolation |
| 22 | Share dialogs in song actions/player, stable public playback links, native share/copy/manual fallback, blocked-playback recovery and explicit link/media errors |

These features are implemented; their old proposals, step-by-step histories, superseded next prompts, temporary QA ports and bundle filenames are no longer needed here. Do not repeat the completed catalog enrichment or browser-data cleanup.

## Behavior to preserve

### Listening and library

- Clicking a song title starts the shared bottom player and replaces its playback context. A catalog click starts one song; Saved Songs and playlist clicks use their visible list. Preserve list wrapping versus single-song/finite-queue stopping behavior.
- Add to queue appends without interrupting playback. Queue occurrences have their own IDs, allowing repeated songs. Reordering upcoming songs must not restart the current media. The queue is session-only; closing the player clears it.
- My Collection contains built-in Saved Songs and named playlists. Catalog Save adds to Saved Songs; playlist membership is separate. Removing from one list preserves other memberships and personal notes.
- Saved Songs defaults to `#` ascending. Saved IDs increase when entries are added and never change under filtering or removal. Named playlists keep their own stored order.
- Keep stable catalog IDs, `source_song_id`, manual-song `local_song_id`, playlist identities and queue occurrence IDs distinct. Display-title changes must not affect identity or playback.
- Video and audio-only songs use the same player. Volume survives reload, close/reopen and track changes; default is 40%, stored zero is valid, and mute is transient. Wheel adjustments use 2% steps. Device/browser restrictions on media volume still apply.

### Search and catalog

- `public/data/anime_catalog.json` is the canonical **38,821-song** source. `dist/data/anime_catalog.json` is generated output; do not recreate the removed duplicate under `data/`.
- All canonical rows have English/romaji titles and alternate-title arrays. JP means romaji. Search all title variants regardless of the display preference.
- Shared search folds Latin accents, including decomposed accents, without changing display text or Japanese voicing distinctions. Artist aliases use phrase boundaries; canonical artist-ID search remains separate.
- Catalog pages show 100 rows. Shared results support bounded `limit` (1–500), `offset`, `total` and `hasMore`; filter/deduplicate/sort the full result set before slicing. Query/filter/sort changes reset the page; stale responses must not replace newer results.
- Private-note matches merge locally before filtering and pagination; canonical records win duplicate IDs. Never send private note text to external services or public URLs. Exact-artist searches retain only that artist's results.
- Keep existing year, season and song-theme controls. The default year range is **1924–2026**. Season means the anime's catalog season, not the song's release date. Order is Winter → Spring → Summer → Fall; missing seasons/years stay Unknown rather than being guessed.
- Optional `anime_vintage`/`anime_season` fields survive saved-song, note, playlist and backup paths. Old snapshots fill missing metadata by exact catalog identity without automatic storage rewrites.

### Public search URL contract (batch 21)

- `src/services/catalogUrlState.ts` owns `q`, `yearMin`, `yearMax`, `season`, `theme`, `artists`, `sort`, `order`, and `page`. Defaults are omitted: empty query, 1924–2026, ALL season/theme, no artists, anime_year descending, page 1. Pages are one-based in URLs and zero-based internally.
- Seasons use Winter/Spring/Summer/Fall/UNKNOWN; themes use OP/ED/IN. Sort keys match the existing table. Invalid values fall back safely; reversed valid years are ordered; artist IDs are positive safe integers, deduplicated and sorted. Exact artist IDs take precedence over `q`; labels are never serialized and restored filters display the IDs.
- Routine typing and filter, sort and page changes remove catalog parameters from the address bar. An explicit **Share search** action generates a reviewable link containing the current public controls without navigating or changing playback; it omits `play` and preserves the deployment path, hash and unrelated parameters.
- Shared search links still restore on open. Routine navigation stores validated catalog state in `history.state`: typing replaces after 200 ms, deliberate filter/sort/page/reset changes push, and out-of-range page corrections replace. Back/Forward and reload restore the view without exposing ordinary searches in the URL, and pending typing is canceled without synchronization loops.
- Catalog, Saved Songs and Notes retain separate in-memory search/filter state. Private queries never transfer into public URL state when changing tabs. Stored note contents and library data are never serialized; local note matches still depend on the current browser's notes.
- Browser regression harness: `/tests/catalog-url.html` on the Vite dev server. Click Run URL checks; it uses no browser storage and exercises the hook in React StrictMode.

### Catalog loading performance

- The canonical catalog is 16.6 MB uncompressed and about 1.9 MB with gzip, so the first visit still has a real download and JSON-parse cost. Local measurement was about 49 ms to parse the 38,821 rows.
- Empty searches skip per-song text normalization. Season/year metadata is computed once per result compilation, normalized song text is cached on stable catalog objects, and the last eight filtered/sorted result sets are cached without their page offset. Page changes therefore reuse ordering rather than filtering and sorting all 38,821 songs again.
- The Saved Songs playback-fallback index is built only after entering My Collection instead of during initial catalog display. These caches are memory-only and contain bundled public metadata; personal-note result merges continue to bypass the shared result cache.

### Public song links (batch 22)

- `?play=song-34830` resolves an exact ID from the full bundled catalog, regardless of query, filters or page. Initial load and a changed `play` ID on Back/Forward prepare a single-song playback context. Search changes, same-ID history entries, sharing and copying never restart media. Closing the player does not remove the URL parameter or reopen the player until the ID changes or the page reloads.
- Share song appears in song action menus (including saved lists/playlists/Notes) and the player. A dialog shows the link before invoking native Share or Copy link; failed native sharing falls back to clipboard, and failed/unavailable clipboard access leaves a selectable link. Native cancellation never copies silently. Dialog close/Escape restores focus.
- Saved copies use `source_song_id`; player tracks retain that identity through `animeTitles`. Numeric saved IDs, local IDs and metadata guesses never become public IDs. Custom songs explain why no public link is available.
- Generated song links remove all public search parameters, including queries that might match notes, and replace `play`; pathname, hash and unrelated parameters survive. Sharing does not change the current address or playback.
- Invalid IDs, missing catalog songs and absent media have visible errors. Playback failures show a notice above the player; blocked autoplay offers the existing Play control with remembered volume intact. Loading failures can be retried with Play; catalog loading failures instruct a reload.
- The narrow-screen player uses two rows with a matching queue offset and page spacer to fit Share alongside existing controls.
- Browser harness: `/tests/song-sharing.html` on Vite. It uses an in-memory library, fixture catalog and simulated media/native sharing/clipboard; it never sends a real share or modifies the user's stored library.

### Browser identity

- `index.html` uses the existing `public/marcille.png` as the PNG favicon. Vite resolves it at both `/marcille.png` in development and the configured GitHub Pages base path in production.

### Local data and backups

- Keep guest/local use working. Do not clear browser storage, auto-migrate away users' songs, or reseed an empty library.
- Backup v2 contains `{ version: 2, entries, notes, playlists }`, preserving order, IDs and metadata snapshots. Queue, catalog and display preferences are outside the backup.
- Import previews replacement scope: v2 replaces all three sections; v1 replaces saved songs/notes and preserves playlists; legacy arrays replace only saved songs. Empty included sections clear that section. Invalid/future versions are rejected.
- Storage failures must remain visible. Import attempts rollback on write failure and closes playback only after success. Local storage is not crash-safe transactional storage; cross-tab writes remain last-writer-wins.
- Existing Reset targets saved songs/notes and preserves playlists. Removal dialogs preserve focus, keyboard cancellation and notes.

## Remaining batches

### 23 — Drag to reorder songs

Dependencies: completed queue, playlist and backup work. Implement queue dragging first; saved lists can be a separate session.

- Add touch/pointer/keyboard handles while retaining move-up/down alternatives. Queue changes must preserve current playback and occurrence identity.
- Saved Songs retains `#` ascending by default; add an explicit Manual order with separate persisted positions, never renumber IDs. Preserve independent playlist orders.
- Disable dragging when filters or a non-manual sort hide the full order, with an explanation. Catalog result ranking is not manually reorderable.
- **Done when:** order drives playback, saved positions survive reload/backup, cancellation is safe, and other lists are unaffected.

### 24 — Managed accounts and usernames

External prerequisite: select/configure an authentication provider and database. No provider is chosen; GitHub Pages alone cannot store private per-user data.

- Use managed password hashing/authentication and a stable user ID separate from the unique normalized username. Email/password plus a username is the initial scope; username-based login needs separate secure support.
- Implement schema/access rules, signup/login/logout, recovery/verification and session restoration in bounded steps. Keep guest mode working and privileged keys off the frontend.
- **Done when:** real provider-backed flows work and two users cannot read or modify each other's private data. A login form alone is insufficient.

### 25 — Cloud Saved Songs and local migration

Dependency: batch 24. Initial scope is saved song records/order and metadata snapshots; notes and named playlists remain local, and media files are not uploaded.

- Add per-user persistence and a previewable, repeat-safe local-to-account merge. Deduplicate by stable identity, preserve custom songs/order and keep a local backup. Never silently replace or mix libraries on login.
- Define offline retries and deterministic conflicts for save/remove/reorder. Use idempotent writes and deletion records so stale clients cannot restore removed songs.
- Partition caches by user, stop old-session writes on logout, and show pending/failed sync.
- **Done when:** Saved Songs survives a new device/session, offline changes recover, migration is repeat-safe and account switching keeps libraries isolated.

### 26 — Cross-device and account-isolation checks

Dependency: batch 25.

- Verify two devices and two accounts: account recovery, session expiry, save/remove/order sync, concurrent edits, offline retries, migration and sign-out/switching.
- Test unauthorized database reads/writes directly. Check backup/failure recovery and document reproducible provider/deployment setup without secrets.
- **Done when:** libraries remain private and durable through those scenarios, errors are understandable and unsupported sync scopes are explicit.

Not scheduled: Play next, extra repeat modes, queue restoration across restarts, shared/public playlists, cloud notes and full playlist sync. These need a separate user request; they are not hidden requirements of the batches above.

## Code map

| Area | Main files |
| --- | --- |
| View state, table and filters | `src/App.tsx`, `src/components/SongTable.tsx`, `src/components/FilterBar.tsx` |
| Song sharing | `src/services/songSharing.ts`, `src/context/SongShareContext.tsx`, `src/components/SharedSongLink.tsx` |
| Public URL state | `src/services/catalogUrlState.ts`, `src/services/useCatalogSearchState.ts` |
| Search, ordering and pagination | `src/services/catalogSearch.ts`, `catalogResults.ts`, `catalogEngine.ts`, `searchText.ts`, `anisongdbArtists.ts` |
| Titles and seasons | `src/services/animeTitles.ts`, `animeSeason.ts`, `src/context/TitleLanguageContext.tsx` |
| Playback and queue | `src/context/PlayerContext.tsx`, `src/services/playerQueue.ts`, `playerVolume.ts`, `src/components/player/` |
| Library and playlists | `src/components/collection/`, `src/context/PlaylistsContext.tsx`, `src/services/playlistsStorage.ts` |
| Saved songs, notes and backups | `src/services/api.ts`, `notesStorage.ts`, `dataBackup.ts`, `src/components/DataModal.tsx` |
| Optional server and build | `server.ts`, `vite.config.ts`, `package.json` |
| Completed title-enrichment tooling | `scripts/enrich-titles.ts`, `scripts/validate-title-enrichment.ts`; report: `data/catalog-title-enrichment-report.json`; ignored cache: `.cache/title-enrichment/` |

## Verification and latest handoff

Last implementation validation recorded after the **batch 21 URL/privacy revision and catalog-loading optimization (2026-09-08)**: TypeScript lint, **89/89 service tests**, production build and whitespace checks passed. Vite still reports its >500 kB chunk advisory.

The revised catalog URL harness passed in StrictMode: shared-link restoration, clean routine URLs, debounced internal history, Back/Forward, clean-URL reload, pending-query cancellation, explicit link generation, private-tab isolation, canonical artists, reset and preservation of unrelated URL/history state. The full-app batch 22 sharing harness still passed, including playback links and all native share/copy fallbacks.

Production preview under `/anime_db/` restored a Heike/Ending shared search, then kept the address clean after changing to Openings; Share search generated `/anime_db/?q=Heike&theme=OP` without changing the page. The favicon resolved to the existing `marcille.png` under the configured base path. A local cold-process benchmark improved default catalog result compilation from about **338 ms to 121 ms**; the first normalized text search may still take about 250 ms, while repeat normalized searches measured about 10 ms. Network time remains device/connection dependent.

Batches 21–22 remain complete with the revised on-demand sharing behavior. Stop before batch 23 unless requested. Existing queue and saved-list drag code/tests predate this work; inspect them before implementing batch 23's remaining scope.

Useful regressions:

- `Heike` and both bilingual titles return only `song-34830` and `song-34831`; legitimate IKE/SPYAIR alias expansion still works.
- Accented/unaccented `fhána` queries return identical IDs; Japanese voicing remains distinct.
- Full catalog season partition: Winter 8,630; Spring 11,362; Summer 8,037; Fall 10,792; Unknown 0. Older/manual saved snapshots may still be Unknown.
- Pagination reaches all matches, including result sets over 500; catalog playback remains a single song when changing pages.

For implementation work, run `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run build` and `git diff --check`, plus focused interaction checks for changed behavior. Tests are discovered under `src/services/*.test.ts`. Some environments require wider sandbox access for Vite/esbuild or test subprocesses.

Check current server/process state before using the usual `http://127.0.0.1:3000/`. A running backend needs a normal restart to load server changes. Use an isolated origin for fixture imports; preserve the user's normal browser data.

This handoff records batch 22 implementation and validation while preserving the prior cancellation of batches 18–20.
