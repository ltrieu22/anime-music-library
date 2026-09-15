# Recent songs and playback restoration

## Listening history

**My Collection → Recent songs** shows the latest 100 distinct songs, newest first, with replay buttons and local listening times. A song enters history when the media element reports actual playback (`playing`), including manual navigation and natural queue transitions. Loading a restored track, blocked playback, buffering and ordinary pause/resume do not create extra entries. Listening again moves an existing song to the top. Catalog originals and saved copies with the same public identity share one entry; custom song identities remain separate.

**Clear history** opens a confirmation with Cancel focused. Escape cancels and restores focus. Clearing changes only listening history, after a successful storage write; a failed clear keeps the list and confirmation available for retry. History updates and clearing synchronize with other open tabs. Clearing during playback leaves the current song out of history until a new playback occurrence begins.

History is local to this browser and is separate from Saved Songs, playlists, notes and backup v2. It keeps song snapshots so replay can work without catalog results. A missing or temporary media URL leaves the history row visible with playback disabled. A URL that later fails reports the existing player error with Play to retry and Next when available.

## Reopening the player

Reloading or reopening the site restores the retained queue (including previously played and duplicate occurrences), current index, explicit repeat mode and playback position. It loads media metadata and seeks after duration is available, **without calling Play**. The player opens paused with video hidden. The saved gain still comes from the existing volume preference; mute is transient. Position is clamped to the loaded media duration. Press Play to resume; Next and Previous retain their existing behavior.

Queue edits save immediately. Position saves at most every five seconds during ordinary playback and flushes on seeking, pause, page hiding and page exit. Abrupt process termination can lose the most recent unsaved seconds. **Close Player** removes the saved queue; reopening the page after closing leaves the player empty. Removing the final current occurrence does the same. Closing preserves the repeat selection only for the current page session; without a saved queue a new page starts with repeat Off.

Open tabs keep their own active playback. They share one saved session: the latest tab to save wins, and loading stored data never replaces another tab's active queue. History storage events synchronize only history.

## Storage and recovery

- `anime-db:player-session-v1`: version 1, occurrence IDs and track snapshots, index, queue source, repeat mode, and position in seconds. No playing/autoplay state is persisted.
- `anime-db:recent-songs-v1`: version 1, up to 100 sanitized track snapshots with `playedAt` timestamps.
- Reads validate types and retain known title, public-song and custom-song identity fields. Private note text is not included. No migration from an earlier queue format is necessary because the previous player did not persist queues.
- Missing, corrupt or unsupported schemas fall back safely, show feedback, and remain untouched until a user starts new playback or explicitly clears history. Invalid individual history rows are ignored. Queue entries without persistent media are skipped; if current was skipped, select the next available occurrence, or the previous one if there is no successor, at position zero. An entirely unavailable queue stays empty.
- Duplicate/invalid occurrence IDs are repaired without merging songs. IDs created by later append and Play next remain distinct.
- Storage failures leave playback usable and display **Retry saving playback**. Failed history clearing remains in its confirmation for retry. Very large queues remain subject to browser storage limits; saving never silently truncates the live queue.

## Repeat placement and layouts

Repeat sits immediately to the right of Next in the same playback control group. The icon and Off / One / All label remain visible and keyboard accessible. Small screens stack song information, transport/progress and utility controls; the player spacer and queue clearance follow its height. Wide screens keep the transport group centered. Queue drag/reorder, Play next and the explicit mode buttons retain their behavior.

## Verification

Run `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run build`, `node tests/browser-fixtures.mjs`, `node tests/play-next-repeat.mjs`, and `node tests/playback-restoration.mjs`. The production restoration runner uses real local WAV audio, an isolated browser context, and blocks external requests. It verifies paused reload/reopening, exact position, duration clamping, occurrence IDs/repeat, recent replay/deduplication, clear cancellation/failure/retry, history and session write retry, cross-tab clearing, close persistence, missing media, corrupt/future schemas, and control placement/overlap at 2560, 1280, 1024, 768, 640, 390 and 320 px. Screenshots are written to the OS temporary directory.
