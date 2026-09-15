import React, { useEffect, useRef, useState } from 'react';
import { History, Play, Trash2 } from 'lucide-react';
import { usePlayer } from '../../context/PlayerContext';
import { useTitleLanguage } from '../../context/TitleLanguageContext';
import { recentSongKey } from '../../services/playbackStorage';

const buttonStyle = 'min-h-11 cursor-pointer rounded-lg px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-emerald-300 disabled:cursor-default disabled:opacity-40';

export function RecentSongs() {
  const { recentSongs, historyNotice, clearRecentSongs, playTrack } = usePlayer();
  const { displayTitle } = useTitleLanguage();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const clearRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!confirming) return;
    const dialog = dialogRef.current!;
    dialog.showModal();
    cancelRef.current?.focus();
    return () => { dialog.close(); clearRef.current?.focus(); };
  }, [confirming]);

  return <>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-neutral-400">Your last 100 songs, most recent first.</p>
      <button ref={clearRef} onClick={() => { setError(''); setConfirming(true); }} disabled={!recentSongs.length && !historyNotice}
        className={`${buttonStyle} flex items-center gap-2 text-neutral-300 hover:bg-neutral-800`}>
        <Trash2 aria-hidden="true" className="h-4 w-4" />Clear history
      </button>
    </div>
    {historyNotice && <p role="status" className="mb-4 text-sm text-amber-200">{historyNotice}</p>}
    <p role="status" className="sr-only">{status}</p>
    {recentSongs.length ? <ol className="divide-y divide-neutral-800 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/50">
      {recentSongs.map(({ track, playedAt }) => <li key={recentSongKey(track)} className="flex min-w-0 items-center gap-3 p-3 sm:p-4">
        <button onClick={() => playTrack(track)} disabled={!track.videoUrl} aria-label={`Play ${track.songName || track.animeTitle}`}
          title={track.videoUrl ? 'Play song' : 'Media unavailable'}
          className={`${buttonStyle} flex h-11 w-11 shrink-0 items-center justify-center bg-emerald-950/50 text-emerald-300 hover:bg-emerald-900/60`}>
          <Play aria-hidden="true" className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-semibold text-neutral-100">{track.songName || 'Theme Song'}</p>
          <p className="break-words text-sm text-neutral-400">{displayTitle(track.animeTitles ?? { anime_name: track.animeTitle })}{track.artist ? ` · ${track.artist}` : ''}</p>
          <time dateTime={new Date(playedAt).toISOString()} className="mt-1 block text-xs text-neutral-500">{new Date(playedAt).toLocaleString()}</time>
          {!track.videoUrl && <p className="mt-1 text-xs text-amber-200">Media unavailable</p>}
        </div>
      </li>)}
    </ol> : <div className="rounded-xl border border-dashed border-neutral-700 px-5 py-12 text-center">
      <History aria-hidden="true" className="mx-auto mb-3 h-7 w-7 text-neutral-500" />
      <p className="font-semibold text-neutral-200">No recent songs yet</p>
      <p className="mt-2 text-sm text-neutral-400">Songs appear here when you listen to them.</p>
    </div>}
    {confirming && <dialog ref={dialogRef} aria-labelledby="clear-history-title" aria-describedby="clear-history-description"
      onCancel={event => { event.preventDefault(); setConfirming(false); }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border border-neutral-700 bg-[#1e2022] p-5 text-neutral-100 shadow-2xl backdrop:bg-black/70">
      <h2 id="clear-history-title" className="text-lg font-bold">Clear listening history?</h2>
      <p id="clear-history-description" className="mt-3 text-sm leading-6 text-neutral-300">Remove all recent songs from this browser. Your current queue, Saved Songs and playlists will stay.</p>
      {error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button ref={cancelRef} onClick={() => setConfirming(false)} className={`${buttonStyle} hover:bg-neutral-700`}>Cancel</button>
        <button onClick={() => {
          if (!clearRecentSongs()) { setError('Could not clear history in this browser. Please retry.'); return; }
          setConfirming(false); setStatus('Listening history cleared.');
        }} className={`${buttonStyle} bg-rose-600 font-semibold text-white hover:bg-rose-500`}>Clear recent songs</button>
      </div>
    </dialog>}
  </>;
}
