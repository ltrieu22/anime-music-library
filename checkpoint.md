# Anime Song Database — checkpoint

Updated: 2026-09-08

## Current state

Implemented: bilingual titles/search, artist matching, season/year filters, pagination, local Saved Songs and named playlists, notes, backups, audio/video playback, editable queues, drag reordering, remembered volume, and public song/search links.

Latest changes: Share song copies immediately. A charcoal/emerald toast appears at bottom center above the player, with a subtle fade/slide and reduced-motion support. Success lasts 3.5 seconds; informational errors last 5.5 seconds. The season dropdown omits Unknown; unknown metadata remains supported internally.

This roadmap replaces the long batch history. Planned items are not completed features or permission to implement everything at once. Work on the user-selected item, verify it, then update this file. Inspect Git status and preserve existing edits.

Earlier batches 18–20 remain canceled: do not revive external enrichment runs, the proposed anime-discovery metadata index, or advanced anime-attribute filters. A compact index of existing searchable song fields below is a separate performance proposal.

## Prioritized roadmap

| Priority | Work | Expected result / completion check |
| --- | --- | --- |
| 1 | Catalog loading recovery | Distinct loading error and Retry button. Failed requests must not become a permanently cached empty catalog; retry restores results without reloading. |
| 2 | Initial-load performance | Profile download, parsing and rendering. Evaluate a compact index of existing song fields, deferred metadata and lazy-loaded dialogs. Preserve complete search, exact-ID playback and deployment paths; record before/after measurements. |
| 3 | Search responsiveness | Profile typing/filtering on slower devices. If main-thread work causes stalls, move expensive search/sort into a worker; retain ranking, pagination, private-note merging and stale-result protection. |
| 4 | Redesign Add to playlist | Match the charcoal/emerald theme: clearer song summary, appealing playlist rows with song counts and selected states, better spacing, and a tidy create-playlist section. Preserve obvious membership toggling, visible errors, keyboard focus and mobile usability. |
| 5 | Manage multiple playlists | Add **Manage playlists** in My Collection. Selection mode offers checkboxes, selected count, Select all, Cancel/Done and **Delete selected (N)**. Confirm with selected playlist names before deletion. Protect built-in Saved Songs; preserve songs, notes and other memberships. Verify cancellation, persistence, storage failures and active-playlist playback behavior. |
| 6 | Play next and explicit repeat | Add to queue already appends; Play next is an optional shortcut inserting immediately after the current song. Add explicit Off / Repeat one / Repeat all controls with defined queue behavior. Preserve occurrence IDs and uninterrupted playback. |
| 7 | Recent songs and session restoration | Local listening history and queue/current-position restoration after reopening. Keep history clearable, avoid unexpected autoplay, and handle unavailable tracks and older stored data. |
| 8 | Device media controls | Supported Media Session metadata and play/pause/previous/next/seek actions. Keep device controls synchronized with the player; degrade gracefully where unsupported. |
| 9 | Mobile layout polish | Reduce horizontal scrolling in navigation and decade controls. Check narrow screens, long titles, touch targets and player/queue clearance. |
| 10 | Undo removals | Brief Undo action for removing songs from Saved Songs or playlists. Restore identity, membership and order without affecting other lists or notes; expose storage failures. |

Start with loading recovery and measured performance work unless the user chooses a playlist/UI item first. Inspect existing queueing and drag behavior before extending it; do not reimplement completed features.

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
| Catalog performance | `src/services/catalogEngine.ts`, `catalogResults.ts`, `catalogSearch.ts`, `searchText.ts` |
| Playlists | `src/components/collection/PlaylistSongPicker.tsx`, `CollectionLibrary.tsx`; `src/context/PlaylistsContext.tsx`; `src/services/playlistsStorage.ts` |
| Playback | `src/context/PlayerContext.tsx`, `src/services/playerQueue.ts`, `src/components/player/` |
| Local data / backups | `src/services/api.ts`, `notesStorage.ts`, `dataBackup.ts`; `src/components/DataModal.tsx` |

## Verification and handoff

Latest code validation: TypeScript, all **89 service tests**, production build and whitespace checks passed. Sharing browser checks passed in StrictMode; desktop and 390 px toast layouts were visually checked. Vite still reports the >500 kB chunk advisory. This rewrite changes documentation only.

Performance baseline: catalog is about **17.4 MB (16.6 MiB) uncompressed**. Existing code caches normalized text and the last eight ordered result sets, reusing them for pagination. Profile before adding another cache/index.

For code changes: `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run build`, `git diff --check`, plus relevant browser checks. Fixtures: `/tests/song-sharing.html`, `/tests/catalog-url.html`, `/tests/player-queue.html`, `/tests/collection-order.html`. Preserve the user's normal browser data. For documentation-only edits, review the diff and run the whitespace check.

Useful regressions: Heike matches only `song-34830`/`song-34831`; legitimate IKE/SPYAIR aliases work; accented/unaccented fhána matches agree; pagination reaches results beyond 500; sharing/filtering preserve playback.

Latest local server: `http://127.0.0.1:5173/`; check it is running before use. Production uses `/anime_db/`. Check Git/deployment status rather than assuming local edits are published.
