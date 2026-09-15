# Play next and repeat

Song action menus (catalog, Saved Songs, playlists and notes) and the current-song menu offer **Play next**. It inserts a new occurrence immediately after the current occurrence. **Add to queue** still appends. Both start playback when the player is empty; neither resumes paused or completed playback. Unavailable media disables song-menu playback actions.

Repeated Play next actions put the latest selection first. A multi-song insertion preserves the supplied order. Duplicate songs have separate occurrence IDs; existing history, upcoming occurrences and current playback identity stay intact. Drag and keyboard reorder continue to operate on occurrence IDs.

Repeat starts **Off** unless a saved queue restores its explicit mode. The player button beside Next cycles Off → One → All → Off, and the queue panel provides a direct button for each mode. The selected mode survives queue replacement and closing/reopening the player during the page session. It is saved with an active queue, outside backups. See [recent songs and paused restoration](playback-restoration.md).

| Mode | When a song ends | Manual Next | Previous near the start |
| --- | --- | --- | --- |
| Off | Advance, then stop at the queue's end | Advance; disabled at the end | Go back; restart at the first song |
| Repeat one | Replay the same occurrence | Advance; disabled at the end | Go back; restart at the first song |
| Repeat all | Advance and wrap to the first retained occurrence | Advance and wrap, including a one-song queue | Go back and wrap from the first to the last |

Previous after more than three seconds restarts the current song in every mode. Repeat changes do not seek, reload or resume media. Play next leaves Repeat one active; the user can select Next or another repeat mode to advance.

Append, insertion, reordering, removal and Clear upcoming retain the repeat setting. Repeat all includes retained history, so clearing upcoming songs can return to previously played songs; cleared or removed occurrences never return. Removing the current song plays its successor, or closes the player when no successor remains, regardless of repeat mode. Closing clears the entire queue and its saved session. Reopening the site otherwise restores the queue and position paused, without autoplay.

Natural endings and manual Next use separate reducer actions. Replaying increments the playback revision without replacing the occurrence ID; edits keep both the current occurrence and revision stable. Provider artwork caching and request pacing are unchanged.

Validation: `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run build`, `node tests/browser-fixtures.mjs`, and `node tests/play-next-repeat.mjs` after building. Browser runners use isolated storage and block live provider requests. The production test serves local WAV audio with byte-range responses to verify actual seeking and ended events.
