/** Media Session is optional; unsupported actions must never break the player. */
function optional(operation: () => void): void {
  try { operation(); } catch { /* Browser/platform does not support this capability. */ }
}

export function updateMediaMetadata(session: MediaSession | undefined, metadata: MediaMetadataInit | null): void {
  if (!session) return;
  optional(() => { session.metadata = metadata && typeof MediaMetadata !== 'undefined' ? new MediaMetadata(metadata) : null; });
}

export function connectMediaSession(session: MediaSession | undefined, media: HTMLMediaElement,
  controls: { play: () => void; previous: () => void; next: (() => void) | null }): () => void {
  if (!session) return () => {};
  const sync = () => {
    optional(() => { session.playbackState = media.paused || media.ended || Boolean(media.error) ? 'paused' : 'playing'; });
    optional(() => {
      if (!Number.isFinite(media.duration) || media.duration <= 0 || !Number.isFinite(media.currentTime) ||
          !Number.isFinite(media.playbackRate) || media.playbackRate <= 0) {
        session.setPositionState();
      } else {
        session.setPositionState({ duration: media.duration, playbackRate: media.playbackRate,
          position: Math.max(0, Math.min(media.currentTime, media.duration)) });
      }
    });
  };
  const seek = (position: number) => {
    if (!Number.isFinite(position) || !Number.isFinite(media.duration) || media.duration <= 0) return;
    optional(() => { media.currentTime = Math.max(0, Math.min(position, media.duration)); });
    sync();
  };
  const offset = (value?: number) => value !== undefined && Number.isFinite(value) && value > 0 ? value : 10;
  const actions: Partial<Record<MediaSessionAction, MediaSessionActionHandler | null>> = {
    play: controls.play,
    pause: () => media.pause(),
    previoustrack: controls.previous,
    nexttrack: controls.next,
    seekbackward: details => seek(media.currentTime - offset(details.seekOffset)),
    seekforward: details => seek(media.currentTime + offset(details.seekOffset)),
    seekto: details => { if (details.seekTime !== undefined) seek(details.seekTime); },
  };
  for (const [action, handler] of Object.entries(actions)) {
    optional(() => session.setActionHandler(action as MediaSessionAction, handler));
  }
  const events = ['play', 'pause', 'ended', 'error', 'loadedmetadata', 'durationchange', 'timeupdate', 'seeked', 'ratechange', 'emptied'];
  events.forEach(event => media.addEventListener(event, sync));
  sync();
  return () => {
    events.forEach(event => media.removeEventListener(event, sync));
    for (const action of Object.keys(actions)) optional(() => session.setActionHandler(action as MediaSessionAction, null));
    optional(() => { session.playbackState = 'none'; });
    optional(() => session.setPositionState());
    updateMediaMetadata(session, null);
  };
}
