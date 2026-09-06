import React, { useEffect, useState } from 'react';
import { Check, ListPlus } from 'lucide-react';
import { usePlayer } from '../../context/PlayerContext';
import type { SongTrack } from '../../types/player';

export function AddToQueueButton({ track, songName }: { track?: SongTrack | null; songName: string }) {
  const { addToQueue, queueItems } = usePlayer();
  const [added, setAdded] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => {
    if (!added) return;
    const timeout = window.setTimeout(() => setAdded(0), 1600);
    return () => window.clearTimeout(timeout);
  }, [added]);
  return (
    <>
      <button
        type="button"
        disabled={!track}
        onClick={() => {
          if (!track) return;
          addToQueue(track);
          setAdded(value => value + 1);
          setAnnouncement(`${songName} added to queue. ${queueItems.length + 1} song${queueItems.length === 0 ? '' : 's'} in queue.`);
        }}
        aria-label={`Add ${songName} to queue${track ? '' : ' (media unavailable)'}`}
        title={track ? (added ? 'Added to queue — click to add another copy' : 'Add to queue') : 'No playable media available'}
        className={`inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-emerald-300 disabled:cursor-default disabled:opacity-30 ${added ? 'bg-emerald-950/60 text-emerald-300' : 'text-neutral-400 hover:bg-neutral-800 hover:text-emerald-300'}`}
      >
        {added ? <Check aria-hidden="true" className="h-4 w-4" /> : <ListPlus aria-hidden="true" className="h-4 w-4" />}
      </button>
      <span role="status" className="sr-only">{announcement}</span>
    </>
  );
}
