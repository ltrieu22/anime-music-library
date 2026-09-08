// Run with Vite and open /tests/player-queue.html. This fixture is outside the app build.
import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { PlayerProvider, usePlayer, type PlayerContextType } from '../src/context/PlayerContext';
import { QueuePanel } from '../src/components/player/QueuePanel';
import { TitleLanguageProvider } from '../src/context/TitleLanguageContext';
import '../src/index.css';
import type { SongTrack } from '../src/types/player';

let player: PlayerContextType;
const media = { src: '', time: 0, paused: true, ended: false, sourceWrites: 0, plays: 0, loads: 0 };
Object.defineProperties(HTMLMediaElement.prototype, {
  src: { configurable: true, get: () => media.src, set: function (src: string) {
    if (!this.hasAttribute("data-player-media")) { queueMicrotask(() => this.dispatchEvent(new Event("loadedmetadata"))); return; }
    media.src = src; media.time = 0; media.ended = false; media.sourceWrites++;
  } },
  currentTime: { configurable: true, get: () => media.time, set: (time: number) => { media.time = time; } },
  duration: { configurable: true, get: () => 120 },
  ended: { configurable: true, get: () => media.ended },
  paused: { configurable: true, get: () => media.paused },
});
HTMLMediaElement.prototype.play = function () {
  media.plays++; media.paused = false;
  this.dispatchEvent(new Event('loadedmetadata'));
  this.dispatchEvent(new Event('play'));
  return Promise.resolve();
};
HTMLMediaElement.prototype.pause = function () {
  media.paused = true;
  this.dispatchEvent(new Event('pause'));
};
HTMLMediaElement.prototype.load = function () { if (this.hasAttribute("data-player-media")) { media.loads++; media.src = ''; } };

function Probe() {
  player = usePlayer();
  return <><video data-player-media ref={player.videoRef} /><QueuePanel onClose={() => {}} /></>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><TitleLanguageProvider><PlayerProvider><Probe /></PlayerProvider></TitleLanguageProvider></StrictMode>);

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
    const artwork = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="56" height="80"><rect width="56" height="80" fill="teal"/></svg>');
    const long = { ...a, image: artwork, songName: 'A very long song title '.repeat(12), animeTitle: 'AnExtremelyLongAnimeTitleWithoutSpaces'.repeat(10), animeTitles: undefined, type: 'OP 12', artist: 'Artist '.repeat(30) };
    await act(() => player.playQueue([long, { ...b, image: artwork, songName: 'Second song' }, long, { ...c, image: artwork, songName: 'Last song' }]));
    const rows = () => Array.from(document.querySelectorAll<HTMLElement>('[data-queue-item]'));
    const firstId = player.upcomingQueueItems[0].queueItemId;
    const waitForLayout = () => new Promise<void>(resolve => setTimeout(resolve, 80));
    async function dragTile(from: number, to: number, beforeRelease?: () => void) {
      await waitForLayout();
      const tile = rows()[from];
      const start = tile.getBoundingClientRect();
      const target = rows()[to].getBoundingClientRect();
      const x = start.left + start.width / 2;
      const y = start.top + start.height / 2;
      const endY = target.top + target.height / 2;
      const pointer = (type: string, clientY: number) => new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse',
        isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY,
      });
      tile.dispatchEvent(pointer('pointerdown', y));
      for (let step = 1; step <= 24; step++) {
        window.dispatchEvent(pointer('pointermove', y + (endY - y) * step / 24));
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      try { beforeRelease?.(); }
      finally { window.dispatchEvent(pointer('pointerup', endY)); }
      await new Promise(resolve => setTimeout(resolve, 450));
    }
    await dragTile(0, 2, () => {
      check(player.upcomingQueueItems[2].queueItemId === firstId, 'queue must reorder while pointer is still down');
    });
    check(player.upcomingQueueItems[2].queueItemId === firstId, 'tile drop failed to reorder');
    await act(() => rows()[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true, cancelable: true })));
    check(player.upcomingQueueItems[1].queueItemId === firstId, 'keyboard reorder failed');
    check(!document.querySelector('button[aria-label^="Move upcoming"]'), 'permanent reorder buttons remain');
    const currentBeforeDelete = player.currentQueueItem;
    let bubbled = false;
    const onBubbledClick = () => { bubbled = true; };
    document.addEventListener('click', onBubbledClick);
    await act(() => rows()[1].querySelector<HTMLButtonElement>('button')!.click());
    document.removeEventListener('click', onBubbledClick);
    check(!bubbled && player.currentQueueItem === currentBeforeDelete && player.upcomingQueueItems.length === 2, 'delete propagated or changed current playback');
    const panel = document.getElementById('playback-queue')!;
    check(panel.scrollWidth <= panel.clientWidth, 'long text overflows panel');
    check(rows().every(row => row.scrollWidth <= row.clientWidth), 'long text overflows row');
    const badge = rows()[0].querySelector('span.shrink-0')!;
    check(getComputedStyle(badge).flexShrink === '0', 'theme badge can shrink');
    check(document.querySelector('.queue-row-duration')?.textContent === '2:00', 'current duration not shown');
    passed.push('Queue UI: drag and keyboard reorder, isolated deletion, long titles, badge and duration');
    await act(() => player.playQueue([long, ...Array.from({ length: 5 }, (_, index) => ({
      ...b, image: artwork, songName: `Queue song ${index + 1}`,
    }))]));
    const originalIds = player.upcomingQueueItems.map(item => item.queueItemId);
    const playingBeforeDrag = player.currentQueueItem;
    const writesBeforeDrag = media.sourceWrites;
    await dragTile(4, 1, () => {
      check(player.upcomingQueueItems.map(item => item.queueItemId).join() ===
        [originalIds[0], originalIds[4], originalIds[1], originalIds[2], originalIds[3]].join(),
        'fifth-to-second drag must push the intervening rows down before release');
      const dragged = rows().find(row => row.dataset.queueItem === originalIds[4])!;
      check(getComputedStyle(dragged).transform !== 'none' && getComputedStyle(dragged).opacity === '1',
        'dragged tile must remain visible and follow the pointer');
    });
    check(player.currentQueueItem === playingBeforeDrag && media.sourceWrites === writesBeforeDrag,
      'live dragging must preserve current media');
    passed.push('Fifth-to-second pointer drag shifts rows live and preserves playback');
    result.textContent = `PASS: ${passed.length} integration checks\n${passed.join('\n')}`;
  } catch (error) {
    result.textContent = `FAIL: ${String(error)}\nPassed before failure:\n${passed.join('\n')}`;
  } finally {
    run.disabled = false;
  }
};
