import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ListMusic, Trash2, X } from 'lucide-react';
import { motion, Reorder } from 'motion/react';
import { usePlayer } from '../../context/PlayerContext';
import { useTitleLanguage } from '../../context/TitleLanguageContext';
import type { QueueItem, RepeatMode, SongTrack } from '../../types/player';
import { QueueCover } from './QueueCover';
import { QueueDuration } from './QueueDuration';
import { QueueTile } from './QueueTile';

const controlClass = 'inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-800 hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-300';

export function QueuePanel({ onClose }: { onClose: () => void }) {
  const { currentQueueItem, upcomingQueueItems, repeatMode, setRepeatMode, isPlaying, duration, removeQueueItem, clearUpcoming, moveQueueItem } = usePlayer();
  const { displayTitle } = useTitleLanguage();
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef<string | null>(null);
  const draggedId = useRef<string | null>(null);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    const returnTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => {
      if (returnTarget?.isConnected) returnTarget.focus();
      else document.getElementById('search-input')?.focus();
    };
  }, []);
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('dialog[open]')) return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);
  useLayoutEffect(() => {
    if (!pendingFocus.current) return;
    const row = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('[data-queue-item]') ?? [])
      .find(element => element.dataset.queueItem === pendingFocus.current);
    (row ?? closeRef.current)?.focus();
    pendingFocus.current = null;
  }, [upcomingQueueItems, currentQueueItem]);

  const reorder = (id: string, index: number, restoreFocus = true) => {
    const from = upcomingQueueItems.findIndex(item => item.queueItemId === id);
    if (from < 0 || from === index || index < 0 || index >= upcomingQueueItems.length) return;
    // Focusing during a drag would scroll the tile back into view and jump the pointer.
    if (restoreFocus) pendingFocus.current = id;
    moveQueueItem(id, index);
    setAnnouncement(`${upcomingQueueItems[from].track.songName || 'Song'} moved to upcoming position ${index + 1}.`);
  };
  const details = (track: SongTrack) => {
    const animeTitle = displayTitle(track.animeTitles ?? { anime_name: track.animeTitle });
    return (
      <div className="min-w-0 flex-1">
        <p title={track.songName || 'Untitled song'} className="truncate text-sm font-semibold text-neutral-100">{track.songName || 'Untitled song'}</p>
        <div className="mt-1 flex min-w-0 items-center gap-1.5">
          <p title={animeTitle} className="min-w-0 truncate text-xs text-neutral-300">{animeTitle}</p>
          {track.type && <span className="shrink-0 whitespace-nowrap rounded border border-emerald-800/60 bg-emerald-950/50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">{track.type}</span>}
        </div>
        {track.artist && <p title={track.artist} className="mt-1 truncate text-xs text-neutral-400">{track.artist}</p>}
      </div>
    );
  };
  const trailing = (item: QueueItem, index?: number) => (
    <div className="relative flex h-11 w-11 shrink-0 items-center justify-center">
      <div className="queue-row-duration">
        <QueueDuration videoUrl={item.track.videoUrl} duration={index === undefined ? duration : undefined} />
      </div>
      <button type="button" draggable={false} className={`${controlClass} queue-row-delete absolute inset-0`} title={index === undefined ? 'Remove current song and advance queue' : 'Remove from queue'}
        aria-label={index === undefined ? `Remove current song ${item.track.songName || 'Untitled song'} from queue` : `Remove upcoming song ${index + 1}, ${item.track.songName || 'Untitled song'}, from queue`}
        onPointerDown={event => event.stopPropagation()}
        onMouseDown={event => event.stopPropagation()}
        onDragStart={event => { event.preventDefault(); event.stopPropagation(); }}
        onClick={event => {
          event.stopPropagation();
          pendingFocus.current = index === undefined ? upcomingQueueItems[1]?.queueItemId ?? 'close'
            : upcomingQueueItems[index + 1]?.queueItemId ?? upcomingQueueItems[index - 1]?.queueItemId ?? 'close';
          removeQueueItem(item.queueItemId);
          setAnnouncement(`${item.track.songName || 'Song'} removed from queue.`);
        }}><Trash2 aria-hidden="true" className="h-4 w-4" /></button>
    </div>
  );
  return (
    <section ref={panelRef} id="playback-queue" aria-labelledby="queue-heading"
      className="fixed bottom-40 right-0 z-[60] flex max-h-[calc(100dvh-11rem)] w-full flex-col overflow-hidden rounded-t-2xl border border-neutral-700 bg-[#1e2022] text-neutral-100 shadow-2xl sm:right-4 lg:bottom-24 lg:max-h-[calc(100dvh-7rem)] sm:w-[30rem] sm:max-w-[calc(100vw-2rem)] sm:rounded-2xl">
      <header className="flex shrink-0 items-center justify-between border-b border-neutral-800 px-4 py-2">
        <h2 id="queue-heading" className="flex items-center gap-2 font-semibold"><ListMusic aria-hidden="true" className="h-5 w-5 text-emerald-400" />Playback queue</h2>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Close queue" title="Close queue (keep playing)" className={controlClass}><X aria-hidden="true" className="h-5 w-5" /></button>
      </header>
      <motion.div layoutScroll className="overflow-y-auto overscroll-contain p-3 sm:p-4">
        <div role="group" aria-label="Repeat mode" className="mb-3 flex gap-1 rounded-lg bg-neutral-950/50 p-1">
          {([['off', 'Off'], ['one', 'Repeat one'], ['all', 'Repeat all']] as [RepeatMode, string][]).map(([mode, label]) => (
            <button key={mode} type="button" aria-pressed={repeatMode === mode}
              onClick={() => { setRepeatMode(mode); setAnnouncement(`Repeat ${mode}.`); }}
              className={`min-h-11 min-w-0 flex-1 cursor-pointer rounded-md px-2 text-xs focus-visible:outline-2 focus-visible:outline-emerald-300 ${repeatMode === mode ? 'bg-emerald-950 text-emerald-300' : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'}`}
            >{label}</button>
          ))}
        </div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-400">Now Playing <span className="normal-case font-normal text-neutral-400">{isPlaying ? '' : '· Paused / stopped'}</span></h3>
        {currentQueueItem && <div className="queue-row flex items-center gap-2.5 rounded-xl border border-emerald-900/60 bg-emerald-950/20 p-2">
          <QueueCover key={currentQueueItem.queueItemId} track={currentQueueItem.track} />
          {details(currentQueueItem.track)}{trailing(currentQueueItem)}
        </div>}
        <div className="mt-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Up next <span className="text-neutral-400">({upcomingQueueItems.length})</span></h3>
          <button type="button" disabled={!upcomingQueueItems.length}
            className="min-h-11 cursor-pointer rounded-lg px-3 text-xs text-neutral-300 hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-emerald-300 disabled:cursor-default disabled:opacity-30"
            onClick={() => {
              pendingFocus.current = 'close';
              clearUpcoming();
              setAnnouncement('Upcoming queue cleared. Repeat setting unchanged.');
            }}>Clear upcoming</button>
        </div>
        <p className="mb-2 text-xs leading-5 text-neutral-400">
          {repeatMode === 'one' ? 'The current song repeats when it ends. Next advances to the next song.'
            : repeatMode === 'all' ? 'At the end, playback returns to the first song in the retained queue, including previously played songs.'
            : 'Playback stops at the end of this queue.'}
        </p>
        <p id="queue-reorder-help" className="sr-only">Drag a tile to reorder, or focus it and press Alt plus Arrow Up or Arrow Down.</p>
        {!upcomingQueueItems.length ? <p className="rounded-xl border border-dashed border-neutral-700 p-4 text-sm text-neutral-400">Nothing up next. Use Add to queue on a song to add it here.</p> : (
          <Reorder.Group as="ol" axis="y" className="space-y-1.5" aria-label="Upcoming songs"
            values={upcomingQueueItems.map(item => item.queueItemId)}
            onReorder={ids => {
              if (draggedId.current) reorder(draggedId.current, ids.indexOf(draggedId.current), false);
            }}>
            {upcomingQueueItems.map((item, index) => (
              <QueueTile key={item.queueItemId} id={item.queueItemId}
                onDragStart={() => { draggedId.current = item.queueItemId; }}
                onDragEnd={() => { draggedId.current = null; }}
                onKeyDown={event => {
                  if (event.target !== event.currentTarget || !event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
                  event.preventDefault();
                  reorder(item.queueItemId, index + (event.key === 'ArrowUp' ? -1 : 1));
                }}>
                <QueueCover track={item.track} />{details(item.track)}{trailing(item, index)}
              </QueueTile>
            ))}
          </Reorder.Group>
        )}
      </motion.div>
      <p role="status" className="sr-only">{announcement}</p>
    </section>
  );
}
