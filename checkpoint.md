# Anime Song Database — project checkpoint

Updated: 2026-09-06

## Start here

This document records completed work and the next features discussed with the user. Creating this checkpoint does **not** start implementation of those features. In a future session, work on the batch the user selects, validate it, update this file, and stop before starting another batch.

The user wants work split to accommodate their Codex five-hour usage window. The batches below are deliberately small and independently resumable. Scope estimates are engineering estimates, not guarantees about Codex usage or how much work a usage window allows. Start with one batch per session and reserve room for verification and a handoff. Do not combine all batches into one task.

**Batch 5 is complete. Batch 3 remains explicitly deferred by the user. Next eligible title batch: 6 — JP/EN toggle and bilingual search, not started. Batches 1, 2, 4, and 5 are complete.**

The additional requests reviewed on 2026-09-05 are planned as batches 12–26 below, with dependencies, difficulty, and completion criteria. This update is planning only; none of those features has been implemented. Batch numbers are stable references, not a requirement to finish all earlier numbers first.

## Current state — already implemented

- My Collection defaults to `#` ascending. Entries receive increasing local IDs when saved, so the highest number is the most recently saved remaining entry. Filtering does not renumber entries. Sorting is independent for each view; resetting collection filters restores this default.
- Collection and catalog song titles play through the existing bottom player. Notes with media use it too. Separate row play buttons and the old `VideoModal.tsx` were removed.
- Clicking a collection song supplies the visible collection playlist. Clicking a catalog song replaces it with that one song; Next is disabled and playback stops when the song ends. Play Collection starts collection playback again.
- Closing the player clears its queue. Importing/resetting collection data also closes the player, preventing playback of an obsolete queue.
- Audio-only URLs are supported by song conversion and saved collection imports/exports.
- The 67 entries in the browser at `http://127.0.0.1:3000/` were cleared. A JSON backup was exported first; the existing personal note was kept. Empty collection persistence was verified after reload.
- `data/entries.json` is already `[]`; the client also starts empty when local storage has no entries. **Do not add a migration that clears every user's saved songs, or clear the browser again automatically.**
- Last implementation validation passed: `npm run lint`, all four existing tests, `npm run build`, and browser checks for saved order, shared playback, queue interruption, end-of-song stopping, playlist restart, and empty collection persistence.

The earlier playback changes are committed through `86f4d2c`. The planning review on 2026-09-05 found batches 1 and 2 committed in `e164e0b` (`false artist search fix,  added in-site song removal`); only `checkpoint.md` was untracked. Inspect `git status` before editing and preserve subsequent changes. Remote status was not refreshed during this planning review. Later batches were not implemented at that review; subsequent results are recorded below. The development server's usual address is `http://127.0.0.1:3000/`; check its current state instead of assuming it is still running.

- Source-of-truth cleanup was completed before batch 4: `public/data/anime_catalog.json` is the single canonical full 38,821-song source. The incomplete `data/anime_catalog.json` was removed; Vite generates `dist/data/anime_catalog.json` from `public/`. The server reads the canonical source with a built-copy fallback. The default/reset year range is now 1924–2026, preserving 1,173 pre-1980 records. These cleanup changes were already present and were preserved during batch 4.
- Batch 4 adds optional bilingual metadata and shared title helpers, preserves it in conversion/saved-song/note/backup paths, and provides a resumable enrichment tool. Batch 5 has now enriched all 38,821 canonical rows with English/romaji titles and alternate-title arrays; all original fields and identities are preserved. UI title selection and bilingual searching remain batch 6.

- Batch 1 now uses `src/services/catalogSearch.ts` for both browser and optional server typed searches. Alias keys must match complete artist phrases; related names also use boundaries in the artist field. Other query words remain required, while direct anime/song/artist substring matching remains available.
- Searching `Heike` returns only `song-34830` and `song-34831`. IKE/SPYAIR expansion, complete multiword artist aliases, year/theme filters, canonical artist-ID lookup, and private-note search are preserved.
- Batch 2 replaces individual collection removal's browser confirmation with `RemoveSongModal.tsx`, a site-styled modal dialog. It identifies the song/anime/artist/saved number, initially focuses Cancel, supports Escape/close/backdrop cancellation, cycles Tab/Shift+Tab, blocks background interaction/shortcuts, and restores focus to the trigger or search after removal. Both desktop and mobile rows have descriptive removal labels; mobile targets are at least 44px.
- Removing a song preserves its note and the remaining saved IDs/order. Storage write failures propagate to an in-dialog error rather than hiding an entry that would return on reload. Existing note-clear, unsaved-note, and data-management confirmations are outside batch 2.

## Product direction discussed

### Collection, Saved Songs, and playlists

Recommended direction from the discussion:

- Keep My Collection as a library page containing a built-in **Saved Songs** playlist and user-created playlists.
- Saved Songs reuses the current collection and its saved-number order.
- Catalog **Save** adds to Saved Songs. A separate **Add to playlist** action selects a named playlist.
- Removing a song from one playlist should not remove it from other playlists or delete its note.
- Reuse the song table and playback system across Saved Songs and named playlists.
- Start with browser-local storage and JSON backup/restore. The expanded plan adds public song links in batch 22 and accounts/cloud saved-song sync in batches 24–26. Public/shared playlists remain a separate future feature.

This structure was recommended and discussed; it has not been implemented. The exact visual arrangement is still open.

### Playback and queue

Preserve the existing title-click behavior when adding queue features:

- **Click title:** play immediately and replace the active playback context. A collection/playlist title click uses that list; a catalog title click starts a single song.
- **Add to queue:** append to the upcoming queue without interrupting the current song.
- **Play next:** insert immediately after the current song; this is a proposed enhancement that can follow basic Add to queue.
- **Show queue:** show the current song and upcoming songs, with remove/reorder controls.
- Named playlists and Saved Songs use the same player and queue engine.

Keep persistent song identity separate from playback occurrence identity. The same song may belong to several playlists or appear more than once in a queue. Current playback IDs such as `collection:123` and `catalog:song-34830` distinguish contexts; they are not a complete playlist membership model.

Current collection playback wraps to the beginning at its end; single-song catalog playback stops. Preserve that distinction unless intentionally changing repeat behavior. A finite manually assembled queue should have a defined stopping rule.

### Removal and mini-player

- Replace the browser's `window.confirm` removal prompt with UI inside the site.
- A styled confirmation dialog is the smallest complete version. Immediate removal with Undo was recommended as an alternative; restoring the original saved position is required if Undo is chosen.
- The mini-player request was interpreted as replacing the floating video's native browser controls with controls matching the existing custom bottom player. Verify the intended surface when starting that batch if the user's wording remains ambiguous. Retain the single underlying media element.

## Confirmed findings to reuse

### Why “Heike” returned 27 results before batch 1 (fixed)

The previous `src/services/catalogEngine.ts` expanded artist aliases whenever the query contained an alias key as a substring:

```ts
q.includes(key.toLowerCase()) || key.toLowerCase().includes(q)
```

`public/data/artist_aliases.json` maps `ike` to `spyair`. Therefore `heike` activates the SPYAIR rule. A read-only reproduction against the bundled catalog returned **2 direct Heike matches plus 25 SPYAIR entries = 27 results**.

The correct direct matches are:

| Song ID | Anime | Song |
| --- | --- | --- |
| `song-34830` | The Heike Story | Hikaru Toki |
| `song-34831` | The Heike Story | unified perspective |

Batch 1 replaced this logic with shared phrase-boundary matching, including the optional server path in `server.ts`. No Heike-specific rule or row suppression was added.

### Japanese romaji titles are available upstream, not retained locally

AniSongDB's API provides `animeENName`, `animeJPName`, and `animeAltName`. A live read of song IDs 34830 and 34831 confirmed:

- English: `The Heike Story`
- Japanese romaji: `Heike Monogatari`

At the initial review, our bundled catalog stored one `anime_name` per entry. `mapAnisongDbSong` in `src/services/anisongdbArtists.ts` chose English first and Japanese as a fallback, discarding the alternative. This was **not** a hidden toggle that could simply be enabled. Batches 4–5 now preserve and populate the optional title metadata; the toggle itself remains batch 6.

Enrich the existing catalog by stable song ID and retain both title variants and useful alternate names. Search all variants regardless of display preference; the toggle changes presentation only. Keep existing IDs, saved status, notes, media URLs, and ordering intact. No translation service is needed.

References verified during the discussion:

- [AniSongDB API documentation](https://anisongdb.com/docs)
- [API schema](https://anisongdb.com/openapi.json)
- [AniSongDB source and search documentation](https://github.com/kempanator/AnisongDB)

`POST /api/ann_song_ids_request` accepts `{"ann_song_ids":[34830,34831]}`. The inspected schema allowed up to 500 IDs per request. Recheck limits before a bulk run; use bounded requests, retry/backoff, and resumable progress. Do not fetch metadata for the entire catalog on every page load.

## Batches for future sessions

The original sequence remains 3–11. Independent UI/search batches can be moved earlier; a useful sequence for the new requests is 12 → 13 → 14 → 15 → 16 → 17 → 18–20 → 21 → 22, with 23 after playlist ordering and 24–26 as a separate cloud project. Each row is a separate stopping point, not a promise to finish multiple rows in one usage window. Rough scope targets include focused verification; data-fetch duration and provider setup depend on external availability. Medium/High batches may need another session if their completion checks do not fit.

Difficulty: **Low** = localized UI/persistence change; **Medium** = coordinated state, schema, or interaction changes; **High** = external data, security, migration, or conflict handling. Dependencies below are implementation prerequisites, not new package requirements.

| Batch | Deliverable | Dependencies | Difficulty | Rough focused-work target |
| --- | --- | --- | --- | --- |
| 1 | Fix false artist-alias search matches | None | Medium | 30–90 minutes |
| 2 | In-site song removal | None | Medium | 1–2 hours |
| 3 | Consistent floating-player controls | Existing player | Medium | 2–3 hours |
| 4 | Bilingual title fields and resumable enrichment tool | None | Medium | 2–3 hours |
| 5 | Enrich and validate the catalog | 4 | Medium | One bounded data run; resume if needed |
| 6 | JP/EN toggle and bilingual search | 1, 4, 5 | Medium | 2–3 hours |
| 7 | Editable queue engine | Existing player | Medium | 2–3 hours |
| 8 | Add-to-queue actions and queue panel | 7 | Medium | 2–3 hours |
| 9 | My Collection library with Saved Songs and playlist creation | Existing collection | Medium | 2–3 hours |
| 10 | Playlist membership, ordering, and playback | 7–9 | Medium | 2–3 hours |
| 11 | Playlist backup/restore and persistence checks | 9–10 | Medium | 1–2 hours |
| 12 | Pointer cursor on clickable artists | Existing artist actions | Low | 15–30 minutes |
| 13 | Bottom player slides upward into view | Existing player | Low | 30–60 minutes |
| 14 | Persistent master volume, default 40% | Existing player; coordinate with 3 | Low–Medium | 1–2 hours |
| 15 | Accent-insensitive typed search | 1 complete; reuse in 6 | Medium | 1–2 hours |
| 16 | Reach every search result with pagination | Existing search; independent of 15 | Medium | 2–3 hours |
| 17 | Season/year display and basic season filter | Existing vintage data | Low–Medium | 1–2 hours |
| 18 | Filter metadata schema and sample enrichment | Stable anime IDs; reuse 4 tooling if available | High | 2–3 hours |
| 19 | Enrich and validate filter metadata | 18 | High | One bounded data run; resume if needed |
| 20 | Multi-attribute filter pills | 16–19 | Medium | 2–3 hours |
| 21 | URL search/filter/sort synchronization | 16, 17, 20 for full requested tags | Medium | 2–3 hours |
| 22 | Share song links and resolve `?play=...` | 21 URL contract; existing stable song IDs/player | Medium | 2–3 hours |
| 23 | Drag to reorder songs | 7–11 for queue/playlists and backups | Medium–High | 2–3 hours per surface: queue, then saved lists |
| 24 | Managed authentication and usernames | Provider/project configuration and account model | High | 2–3 hours for schema/access rules; 2–3 hours for login UI |
| 25 | Cloud saved songs and local-data migration | 24; stable song identity; 11 if syncing playlists | High | 2–3 hours for persistence; 2–3 hours for migration/conflicts |
| 26 | Cross-device sync and account-isolation validation | 25 | High | 2–3 hours; resume fixes separately if needed |

### Batch 1 — search correctness

- Restrict alias expansion to intentional artist matches, retaining reasonable partial anime/song searches.
- Add focused regression coverage for Heike, a legitimate IKE/SPYAIR search, multiword terms, and filters. If adding a test file, ensure `npm test` actually includes it.
- **Done when:** searching Heike against the current bundled data returns the two correct songs without the 25 SPYAIR extras; existing canonical artist-ID search still works.
- Stop here. Broader search redesign and bilingual search belong to later batches.

### Batch 2 — removal inside the site

- Implement a site-styled confirmation dialog for individual collection removal, or an Undo flow if that option is selected.
- Support keyboard focus, cancellation/Escape, and clear song identification. Preserve notes and saved ordering.
- **Done when:** delete/cancel works on desktop and mobile without a browser confirmation popup. Undo, if included, restores the same entry and position.
- Bulk deletion and playlist deletion can reuse this interaction later; do not add them now.

### Batch 3 — floating-player controls

- Replace the native `<video controls>` UI with custom play/pause, seek, volume/mute, fullscreen, and hide-video controls matching the current player.
- Reuse shared player state and one media element. Keep dragging/resizing and uninterrupted audio when hiding video.
- **Done when:** controls remain synchronized with the bottom bar and usable on mobile, with keyboard labels/focus and working fullscreen.
- Queue controls belong to batch 8.

### Batch 4 — bilingual data preparation

- Add backward-compatible English/romaji/alternate-title fields and a shared display/search-title resolver with sensible missing-title fallbacks.
- Update upstream mapping and relevant saved-song/note import/export handling to preserve metadata without rewriting identities.
- Build a resumable enrichment command that caches completed responses, records unmatched IDs, and supports a small batch limit. Test it first with the two known Heike IDs.
- **Done when:** a small sample retains both titles and can resume without refetching completed IDs; old records still render correctly.
- Stop before the full data run and UI toggle.
- **Complete on 2026-09-06:** schema/helpers, persistence compatibility, tool, live Heike sample, cache-only rerun, and offline regressions passed. See the batch-4 validation/handoff below.

### Batch 5 — catalog enrichment

- Run the batch-4 tool against existing catalog IDs. Preserve the catalog's rows and existing data; report missing responses rather than deleting entries.
- Use only the canonical `public/data/anime_catalog.json`. The earlier source-of-truth cleanup removed the incomplete `data/anime_catalog.json`; `dist/data/anime_catalog.json` is generated output. Stage enrichment separately, then validate before promoting any artifact to the canonical source.
- Validate coverage, unchanged IDs/row counts/media fields, the Heike example, and a few titles with different EN/romaji names. Report payload-size impact.
- **Done when:** enrichment coverage and unresolved IDs are documented and the catalog is usable. If interrupted, record the cache/progress path and exact resume command here.
- **Complete on 2026-09-06:** all 38,821 rows enriched and validated; zero unresolved mappings. Staged output was promoted only after all original fields/order/identities passed comparison. See batch-5 validation below.

### Batch 6 — title toggle and bilingual search

- Add a remembered EN/JP display preference. JP means romaji, not an automatic translation into Japanese script.
- Apply it consistently to catalog, Saved Songs/collection, notes, hover information, and player titles as appropriate.
- Search English, romaji, and alternate titles under either preference. Keep IDs, saved indicators, notes, and playlist/queue membership independent of displayed names.
- **Done when:** both Heike Monogatari and The Heike Story find the same two songs, changing language only changes displayed titles, and playback continues through a toggle.

### Batch 7 — queue engine

- Extend `PlayerContext` beyond collection/single playback to support adding, removing, clearing upcoming tracks, and reordering without restarting the current media.
- Separate the active playback context from a song's membership in a saved list. Use distinct queue-item IDs if repeated songs are supported.
- Define behavior for an empty queue, removing the next/current item, repeated songs, queue completion, and switching from a playlist to a catalog song. Add focused behavioral tests.
- **Done when:** those transitions are tested and the existing player/collection experience still works. The new APIs can be handed off before the new panel exists.

### Batch 8 — queue UI

- Add Add to queue in song actions and a Show queue control in the player. Provide a responsive panel with Now Playing and upcoming items.
- Support removal, clear-upcoming, and accessible move-up/down ordering first. Play next and drag-and-drop are optional follow-ups if they exceed this batch.
- **Done when:** a user can play one catalog song, queue others without interruption, inspect/edit the upcoming order, and hear that order on advancement. Closing the panel must not stop audio.

### Batch 9 — library and playlist creation

- Turn My Collection into the proposed library containing Saved Songs plus custom playlists. Reuse the existing saved entries and saved-number ordering.
- Add persistent playlist IDs/names and create/rename/delete flows. Saved Songs is the built-in list and cannot be deleted as a custom playlist.
- Establish stable song references and optional metadata snapshots so playlist membership will not depend on one collection entry continuing to exist.
- **Done when:** the library and empty custom playlists survive reload; existing saved songs, notes, and Save actions still work. Reuse batch-2 removal UI if available.
- Song assignment and playback follow in batch 10.

### Batch 10 — playlist songs and playback

- Add the playlist picker to catalog/Saved Songs, playlist detail tables, remove-from-this-playlist, and persistent manual ordering.
- Reuse the queue engine for Play Playlist, shuffle, and clicking a song within a playlist. Creating a playlist should not duplicate the entire catalog.
- **Done when:** one song can belong to two playlists, removing it from one leaves the other intact, ordering survives reload, and playback uses the selected playlist. A catalog title click must still replace that playback context.
- Do not fold account sync or sharing into this batch.

### Batch 11 — backups and final persistence checks

- Extend versioned JSON backup/import to include custom playlists and their ordering while accepting older song/note backups.
- Check refresh/reopen persistence, missing-song handling, bilingual metadata, delete isolation, and playlist-to-catalog playback transitions.
- **Done when:** export/import restores Saved Songs, notes, and multiple playlists with their order and identities intact; legacy imports remain usable.
- Integrate backup updates earlier if convenient, but do not call the playlist feature complete until this work is verified.

## Additional requests — verified starting points (2026-09-05)

- **Truncated results:** `App.tsx` requests 250 rows for text search and 80 without a query. `catalogEngine.ts` and the optional server slice from zero and cap requests at 500, exposing `hasMore` without a continuation UI. Exact artist search also slices to a maximum of 500 in `anisongdbArtists.ts`. Raising 250 alone will not make every result accessible. A read-only reproduction with the current shared matcher found **406 Gundam matches in each bundled catalog**; the user's reported 402 may reflect different filters/data. Use the current computed total in acceptance checks.
- **Accents:** the current matcher returns **0 for `fhana`**, versus **29 for `fhána`** in the browser catalog and 28 in the server catalog. `catalogSearch.ts` and `App.tsx` lowercase text without accent folding. Fix matching while retaining the displayed artist spelling and the batch-1 alias boundaries.
- **Seasons:** all 38,821 browser rows and all 33,596 server rows already have `anime_vintage` in `Winter/Spring/Summer/Fall YYYY` form. There is no need for a bulk upstream fetch just to display/filter season. Collection and note snapshot types currently omit this field, so saving/importing must preserve it or resolve it by stable catalog identity.
- **Other attributes:** neither catalog contains format, genre, demographic, adaptation source, or studio fields. `AnimeDetails` and the hover lookup already expose some AniList metadata, but an on-demand cover lookup is not a complete filter index. Enrich by anime ID into a reusable local metadata index, not a request per song/render. Interpret “source studio” as separate **Source** (manga, original, etc.) and **Studio** filters. The existing song `source` field identifies a catalog provider; use a distinct field such as `adaptation_source`.
- **Player:** there is one `<video>` element serving both audio and video songs. `PlayerContext.tsx` initializes volume to **80%**, applies it before `.play()`, and has no volume storage key. The bottom bar already has volume/mute controls; its container mounts without an entrance animation. Preserve this one-element architecture.
- **Artists:** desktop and mobile catalog artist names already have button actions for exact artist-ID search; their classes lack an explicit pointer cursor. Non-clickable collection/notes artist text should not imply a new action.
- **URLs and cloud:** view/filter state currently lives in React; there is no app URL hydration/history handling. Existing `URLSearchParams` usage constructs server API requests only. Saved songs and notes are browser-local; there is no user/session model or cloud database. Static GitHub Pages can remain the frontend if authentication and private storage use an external backend.

### Batch 12 — artist hover cursor

- Add `cursor-pointer` to existing clickable artist buttons on desktop and mobile layouts; preserve exact artist-ID behavior and keyboard focus styling. Leave plain text non-interactive.
- **Done when:** hover shows the same pointer convention as clickable song/anime names, and clicking or keyboard activation still selects the correct artist. No new dependency.

### Batch 13 — bottom-player entrance animation

- Animate the bottom bar from below the viewport into its fixed position when a track first opens it; use a short upward translation, optionally with opacity. Respect `prefers-reduced-motion`.
- Animate the bar wrapper without remounting the media element or replaying the entrance on every track change. Preserve the measured bar height used for floating-video positioning and mobile clearance.
- CSS is sufficient; `motion` is already installed if lifecycle animation needs it. No additional animation package is required.
- **Done when:** opening/reopening slides upward, changing tracks keeps the bar stable, and reduced-motion, mobile layout, floating-video placement, and audio continuity work.

### Batch 14 — persistent master volume

- Reuse the existing global slider/state, initializing from a versioned local-storage preference with **40%** fallback (within the requested 30–50% range). Validate finite values, clamp to 0–1, preserve a valid zero, and tolerate unavailable/corrupt storage.
- Persist changes and define mute restoration separately from the remembered unmuted volume. Apply volume/mute before playback for every newly mounted media element or changed source. Keep bottom/floating controls synchronized, including native `volumechange` events while native controls remain.
- There is currently only one media element; future `<audio>`/`<video>` surfaces must bind to the same preference. Check target mobile-browser support and report any platform-controlled volume limitation. This is gain control, not automatic loudness normalization between differently mastered songs.
- **Done when:** default is 40%, chosen volume survives reload/close/reopen/track and view changes, zero/mute behave correctly, and there is no initial full-volume burst. Coordinate with batch 3; neither batch requires the other to start.

### Batch 15 — accent-insensitive search

- Add shared search-only normalization that folds Latin accents so `fhana`, `fhána`, and mixed case find the same songs. Preserve Japanese text/voicing distinctions and Unicode alias boundaries; do not indiscriminately strip meaningful marks from every script.
- Use it for query terms, searchable fields, and alias keys/values in browser/server search and collection/private-note matching. Preserve original display text, stored identities, and canonical artist-ID search. Make highlighted matches consistent without assuming normalized character offsets equal original offsets.
- **Done when:** accented/unaccented fhána result IDs agree within each data source, Heike and IKE regressions still pass, decomposed accents work, and collection/notes/bilingual searches remain consistent. No search-library dependency needed.

### Batch 16 — complete result navigation

- Prefer page controls or Load more with bounded rendering over rendering tens of thousands of rows. Add offset/page support through the static engine, optional server/API wrapper, and exact artist path; retain total counts and expose continuation in `App.tsx`/`SongTable.tsx`.
- Filter and sort the complete matching set before slicing, with a stable song-ID tie-breaker. Reset/clamp page when query, filters, mode, or sorting changes; ignore stale requests. Hydrate artist credits only for displayed/new rows.
- Integrate local note-only matches into a defined deduplicated order/count before pagination, preserving private-note search. Changing pages must not interrupt playback; existing catalog clicks still play a single track. Collection/playlist queue behavior must remain explicit if those views later paginate.
- **Done when:** all current Gundam matches are reachable exactly once, searches exceeding 500 results also work, counts and reset behavior are correct, and desktop/mobile navigation works in the static build. No pagination package required; virtualization is optional later.

### Batch 17 — season with year

- Parse `anime_vintage` into normalized season/year, display labels such as **Winter 2026**, and add a season selector beside the existing year controls. Use Winter → Spring → Summer → Fall for chronological season order.
- Preserve optional vintage/season fields across catalog conversion, Saved Songs, notes, and JSON import/export; enrich older saved snapshots by stable song ID where possible. Keep an Unknown fallback rather than guessing season from a year. Define this as the anime's catalog season, not a claim about the song's release date.
- **Done when:** all four seasons display/filter correctly, season intersects the year range and existing search/theme filters, and old backups remain readable. Reuse these definitions in batch 20.

### Batch 18 — metadata for advanced filters

- Create an optional anime-ID metadata index for format, genres, adaptation source, studios, and demographic, with provider/provenance, fetch time, and unknown values. Support multiple studios and define which production credits qualify. Reuse the resumable tooling pattern from batch 4 if it exists; bilingual enrichment itself is not a prerequisite.
- AniList is a candidate for format/genre/source/studios. Its schema exposes tags rather than a dedicated demographic field: define and validate a demographic mapping or choose another documented source; do not equate demographic with genre or infer it from a title. [AniList Media schema](https://docs.anilist.co/reference/object/media).
- Verify upstream limits/terms and sample coverage before bulk use. Cache by unique anime ID, use bounded requests with retry/backoff, and record missing/ambiguous mappings. No live request per filter click; missing metadata must not remove songs from unfiltered results.
- **Done when:** a small sample including a multi-studio anime and unknown metadata can be enriched and resumed, field definitions are documented, and existing IDs/media remain unchanged. Provider/data availability drives the High difficulty.

### Batch 19 — filter metadata enrichment and QA

- Run the batch-18 process in bounded resumable chunks. Account for the different browser/server catalogs and unresolved anime IDs without merging or overwriting them blindly.
- Record coverage **per attribute**, unknowns, data sources, payload-size impact, cache paths, and resume commands. Spot-check demographic mappings, adaptation source, genres, and studio memberships.
- **Done when:** the static build can load a validated filter index and coverage gaps are documented. Do not label an unavailable demographic field complete; record the missing source/mapping explicitly.

### Batch 20 — multi-attribute filter pills

- Add selectable/removable pills for Format, Season & Year, Demographic, Genre, Source, and Studio. Reuse existing theme/exact-artist controls and give each category a clear label, clear action, and keyboard/touch interaction.
- Default to OR within one category and AND across categories; document that behavior. Year pills and the existing range must share one state model. Unknown metadata stays visible without an applicable filter and is selectable as Unknown when useful.
- Filter against the complete metadata-backed result set before pagination, then compute accurate totals. Apply the same semantics to static/server and canonical-artist results; resolve saved-song metadata by stable identity when the controls are offered in saved views.
- **Done when:** combinations narrow results correctly, removal/reset restores them, empty results are clear, and desktop/mobile interaction remains responsive. No component library is required.

### Batch 21 — URL search parameter sync

- Define one typed parser/serializer for public catalog view, `q`, active tags, year range, canonical artist IDs, sorting, and page. Example: `?q=frieren&genre=fantasy`. Use stable enum/ID values and a documented repeated-parameter convention for multi-selection.
- Hydrate once before the first search; update the URL without reload and handle Back/Forward through `popstate`. Debounced typing should replace history; deliberate filter/page changes may push entries. Validate malformed values, remove defaults, and prevent state/URL update loops.
- Preserve the GitHub Pages base path and unrelated parameters, reserving `play` for batch 22. Do not serialize private note text, saved-song contents, or account/session secrets. Keep collection/Notes text searches local unless a later explicit design changes that behavior.
- **Done when:** opening/reloading a copied catalog URL restores query/tags/sort/page, Back/Forward works, invalid parameters safely fall back, and searches still work without a backend. Can start with existing filters earlier, but full completion depends on batch 20. Browser History/URL APIs suffice; no router required.

### Batch 22 — share songs

- Add Share to song actions and the player, constructing a base-path-aware link such as `?play=song-34830`. Share the stable public catalog ID, never `collection:123`, queue occurrence IDs, or private note content. Resolve saved entries via `source_song_id`; clearly explain when a custom-only song has no public link.
- Resolve the target from the full catalog independently of active filters/page. Unknown IDs or unavailable media get a clear message. Define replay/history handling so filter edits do not repeatedly restart the shared track; keep single-song playback semantics.
- Call `navigator.share` directly from user interaction when supported, otherwise copy the link. Cancellation is not a sharing failure; if clipboard access also fails, offer a selectable link. Native sharing has browser/secure-context constraints. [Web Share](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share), [Clipboard API](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText).
- A received URL selects/prepares the song and offers Play when autoplay is blocked; do not promise audible playback on page load. Restore batch-14 volume if available. [Autoplay guidance](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay).
- **Done when:** a copied link opens the intended public song in a fresh browser context, native share/copy/cancel/failure paths work, and no account or saved collection is required.

### Batch 23 — draggable song ordering

- Treat the request as reordering upcoming queue items and manually ordered saved lists/playlists. Catalog search ranking is not user-editable. Queue dragging depends on 7–8; persistent saved-list dragging depends on 9–11. Stop after the queue surface before tackling saved lists if needed.
- Add drag handles with touch and keyboard support while retaining move-up/down alternatives. Keep queue occurrence IDs distinct from song IDs. Reordering upcoming songs must not restart the current media.
- Saved Songs keeps its existing default `#` ascending; offer explicit **Manual order** with separate persisted positions. Never renumber saved IDs. Define filtered-list behavior conservatively: disable dragging while filters or a non-manual sort obscure the complete order, with an explanation.
- Reuse the existing `motion` dependency only if it meets accessibility/touch needs; otherwise evaluate a maintained drag-and-drop package at implementation time. None is selected/required yet.
- **Done when:** pointer/touch/keyboard ordering yields the expected playback order, positions survive reload and backup/restore, cancellation is safe, and moving one playlist's song does not change another playlist.

### Batch 24 — accounts, passwords, and usernames

- Cloud saved songs are feasible, but GitHub Pages alone cannot provide private per-user persistence. Select/configure managed authentication plus a database; Supabase Auth/Postgres is a candidate, not an installed or chosen dependency. Review provider availability, limits, and costs when implementing.
- Use provider-managed salted password **hashes**, not reversible password encryption or a homemade credential store. Supabase documents managed password hashing. [Password storage](https://supabase.com/docs/guides/auth/password-security).
- Store user identity separately from a unique normalized username/display name. A practical first version is email/password sign-in plus username; if usernames must also be login identifiers, add a secure backend/provider-supported lookup as a separate scope item.
- Split into schema/access rules first, then signup/login/logout, recovery/verification, session restoration, and clear error states. Keep guest/local mode working. Every private row must be authorized by user ID, not merely hidden in UI. Keep privileged keys off the frontend. [Row-level access policies](https://supabase.com/docs/guides/database/postgres/row-level-security).
- **Done when:** a configured provider supports the account flows and two test users cannot read or mutate each other's data. Hosting/provider setup is an external prerequisite; do not treat a UI-only login form as completion.

### Batch 25 — cloud Saved Songs and migration

- Start with saved song records and stable identity/metadata snapshots, not uploaded audio/video. Keep private notes and custom playlists local in the first cloud slice unless explicitly included; full playlist sync depends on batch 11 and needs additional schema/order work. Make this scope visible to users.
- Add per-user persistence behind the storage service, with saved order, unique IDs, updates, and deletion records/versioning. Then implement a reviewable one-time local-to-account merge that deduplicates by song identity, preserves custom entries/order, and keeps a local backup. Do not silently replace local data on login or mix it into another user's account.
- Define offline writes/retry and deterministic conflict handling for concurrent save/remove/reorder. Use idempotent writes and retain deletions so stale clients cannot resurrect removed songs. Expose pending/failed sync and partition local caches by user; sign-out must stop writes under the previous session.
- **Done when:** saved songs survive a new device/session, offline changes can recover, migration is repeat-safe, and account switching does not leak/mix libraries. These are several bounded implementation sessions, not an add-on to batch 10.

### Batch 26 — cloud validation and handoff

- Verify two devices and two accounts: signup/recovery, refresh/session expiry, save/remove/order sync, concurrent changes, offline retries, local migration, and logout/account switching. Exercise unauthorized database reads/writes directly, not only UI navigation.
- Check backups and failure recovery, document provider configuration and deployment prerequisites without secrets, and record unsupported sync scopes. Fix one failed behavior at a time and resume if needed.
- **Done when:** private saved libraries remain isolated and durable through those scenarios, pending/error states are understandable, and setup/recovery instructions are reproducible. Public playlists and recommendations remain outside this cloud scope.

## Optional follow-ups, not required for the first version

- Dedicated Anime / Artist / Song search fields and exact/partial matching controls. The Heike fix and bilingual matching are required first; a complete search redesign is separate work.
- More advanced drag behavior under filtered/paginated saved lists after batch 23.
- Repeat-mode choices and restoring a temporary queue after a browser restart.
- Shared/public playlists, recommendations, and cloud notes/full playlist sync beyond the initial Saved Songs scope require separate planning. Accounts, cloud Saved Songs, and public song links are now explicit batches above.

## Code map and checks

| Area | Main files |
| --- | --- |
| View state, defaults, collection handlers | `src/App.tsx` |
| Navigation and filters | `src/components/Header.tsx`, `src/components/FilterBar.tsx` |
| Desktop/mobile song rows | `src/components/SongTable.tsx` |
| Individual collection removal | `src/components/RemoveSongModal.tsx`, `src/services/api.ts` |
| Shared playback and queue | `src/context/PlayerContext.tsx`, `src/types/player.ts`, `src/utils/player.ts` |
| Bottom player and floating video | `src/components/player/MusicPlayer.tsx` |
| Player entrance styling | `src/components/player/MusicPlayer.tsx`, `src/index.css` |
| Global volume state (persistence planned) | `src/context/PlayerContext.tsx` |
| Collection playback buttons | `src/components/collection/CollectionPlayButtons.tsx` |
| Local saved songs | `src/services/api.ts`; storage key `anime_songs_db_v1` |
| Private notes and song identity | `src/services/notesStorage.ts`; storage key `anime_song_notes_v1` |
| JSON backups | `src/components/DataModal.tsx` |
| Backup sanitizers and optional title preservation | `src/services/dataBackup.ts`, `src/services/notesStorage.ts` |
| Bilingual title helpers and exact-ID mapping | `src/services/animeTitles.ts`, `src/services/titleEnrichment.ts` |
| Resumable title enrichment / local cache | `scripts/enrich-titles.ts`, `.cache/title-enrichment/` |
| Enrichment validation/promotion and coverage report | `scripts/validate-title-enrichment.ts`, `data/catalog-title-enrichment-report.json` |
| Catalog search and upstream conversion | `src/services/catalogEngine.ts`, `src/services/catalogSearch.ts`, `src/services/anisongdbArtists.ts` |
| Result limits/pagination starting points | `src/App.tsx`, `src/services/catalogEngine.ts`, `src/services/anisongdbArtists.ts`, `src/services/api.ts`, `server.ts` |
| Season/filter metadata starting points | `src/types.ts`, `src/services/anisongdbArtists.ts`, `src/services/api.ts`, `src/components/FilterBar.tsx` |
| URL sync/share starting points | `src/App.tsx`, `src/components/SongTable.tsx`, `src/utils/player.ts`; URL helper not yet created |
| Cloud sync starting points | `src/services/api.ts`, `src/services/notesStorage.ts`, `src/components/DataModal.tsx`; auth/backend not yet created |
| Shared song types | `src/types.ts` |
| Bundled browser data | `public/data/anime_catalog.json`, `public/data/artist_aliases.json` |
| Optional server routes/data | `server.ts`, `data/` |

The project uses React, TypeScript, Vite, Tailwind, and Node 24. GitHub Pages serves the static build, so core features must also work without the Express backend. Browser data is specific to the origin/profile; localhost, another port, and the deployed site do not share a collection.

For implementation batches, run relevant checks once after the change: `npm run lint`, `npm test`, and `npm run build`, plus targeted browser checks for changed interactions. On Windows, `npm.cmd` avoids PowerShell script execution-policy issues. `npm test` discovers `src/services/*.test.ts` (22 tests across `api.test.ts`, `catalogEngine.test.ts`, and `animeTitles.test.ts` after batch 4). Use `npm run dev` for the local app at port 3000, reusing a healthy running server.

## Handoff instructions

At the end of each batch, update the table below with completed behavior, checks actually run, remaining issues, and the next batch. For interrupted data work, record exact progress/cache paths and the resume command. Do not mark a batch done only because its session ended. Avoid redoing completed checks or unrelated features on resumption.

| Batch | Status | Result / next action |
| --- | --- | --- |
| 1 | Complete | Shared browser/server alias boundary fix; Heike returns exactly the two expected IDs. Validation details below. |
| 2 | Complete | Site-styled individual removal with accessible focus/cancellation, note/order preservation, and storage-write error reporting. Next: batch 3. |
| 3 | Not started | Explicitly deferred by user; confirm intended mini-player surface when resumed |
| 4 | Complete | Optional bilingual schema/helpers, persistence compatibility, resumable tool; two Heike mappings and cache reuse verified. Details below. |
| 5 | Complete | All 38,821 rows enriched; original fields/order/identities preserved; zero unresolved mappings; report and backup retained |
| 6 | Not started | Toggle/search depends on enriched titles |
| 7 | Not started | Queue operations and behavior tests |
| 8 | Not started | Queue actions/panel depends on batch 7 |
| 9 | Not started | Library and playlist creation |
| 10 | Not started | Playlist songs/order/playback |
| 11 | Not started | Backups and persistence validation |
| 12 | Not started | Pointer cursor on existing artist buttons |
| 13 | Not started | Upward bottom-bar entrance with reduced-motion support |
| 14 | Not started | Persist global volume with 40% default; coordinate with 3 |
| 15 | Not started | Accent-insensitive search; preserve alias correctness |
| 16 | Not started | Pagination across complete results, including matches beyond 500 |
| 17 | Not started | Reuse vintage data for season/year display and filtering |
| 18 | Not started | Metadata schema/sample tool; verify demographic source/mapping |
| 19 | Not started | Bounded metadata run and per-field coverage report after 18 |
| 20 | Not started | Attribute pills after pagination and metadata preparation |
| 21 | Not started | URL hydration/history for search, tags, sort, and page |
| 22 | Not started | Public song links, share/copy fallback, and target resolution |
| 23 | Not started | Queue dragging after 7–8; saved-list dragging after 9–11 |
| 24 | Not started | Provider configuration, identity/access rules, then account UI |
| 25 | Not started | Cloud saved records, then migration/offline/conflict behavior |
| 26 | Not started | Cross-device/account-isolation and recovery validation |

Batch 1 validation (2026-09-05):

- `npm.cmd run lint`, `npm.cmd test` (12/12), `npm.cmd run build`, and `git diff --check` passed. Initial Vite build/dev attempts were blocked by sandbox ancestor-directory reads; the authorized retries outside the sandbox succeeded.
- Regression tests read the actual browser catalog (38,821 rows) and separate server catalog (33,596 rows), without modifying either. Coverage includes Heike, partial direct matches, all 25 SPYAIR entries via IKE, multiword terms and artist phrases, Unicode/escaped punctuation boundaries, year/theme filtering, and the existing canonical artist-ID tests.
- Browser checks at `http://127.0.0.1:3000/`: `Heike` shows 2/2 (Hikaru Toki and unified perspective); Openings reduces it to 1/1; `IKE kill noise` shows the two SPYAIR entries; searching the existing private-note marker finds its one song. Collection remained empty and the existing note was retained; no saved data was edited.
- Live server `/api/catalog/songs?q=Heike` returns the two expected IDs. `q=IKE kill noise&themeType=ED&yearMin=2026&yearMax=2026` returns only `song-47528`.
- No outstanding batch-1 issues. Direct substring searches can still return partial-name matches by design; only alias expansion requires complete phrases. Canonical artist-ID requests were verified by the existing mocked regression, not a new live upstream request.

Batch 2 validation (2026-09-05):

- `npm.cmd run lint`, `npm.cmd test` (13/13), `npm.cmd run build`, and `git diff --check` passed. Lint/build were repeated after adding explicit Tab/Shift+Tab wrapping found useful during browser checks.
- Regression coverage verifies deletion preserves saved IDs/order and notes, and rejects a failed storage write while persisted entries remain intact.
- Browser QA used the initially empty `http://localhost:3000/` origin, separate from the user's `127.0.0.1:3000` collection and note. Saved the two Heike songs temporarily; verified initial Cancel focus, Escape and Cancel restoring the trigger, forward/backward focus wrapping, blocked N and / shortcuts, desktop removal without a browser prompt, and search focus after the trigger row disappears.
- Deleting saved #1 left #2 unchanged. A temporary note for #1 remained visible in Notes after reload. At 390×844, checked the dialog visually, mobile Cancel, and removal of the last saved entry; collection returned to empty. Default browser viewport restored.
- QA cleanup limitation: attempting to clear the temporary note through the existing NoteModal opened its native browser confirmation and stalled the browser tool (including dismissal/close attempts). The note `Batch 2 temporary QA note: keep after collection removal.` may remain on `localhost:3000`, and its browser confirmation may need manual dismissal. Both temporary saved songs were removed. No user data on `127.0.0.1:3000` was changed. This existing note-clear flow was not modified.
- Final Git status: `main` matches fetched `origin/main`; 7 modified tracked files and 4 untracked files, including the checkpoint and new components/search tests/helpers. All batch-1 work preserved; nothing committed or pushed.

Planning update validation (2026-09-05):

- Read the current code and both bundled catalogs; no application code, catalog data, browser storage, or accounts changed.
- Reproduced current typed-search counts using `createCatalogQueryMatcher`: Gundam 406 in each catalog; `fhana` 0 in each; `fhána` 29 browser / 28 server. Verified all bundled vintage values match a season/year label. These are read-only diagnostics, not implemented fixes.
- Added all 11 requested features as batches 12–26 with explicit difficulty, prerequisites, rough effort, and acceptance criteria. Dragging, metadata enrichment, and cloud work have separate stopping points.
- Updated current Git context to `e164e0b`; older batch validation entries above remain historical records. No remote fetch or running-server/browser verification was performed for this planning update.
- Reviewed Markdown batch/dependency consistency and whitespace. Application lint/tests/build were not rerun because this update changes documentation only.

Batch 4 validation and handoff (2026-09-06):

- **Files changed in this batch:** `src/types.ts`, `src/services/animeTitles.ts`, `src/services/anisongdbArtists.ts`, `src/App.tsx`, `src/services/notesStorage.ts`, `src/services/dataBackup.ts`, `src/components/DataModal.tsx`, `server.ts`, `src/services/titleEnrichment.ts`, `scripts/enrich-titles.ts`, `src/services/animeTitles.test.ts`, `src/services/fixtures/heike-titles.json`, `package.json`, `.gitignore`, and this checkpoint. Existing source-cleanup edits (including the removed duplicate and catalog-engine regressions) were preserved; no commit or push was made.
- **Schema:** `AnimeTitleMetadata` adds optional `anime_name_english?: string`, `anime_name_romaji?: string`, and `anime_alt_names?: string[]` to catalog, collection, and note snapshot types. Existing `anime_name`, IDs, identity/fingerprint functions, saved order, media, years/vintage, artists, and song names are unchanged by enrichment. The optional fields are not identity inputs. No migrations or browser-storage writes were run against user data.
- **Helpers:** `getAnimeDisplayTitle` prefers nonblank romaji, then English, then existing `anime_name`, then `Unknown Anime`. `getSearchableAnimeTitles` exposes legacy/English/romaji/alternate strings, deduplicating with matching-only NFKC/case/whitespace normalization while keeping the first original spelling. `copyAnimeTitleMetadata` preserves valid optional strings/arrays verbatim. `titlesFromAnisongDb` uses only supplied upstream title fields; no romanization is generated. Helpers are prepared for batch 6, without wiring a display toggle or bilingual search into the current UI.
- **Persistence:** catalog-to-collection Save, upstream conversion, note snapshot creation and storage sanitization, JSON song/note imports, and optional server entry create/update/import preserve the metadata. `dataBackup.ts` contains the existing backup sanitizers extracted from `DataModal.tsx`; legacy array imports and version-1 exports/imports retain their existing behavior. Existing local collection create/update/import and JSON export already preserve object fields, so no storage-version change is needed.
- **Tool:** `scripts/enrich-titles.ts`, invoked with `npm.cmd run enrich:titles -- ...`. CLI input is fixed to the canonical source. Each request contains at most 100 exact ANN song IDs, with one-second spacing, up to three attempts, timeouts, and retry/backoff. Long `Retry-After` responses stop for a later resume. Successful complete responses are atomically cached before progress advances. Network failures leave IDs pending; malformed responses are not cached. Cache candidates are revalidated against current source rows on each run.
- **Matching safety:** only exact `song-N` → numeric `annSongId` mapping is accepted. Candidate lists retain duplicates so more than one candidate is ambiguous. Exact song name, artist, theme, vintage/year and available linked AniList ID checks flag mismatches; AniList is never a one-to-one lookup key or fallback. Missing EN/JP titles or conflicts with existing optional metadata also prevent assignment. No fuzzy matching. Reports retain unmatched/ambiguous/mismatched IDs and reasons; no production row is removed or rewritten.
- **Cache/progress paths:** `.cache/title-enrichment/responses/*.json` contains successful raw request/response envelopes with endpoint, requested IDs, timestamp, and complete candidate lists. `.cache/title-enrichment/progress.json` is updated after each complete response; `.cache/title-enrichment/preview.json` contains the last completed run's metadata mappings, unresolved/pending statuses, counts, and source hash. These local resumable artifacts are ignored by Git and are separate from app data/backups. Preserve this directory to reuse fetched work. `--preview` is the default behavior: it can fetch/cache metadata but writes no catalogue artifact. `--limit N` caps **new request IDs per invocation**, skipping cached work and advancing to the next uncached IDs on rerun. Cached unresolved responses are not automatically refetched; use `--retry-unresolved` explicitly after inspecting them.
- **Live Heike result:** one successful `POST https://anisongdb.com/api/ann_song_ids_request` with `{"ann_song_ids":[34830,34831]}` returned exactly one candidate per song. Both returned `animeENName: "The Heike Story"`, `animeJPName: "Heike Monogatari"`, and `animeAltName: []`. Both mappings are unambiguous, with zero unmatched, ambiguous, mismatched, or unexpected IDs. IDs: `song-34830` → ANN song `34830`, AMQ song `67637`; `song-34831` → ANN song `34831`, AMQ song `67638`. Both use ANN anime `24700`; linked AniList `138714` was a cross-check only. A checked-in projection of these live responses supports ordinary offline tests.
- **Exact sample/resume command actually run:** `npm.cmd run enrich:titles -- --ids song-34830,song-34831 --limit 2 --preview`. First successful run: 1 request, 2 fetched IDs, 0 cache hits, 2 matched. Identical rerun: **0 requests, 0 fetched IDs, 2 cache hits, 2 matched**. The first sandboxed network attempt was denied with EACCES; the authorized retry succeeded. No full-catalogue enrichment command was run.
- **Validation actually run:** `npm.cmd run lint` passed; `npm.cmd test` passed **22/22**; `npm.cmd run build` passed after the usual sandbox ancestor-directory read failure and authorized retry; `git diff --check` passed. An initial persistence test incorrectly supplied catalogue-only fields to a saved-record fixture; the fixture was corrected to match the existing Save shape, and lint/tests were rerun successfully. Offline checks cover old records/backups, fallback order, title variants and immutable values, identity/order preservation, Heike mapping, rejected candidates, bounded resume/cache reuse, failed-request recovery, explicit unresolved retries, and staging against a temporary **two-song-only** fixture. No browser UI changes were made or browser QA claimed.
- **Canonical/build invariants:** source remains 38,821 rows and unique IDs, with OP 8,873 / ED 15,317 / IN 14,631 and 1,173 pre-1980 records (catalog regressions passed). Before/after source SHA-256: `05850c16b7c31a9e9f3d0440f72f2589394137d15c7aaf96824c997fd4eba927`. The rebuilt `dist/data/anime_catalog.json` has the same hash. Production records containing any new bilingual field: **0**. `.cache/title-enrichment/anime_catalog.enriched.json` has **not** been created for the production catalogue.
- **Unresolved issues:** none for batch 4 or the two Heike mappings. Full-catalogue title coverage is intentionally unknown. Conservative exact checks may report upstream corrections as mismatches in batch 5; inspect those records rather than relaxing matching or guessing. UI language choice/bilingual matching remain batch 6. Batch 3 stays deferred; batches 5 and 6 remain not started.

Exact commands for **batch 5 only**, from the repository root (recorded, not executed):

```powershell
# Start/resume up to 500 NEW IDs per invocation; cached successful work is reused.
npm.cmd run enrich:titles -- --full --limit 500 --preview

# Alternatively, fetch all remaining IDs with the same cache and bounded requests.
npm.cmd run enrich:titles -- --full --preview

# After progress has no pending IDs, produce a separate staged full catalogue.
npm.cmd run enrich:titles -- --full --stage
```

`--stage` requires `--full`, rejects simultaneous `--preview`, and refuses staging while pending IDs remain. It writes only `.cache/title-enrichment/anime_catalog.enriched.json`; unmatched/ambiguous/mismatched rows retain their existing data without added metadata. Batch 5 must validate row order, every existing field, identity, coverage, unresolved mappings, and payload size against the source hash before promoting the staged artifact. The tool never writes directly to the canonical catalogue.

Batch 5 validation and handoff (2026-09-06):

- **Scope/files:** enriched only `public/data/anime_catalog.json`; added `scripts/validate-title-enrichment.ts`, its `validate:titles` package command, and `data/catalog-title-enrichment-report.json`; updated this checkpoint. All prior source-cleanup and batch-4 changes were preserved. No UI/search behavior, user collection/notes, unrelated data, commits, or deployments were changed. Batch 3 remains deferred and batch 6 is not started.
- **Run actually completed:** `npm.cmd run enrich:titles -- --full --preview` fetched 38,819 uncached IDs in 389 sequential bounded requests and reused the two Heike cache entries. All 38,821 exact song-ID mappings passed the existing conservative checks. Unmatched: **0**; ambiguous: **0**; mismatched: **0**; pending: **0**; unexpected upstream IDs: **0**. No fuzzy fallback, AniList-based candidate selection, or matching-rule relaxation was needed.
- **Cache-only staging:** `npm.cmd run enrich:titles -- --full --stage` reused **38,821 cache hits with zero requests** and wrote `.cache/title-enrichment/anime_catalog.enriched.json`. Raw responses, progress, and preview remain in the batch-4 cache paths. The successful full-run result supersedes the earlier batch-4 sample-only state; historical batch-4 entries above describe that earlier stopping point.
- **Validation/promotion:** `npm.cmd run validate:titles` compared every existing field on every row against the original canonical catalogue, checked that the only new fields were the three title fields, required staged metadata to match the corresponding approved mapping, verified row order/IDs and note keys/fingerprints, and checked coverage, types, counts and examples. Only after it passed, `npm.cmd run validate:titles -- --promote` atomically replaced the canonical file with compact validated JSON. The original bytes were backed up to `.cache/title-enrichment/anime_catalog.original.json`; the validator refuses to overwrite an unrelated backup. A detailed durable report is in `data/catalog-title-enrichment-report.json`, with the local validation copy at `.cache/title-enrichment/validation.json`.
- **Coverage:** English titles **38,821/38,821**; romaji/Japanese-display titles **38,821/38,821**; alternate-title arrays **38,821/38,821**, of which **2,493** are nonempty. Empty alternate arrays reflect upstream data, not missing requests. All original `anime_name`, song IDs/names, artists, media URLs, years/vintage, other existing values, and row ordering are unchanged.
- **Catalogue invariants:** 38,821 rows and unique IDs; openings **8,873**, endings **15,317**, insert songs **14,631**, pre-1980 records **1,173**. Original SHA-256: `05850c16b7c31a9e9f3d0440f72f2589394137d15c7aaf96824c997fd4eba927`. Enriched source and rebuilt `dist/data/anime_catalog.json` SHA-256: `da1df9014934e291f5213e91eb70dd71bd23ad33dfdd311e43f331c9de23c34a`.
- **Spot checks:** Heike `song-34830` and `song-34831` retain `The Heike Story` and gain `Heike Monogatari`; `song-12912` retains `Attack on Titan` and gains `Shingeki no Kyojin`; `song-23998` retains `Demon Slayer: Kimetsu no Yaiba` and gains `Kimetsu no Yaiba`; `song-1085` retains `Spirited Away` and gains `Sen to Chihiro no Kamikakushi`; `song-2883` remains `Mazinger Z` (1972) in both title fields. The existing search tests still find Heike's two songs and Mazinger Z with explicit year filtering working.
- **Payload impact:** compact source grows from **12,845,066** to **17,403,344 bytes** (+4,558,278; about 35.5%). Gzip at Node's default compression grows from **1,813,413** to **2,012,125 bytes** (+198,712; about 11.0%). These are measured file/compression sizes, not claims about deployment transfer settings. The staged file is formatted for inspection; promotion preserves the canonical compact format.
- **Checks actually run after promotion:** `npm.cmd run lint` passed; `npm.cmd test` passed **22/22**, including legacy backup/persistence, exact mappings, cache resumption and catalogue/search regressions; `npm.cmd run build` passed with authorized filesystem access for Vite; `git diff --check` passed. Source/build hashes match. No browser UI changes or new browser QA are claimed.
- **Remaining issues/resume:** none for batch 5; there is no unfinished enrichment run. Retain the original backup, staged artifact and pre-promotion preview together for audit. `npm.cmd run validate:titles` can repeat the comparison without network access or canonical writes using those artifacts. The earlier batch-5 run commands remain above as historical instructions; do not rerun enrichment merely to start batch 6. Language preference, display integration and bilingual searching are still unimplemented and belong to batch 6.

Earlier batch-5 prompt (completed):

> Read checkpoint.md and implement batch 5 only. Use the canonical public/data/anime_catalog.json and the batch-4 cache/tool. Enrich in resumable bounded runs, inspect unresolved mappings, validate the staged output and unchanged original fields before promotion, document coverage and size, update the checkpoint, and stop before batch 6. Keep batch 3 deferred.

Suggested next title-batch prompt:

> Read checkpoint.md and implement batch 6 only. Use the already enriched canonical catalogue, add a remembered JP/EN display preference and bilingual search, preserve all song/saved/note/playback identities, validate both Heike title variants and uninterrupted playback during toggles, update the checkpoint, and stop before batch 7. Keep batch 3 deferred; do not rerun enrichment.

Earlier suggested batch-3 prompt (retained for when the user resumes that deferred batch):

> Read checkpoint.md and implement batch 3 only. Preserve current changes and existing player behavior. Replace the floating video's native controls with controls matching the bottom player, retain one media element and dragging/resizing, validate playback/fullscreen/mobile behavior, update the checkpoint, and stop before batch 4.
