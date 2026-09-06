import React, { useEffect, useRef, useState } from 'react';
import { X, Check, Plus } from 'lucide-react';
import { usePlaylists } from '../../context/PlaylistsContext';
import { useTitleLanguage } from '../../context/TitleLanguageContext';
import { PLAYLIST_NAME_LIMIT, songReferenceKey, type PlaylistSongReference } from '../../services/playlistsStorage';

const button = 'min-h-11 min-w-11 rounded-lg px-3 py-2 text-sm cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-300 disabled:opacity-50';

export function PlaylistSongPicker({ song, onClose }: { song: PlaylistSongReference; onClose: () => void }) {
  const { playlists, error: storageError, refresh, change } = usePlaylists();
  const { displayTitle } = useTitleLanguage();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  useEffect(() => {
    const target = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current!;
    dialog.showModal(); closeRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close(); document.body.style.overflow = overflow;
      if (target?.isConnected) target.focus(); else document.getElementById('search-input')?.focus();
    };
  }, []);
  const songKey = songReferenceKey(song);
  const toggle = (id: string, listName: string, isIn: boolean) => {
    try {
      if (isIn) {
        change({ type: 'removeSong', id, songKey });
        setStatus(`Removed from ${listName}.`);
      } else {
        change({ type: 'addSong', id, song });
        setStatus(`Added to ${listName}.`);
      }
      setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : isIn ? 'Could not remove this song.' : 'Could not add this song.'); }
  };
  return <dialog ref={dialogRef} aria-labelledby="playlist-picker-title" onCancel={(e) => { e.preventDefault(); onClose(); }}
    onKeyDown={(e) => {
      if (e.key !== 'Tab') return;
      const controls = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)'));
      const first = controls[0], last = controls[controls.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }}
    onClick={(e) => {
      if (e.target !== e.currentTarget) return;
      const r = e.currentTarget.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose();
    }}
    className="m-auto w-[calc(100%-2rem)] max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-neutral-800 bg-[#1e2022] p-5 text-neutral-100 shadow-2xl backdrop:bg-black/70">
    <div className="flex items-center justify-between gap-3"><h2 id="playlist-picker-title" className="font-bold">Add to playlist</h2><button ref={closeRef} onClick={onClose} aria-label="Close playlist picker" className={`${button} hover:bg-neutral-800`}><X aria-hidden="true" className="h-5 w-5" /></button></div>
    <p className="mt-3 break-words text-sm font-semibold">{song.snapshot?.song_name || song.songId}</p>
    {song.snapshot?.artist && <p className="mt-1 break-words text-sm text-neutral-400">{song.snapshot.artist}</p>}
    {song.snapshot && <p className="mt-1 break-words text-sm text-neutral-400">{displayTitle(song.snapshot)}</p>}
    <p className="mt-2 text-xs text-neutral-500">Tap a playlist to add this song. Tap it again to remove it.</p>
    {(error || storageError) && <p role="alert" className="my-3 text-sm text-rose-300">{error || storageError}{storageError && <button className={button} onClick={refresh}>Retry</button>}</p>}
    <p role="status" className="my-3 text-sm text-emerald-300">{status}</p>
    <div className="my-4 space-y-2">
      {!playlists.length && <p className="text-sm text-neutral-400">Create your first playlist below.</p>}
      {playlists.map((list) => {
        const added = list.songs.some((ref) => songReferenceKey(ref) === songKey);
        return <button key={list.id} disabled={Boolean(storageError)} aria-pressed={added} onClick={() => toggle(list.id, list.name, added)}
          className={`${button} flex w-full items-center justify-between gap-3 border text-left hover:bg-neutral-800 ${added ? 'border-emerald-500/70 bg-emerald-400/10' : 'border-neutral-700'}`}>
          <span className="min-w-0 break-words">{list.name}</span><span className={`flex shrink-0 items-center gap-1 text-xs ${added ? 'text-emerald-300' : 'text-neutral-300'}`}>{added ? <><Check aria-hidden="true" className="h-4 w-4" />Added</> : <><Plus aria-hidden="true" className="h-4 w-4" />Add</>}</span>
        </button>;
      })}
    </div>
    <form className="space-y-2 border-t border-neutral-800 pt-4" onSubmit={(e) => {
      e.preventDefault();
      try {
        const next = change({ type: 'create', name });
        const created = next[next.length - 1];
        setName(''); toggle(created.id, created.name, false);
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create this playlist.'); }
    }}>
      <label htmlFor="new-playlist-name" className="block text-sm text-neutral-400">New playlist name</label>
      <input id="new-playlist-name" maxLength={PLAYLIST_NAME_LIMIT} value={name} onChange={(e) => setName(e.target.value)} className="min-h-11 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 text-base focus:outline-emerald-300" />
      <button disabled={Boolean(storageError)} className={`${button} bg-emerald-400 font-semibold text-neutral-950`}>Create and add song</button>
    </form>
  </dialog>;
}
