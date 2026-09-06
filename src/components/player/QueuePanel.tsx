import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ListMusic, Trash2, X } from 'lucide-react';
import { usePlayer } from '../../context/PlayerContext';
import { useTitleLanguage } from '../../context/TitleLanguageContext';
import type { SongTrack } from '../../types/player';

const controlClass = 'inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-800 hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-300 disabled:cursor-default disabled:opacity-25 disabled:hover:bg-transparent';

export function QueuePanel({ onClose }: { onClose: () => void }) {
  const { currentQueueItem, upcomingQueueItems, queueSource, isPlaying, removeQueueItem, clearUpcoming, moveQueueItem } = usePlayer();
  const { displayTitle } = useTitleLanguage();
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef<string | null>(null);
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

  const details = (track: SongTrack) => (
    <div className="min-w-0 flex-1 break-words">
      <p className="text-sm font-semibold text-neutral-100">{track.songName || 'Untitled song'}</p>
      <p className="mt-0.5 text-xs text-neutral-300">{displayTitle(track.animeTitles ?? { anime_name: track.animeTitle })}</p>
      <p className="mt-1 text-xs text-neutral-400">{[track.artist, track.type].filter(Boolean).join(' · ')}</p>
    </div>
  );
  return (
    <section
      ref={panelRef}
      id="playback-queue"
      aria-labelledby="queue-heading"
      className="fixed bottom-20 right-0 z-[60] flex max-h-[calc(100dvh-6rem)] w-full flex-col overflow-hidden rounded-t-2xl border border-neutral-700 bg-[#1e2022] text-neutral-100 shadow-2xl sm:right-4 sm:bottom-24 sm:max-h-[calc(100dvh-7rem)] sm:w-[26rem] sm:rounded-2xl"
    >
      <header className="flex shrink-0 items-center justify-between border-b border-neutral-800 px-4 py-2">
        <h2 id="queue-heading" className="flex items-center gap-2 font-semibold"><ListMusic aria-hidden="true" className="h-5 w-5 text-emerald-400" />Playback queue</h2>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Close queue" title="Close queue (keep playing)" className={controlClass}><X aria-hidden="true" className="h-5 w-5" /></button>
      </header>
      <div className="overflow-y-auto overscroll-contain p-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-400">Now Playing <span className="normal-case font-normal text-neutral-400">{isPlaying ? '' : '· Paused / stopped'}</span></h3>
        {currentQueueItem && (
          <div className="flex items-start gap-2 rounded-xl border border-emerald-900/60 bg-emerald-950/20 p-3">
            {details(currentQueueItem.track)}
            <button
              type="button"
              className={controlClass}
              aria-label={`Remove current song ${currentQueueItem.track.songName || 'Untitled song'} from queue`}
              title={upcomingQueueItems.length ? 'Remove current song and play next' : 'Remove current song and close player'}
              onClick={() => {
                pendingFocus.current = upcomingQueueItems[1]?.queueItemId ?? 'close';
                removeQueueItem(currentQueueItem.queueItemId);
                setAnnouncement('Removed current song from queue.');
              }}
            ><Trash2 aria-hidden="true" className="h-4 w-4" /></button>
          </div>
        )}
        <div className="mt-5 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Up next <span className="text-neutral-400">({upcomingQueueItems.length})</span></h3>
          <button
            type="button"
            disabled={!upcomingQueueItems.length && queueSource !== 'collection'}
            className="min-h-11 cursor-pointer rounded-lg px-3 text-xs text-neutral-300 hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-emerald-300 disabled:cursor-default disabled:opacity-30"
            onClick={() => {
              pendingFocus.current = 'close';
              clearUpcoming();
              setAnnouncement('Upcoming queue cleared. Playback will stop after the current song.');
            }}
          >Clear upcoming</button>
        </div>
        <p className="mb-3 text-xs leading-5 text-neutral-400">
          {queueSource === 'collection' ? 'Collection repeats. Editing the queue turns repeat off.' : 'Playback stops at the end of this queue.'}
        </p>
        {!upcomingQueueItems.length ? (
          <p className="rounded-xl border border-dashed border-neutral-700 p-4 text-sm text-neutral-400">Nothing up next. Use Add to queue on a song to add it here.</p>
        ) : (
          <ol className="space-y-2" aria-label="Upcoming songs">
            {upcomingQueueItems.map((item, index) => (
              <li key={item.queueItemId} data-queue-item={item.queueItemId} tabIndex={-1} className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-3 focus:outline-2 focus:outline-emerald-400">
                <div className="flex gap-3"><span className="pt-0.5 text-xs tabular-nums text-neutral-500" aria-hidden="true">{index + 1}</span>{details(item.track)}</div>
                <div className="mt-1 flex justify-end gap-1">
                  {[{ label: 'up', offset: -1, Icon: ArrowUp }, { label: 'down', offset: 1, Icon: ArrowDown }].map(({ label, offset, Icon }) => (
                    <button
                      key={label} type="button" className={controlClass}
                      disabled={index + offset < 0 || index + offset >= upcomingQueueItems.length}
                      aria-label={`Move upcoming song ${index + 1}, ${item.track.songName || 'Untitled song'}, ${label}`}
                      title={`Move ${label}`}
                      onClick={() => {
                        pendingFocus.current = item.queueItemId;
                        moveQueueItem(item.queueItemId, index + offset);
                        setAnnouncement(`${item.track.songName || 'Song'} moved to upcoming position ${index + offset + 1}.`);
                      }}
                    ><Icon aria-hidden="true" className="h-4 w-4" /></button>
                  ))}
                  <button type="button" className={controlClass} title="Remove from queue"
                    aria-label={`Remove upcoming song ${index + 1}, ${item.track.songName || 'Untitled song'}, from queue`}
                    onClick={() => {
                      pendingFocus.current = upcomingQueueItems[index + 1]?.queueItemId ?? upcomingQueueItems[index - 1]?.queueItemId ?? 'close';
                      removeQueueItem(item.queueItemId);
                      setAnnouncement(`${item.track.songName || 'Song'} removed from queue.`);
                    }}><Trash2 aria-hidden="true" className="h-4 w-4" /></button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
      <p role="status" className="sr-only">{announcement}</p>
    </section>
  );
}
