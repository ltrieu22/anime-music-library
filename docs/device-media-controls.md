# Device media controls

The player supplies Media Session song title, artist, anime title (using the selected title language), and existing cover artwork. It reuses the player's cover lookup; no additional provider queries are introduced.

Supported device actions:

- Play resumes/retries through the same playback path as the UI; repeated Play does not pause. Pause is also idempotent.
- Previous uses the existing three-second restart rule and queue/repeat behavior.
- Next advances the existing queue, including Repeat all wrapping. It is unavailable at the tail unless Repeat all allows advancement. Manual Next still bypasses Repeat one.
- Seek to a position or skip forward/backward (10 seconds by default, or the device-supplied offset). Positions clamp to the media duration; invalid or unknown-duration seeks are ignored.

Native media events synchronize playback state, position, duration, and playback speed. Unknown duration clears device position state. Closing the player or unmounting removes handlers, metadata, and position state. Restored sessions remain paused and never request playback automatically.

Each optional browser capability is guarded independently. Unsupported actions or position reporting cannot prevent ordinary playback or other supported actions. OS presentation and available controls depend on the browser/device; this does not guarantee background playback on platforms that suspend the page.

Implementation: `src/services/mediaSession.ts`, `MusicPlayer.tsx`, and the shared resume action in `PlayerContext.tsx`. API references: [Media Session actions](https://developer.mozilla.org/en-US/docs/Web/API/MediaSession/setActionHandler), [position state](https://developer.mozilla.org/en-US/docs/Web/API/MediaSession/setPositionState).

Verification: `node tests/media-session.mjs` runs the production app with real local WAV playback, isolated browser storage, blocked external requests, and an instrumented Media Session implementation. It checks metadata, paused restoration/reload, idempotent actions, seek offsets/clamps/invalid positions, previous/next/repeat boundaries, close cleanup, and partial/absent API support. The existing restoration, Play next/repeat, and five browser fixtures also pass. Physical lock-screen/headset integration remains a manual device check.
