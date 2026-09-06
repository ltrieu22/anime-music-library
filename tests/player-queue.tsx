// Run with Vite and open /tests/player-queue.html. This fixture is outside the app build.
import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { PlayerProvider, usePlayer, type PlayerContextType } from '../src/context/PlayerContext';
import type { SongTrack } from '../src/types/player';

let player: PlayerContextType;
const media = { src: '', time: 0, paused: true, ended: false, sourceWrites: 0, plays: 0, loads: 0 };
Object.defineProperties(HTMLMediaElement.prototype, {
  src: { configurable: true, get: () => media.src, set: (src: string) => {
    media.src = src; media.time = 0; media.ended = false; media.sourceWrites++;
  } },
  currentTime: { configurable: true, get: () => media.time, set: (time: number) => { media.time = time; } },
  duration: { configurable: true, get: () => 120 },
  ended: { configurable: true, get: () => media.ended },
  paused: { configurable: true, get: () => media.paused },
});
HTMLMediaElement.prototype.play = function () {
  media.plays++; media.paused = false;
  this.dispatchEvent(new Event('play'));
  return Promise.resolve();
};
HTMLMediaElement.prototype.pause = function () {
  media.paused = true;
  this.dispatchEvent(new Event('pause'));
};
HTMLMediaElement.prototype.load = function () { media.loads++; media.src = ''; };

function Probe() {
  player = usePlayer();
  return <video ref={player.videoRef} />;
}
createRoot(document.getElementById('root')!).render(<StrictMode><PlayerProvider><Probe /></PlayerProvider></StrictMode>);

const a: SongTrack = { id: 'collection:1', animeTitle: 'English', animeTitles: { anime_name_romaji: 'Romaji' }, videoUrl: 'a.webm' };
const b: SongTrack = { id: 'catalog:b', animeTitle: 'B', videoUrl: 'b.webm' };
const c: SongTrack = { id: 'catalog:c', animeTitle: 'C', videoUrl: 'c.webm' };
const result = document.getElementById('result')!;
const run = document.getElementById('run') as HTMLButtonElement;
const check = (ok: boolean, message: string) => { if (!ok) throw new Error(message); };
const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));
async function act(fn: () => void) { flushSync(fn); await settle(); }
function ended() {
  media.ended = true; media.paused = true;
  player.videoRef.current!.dispatchEvent(new Event('ended'));
}

run.onclick = async () => {
  run.disabled = true;
  result.textContent = 'Running…';
  const passed: string[] = [];
  try {
    await act(() => player.closePlayer());
    await act(() => player.addToQueue(a));
    check(player.isPlaying && !media.paused && player.queueSource === 'manual', 'append to empty must start playback');
    passed.push('Append to empty starts playback');

    await act(() => {
      media.time = 42;
      player.videoRef.current!.dispatchEvent(new Event('timeupdate'));
      player.addToQueue([b, c, a]);
    });
    const original = player.currentQueueItem;
    const writes = media.sourceWrites;
    const plays = media.plays;
    await act(() => player.moveQueueItem(player.upcomingQueueItems[2].queueItemId, 0));
    await act(() => player.removeQueueItem(player.upcomingQueueItems[1].queueItemId));
    check(player.currentQueueItem === original && media.time === 42 && media.sourceWrites === writes &&
      media.plays === plays && !media.paused, 'playing edits restarted current media');
    passed.push('Append, reorder and remove preserve playing media and time');

    await act(() => player.togglePlay());
    await act(() => {
      player.clearUpcoming();
      player.addToQueue([a, b]);
    });
    check(!player.isPlaying && media.paused && media.time === 42 && media.sourceWrites === writes &&
      media.plays === plays, 'paused edits resumed or restarted media');
    passed.push('Batched edits preserve paused media and all queued additions');

    await act(() => player.nextTrack());
    check(player.currentTrack === a && player.currentQueueItem !== original && media.sourceWrites === writes + 1 &&
      media.time === 0 && player.isPlaying, 'duplicate occurrence did not restart');
    passed.push('Duplicate occurrence restarts the same media URL');
    await act(ended);
    check(player.currentTrack === b && player.isPlaying, 'ended did not advance manual queue');
    const tailWrites = media.sourceWrites;
    await act(ended);
    check(!player.isPlaying && !player.canSkipNext && media.sourceWrites === tailWrites, 'manual tail did not stop');
    passed.push('Ended advances manual queue, then stops at its tail');

    await act(() => player.addToQueue(c));
    check(!player.isPlaying && media.sourceWrites === tailWrites, 'append after completion resumed current song');
    await act(() => player.nextTrack());
    check(player.currentTrack === c && player.isPlaying, 'Next after completed queue failed');
    passed.push('Append after completion waits for Next');

    await act(() => player.playQueue([a, b], 1));
    await act(ended);
    check(player.currentTrack === a && player.queueSource === 'collection', 'collection did not wrap');
    await act(() => player.playTrack(c));
    check(player.queue.length === 1 && player.currentTrack === c && !player.canSkipNext, 'catalog did not replace collection');
    await act(ended);
    check(!player.isPlaying, 'catalog did not stop');
    passed.push('Collection wraps; catalog title replaces it and stops');

    await act(() => player.playQueue([a]));
    const singleWrites = media.sourceWrites;
    await act(ended);
    check(media.sourceWrites === singleWrites + 1 && player.isPlaying, 'one-song collection did not repeat');
    await act(() => player.clearUpcoming());
    const clearedWrites = media.sourceWrites;
    await act(ended);
    check(!player.isPlaying && media.sourceWrites === clearedWrites, 'clear upcoming did not disable wrap');
    passed.push('One-song collection repeats until upcoming is cleared');

    await act(() => player.playQueue([a, b]));
    await act(() => player.removeQueueItem(player.currentQueueItem!.queueItemId));
    check(player.currentTrack === b && player.isPlaying, 'removing current did not play successor');
    await act(() => player.toggleVideo(true));
    await act(() => player.removeQueueItem(player.currentQueueItem!.queueItemId));
    check(!player.currentTrack && player.queue.length === 0 && media.paused && !media.src && !player.isVideoVisible,
      'removing final current did not unload/close');
    passed.push('Current removal plays successor; last removal unloads and closes');

    await act(() => player.playQueue([a, b]));
    await act(() => {
      player.closePlayer();
      player.playTrack(c);
      player.addToQueue(b);
    });
    check(player.currentTrack === c && player.queue.length === 2 && player.upcomingQueueItems[0].track === b,
      'rapid replacements used stale queue state');
    await act(() => player.closePlayer());
    check(!player.currentTrack && player.queue.length === 0 && media.paused && !media.src, 'close did not clear media');
    passed.push('Rapid replace/add actions stay atomic; close unloads queue');
    result.textContent = `PASS: ${passed.length} integration checks\n${passed.join('\n')}`;
  } catch (error) {
    result.textContent = `FAIL: ${String(error)}\nPassed before failure:\n${passed.join('\n')}`;
  } finally {
    run.disabled = false;
  }
};
