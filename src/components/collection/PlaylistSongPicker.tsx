import React, { useEffect, useRef, useState } from 'react';
import { X, Check, Plus, Music2, ListMusic } from 'lucide-react';
import { usePlaylists } from '../../context/PlaylistsContext';
import { useTitleLanguage } from '../../context/TitleLanguageContext';
import { PLAYLIST_NAME_LIMIT, songReferenceKey, type PlaylistSongReference } from '../../services/playlistsStorage';
import { fetchAnimeCoverUrl } from '../../services/api';
import { getCachedCover } from '../../services/coverCache';
import { RemovalUndoNotices } from '../../context/RemovalUndoContext';

const button = 'min-h-11 min-w-11 rounded-lg px-3 py-2 text-sm cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-300 disabled:opacity-50';

function PlaylistSongCover({ title, anilistId }: { title: string; anilistId?: number | null }) {
  const [cover, setCover] = useState(() => getCachedCover(title, anilistId));
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    if (!cover && (title || anilistId)) {
      void fetchAnimeCoverUrl(title, anilistId)
        .then(url => { if (active) setCover(url); })
        .catch(() => {});
    }
    return () => { active = false; };
  }, [title, anilistId, cover]);
  return <div aria-hidden="true" className="flex h-20 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
    {cover && !failed
      ? <img src={cover} alt="" draggable={false} decoding="async" onError={() => setFailed(true)} className="h-full w-full object-cover" />
      : <Music2 className="h-6 w-6" />}
  </div>;
}

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
    const triggerKey = target?.getAttribute('data-song-actions-trigger');
    const dialog = dialogRef.current!;
    dialog.showModal(); closeRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close(); document.body.style.overflow = overflow;
      // Resizing may hide the original desktop/mobile row while the dialog is open.
      const visibleTrigger = triggerKey ? Array.from(document.querySelectorAll<HTMLElement>('[data-song-actions-trigger]'))
        .find(element => element.getAttribute('data-song-actions-trigger') === triggerKey && element.getClientRects().length) : null;
      if (visibleTrigger) visibleTrigger.focus();
      else if (target?.isConnected && target.getClientRects().length) target.focus();
      else document.getElementById('search-input')?.focus();
    };
  }, []);
  const songKey = songReferenceKey(song);
  const toggle = (id: string, listName: string, isIn: boolean) => {
    setStatus('');
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
    className="m-auto w-[calc(100%-2rem)] max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-neutral-700/70 bg-[#1e2022] p-5 text-neutral-100 shadow-2xl backdrop:bg-black/75 sm:p-6">
    <div className="flex items-center justify-between gap-3"><div><p className="mb-1 text-xs font-semibold uppercase tracking-widest text-emerald-400">Your collection</p><h2 id="playlist-picker-title" className="text-xl font-bold">Add to playlist</h2></div><button ref={closeRef} onClick={onClose} aria-label="Close playlist picker" className={`${button} self-start text-neutral-400 hover:bg-neutral-800 hover:text-white`}><X aria-hidden="true" className="h-5 w-5" /></button></div>
    <div className="mt-5 flex items-center gap-4 rounded-xl border border-neutral-700/60 bg-[#272b2d] p-4">
    <PlaylistSongCover key={JSON.stringify([song.snapshot?.anime_name, song.snapshot?.anilist_id])} title={song.snapshot?.anime_name || ''} anilistId={song.snapshot?.anilist_id} />
    <div className="min-w-0">
    <p className="break-words text-base font-semibold leading-snug">{song.snapshot?.song_name || song.songId}</p>
    {song.snapshot?.artist && <p className="mt-1 break-words text-sm text-neutral-400">{song.snapshot.artist}</p>}
    {song.snapshot && <p className="mt-1 break-words text-sm text-neutral-400">{displayTitle(song.snapshot)}</p>}
    </div></div>
    <div className="mt-6 flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">Your playlists</h3><span className="text-xs text-neutral-400">{playlists.length} total</span></div>
    <p className="mt-1.5 text-xs leading-relaxed text-neutral-400">Choose any playlist. Select an added playlist again to remove the song.</p>
    {(error || storageError) && <p role="alert" className="my-3 text-sm text-rose-300">{error || storageError}{storageError && <button className={button} onClick={refresh}>Retry</button>}</p>}
    <p role="status" className="sr-only">{status}</p>
    <RemovalUndoNotices inline />
    <div className="my-4 space-y-2">
      {!playlists.length && <div className="rounded-xl border border-dashed border-neutral-700 px-4 py-6 text-center"><ListMusic aria-hidden="true" className="mx-auto mb-2 h-6 w-6 text-emerald-400" /><p className="text-sm font-medium">A place for your favorites</p><p className="mt-1 text-xs text-neutral-400">Create your first playlist below.</p></div>}
      {playlists.map((list) => {
        const added = list.songs.some((ref) => songReferenceKey(ref) === songKey);
        return <button key={list.id} disabled={Boolean(storageError)} aria-pressed={added} onClick={() => toggle(list.id, list.name, added)}
          className={`${button} flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors motion-reduce:transition-none ${added ? 'border-emerald-400/50 bg-emerald-400/10 hover:bg-emerald-400/15' : 'border-neutral-700/70 bg-neutral-900/30 hover:border-neutral-500 hover:bg-neutral-800'}`}>
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${added ? 'bg-emerald-400/15 text-emerald-300' : 'bg-neutral-700/40 text-neutral-400'}`}><ListMusic aria-hidden="true" className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1"><span className="block break-words font-medium">{list.name}</span><span className="mt-1 block text-xs text-neutral-400">{list.songs.length} {list.songs.length === 1 ? 'song' : 'songs'}</span></span><span className={`flex shrink-0 items-center gap-1.5 text-xs font-medium ${added ? 'text-emerald-300' : 'text-neutral-300'}`}>{added ? <><Check aria-hidden="true" className="h-4 w-4" />Added</> : <><Plus aria-hidden="true" className="h-4 w-4" />Add</>}</span>
        </button>;
      })}
    </div>
    <form className="space-y-3 border-t border-neutral-700/60 pt-5" onSubmit={(e) => {
      e.preventDefault();
      setStatus('');
      try {
        const next = change({ type: 'create', name, song });
        const created = next[next.length - 1];
        setName(''); setError(''); setStatus(`Created ${created.name} and added this song.`);
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create this playlist.'); }
    }}>
      <label htmlFor="new-playlist-name" className="block text-sm font-semibold">New playlist name</label>
      <input id="new-playlist-name" placeholder="Give your playlist a name" autoComplete="off" maxLength={PLAYLIST_NAME_LIMIT} value={name} onChange={(e) => setName(e.target.value)} className="min-h-11 w-full rounded-lg border border-neutral-600 bg-neutral-900/70 px-3 text-base placeholder:text-neutral-500 focus:outline-emerald-300" />
      <button disabled={Boolean(storageError) || !name.trim()} className={`${button} flex w-full items-center justify-center gap-2 bg-emerald-400 font-semibold text-neutral-950 hover:bg-emerald-300 disabled:cursor-default`}><Plus aria-hidden="true" className="h-4 w-4" />Create and add song</button>
    </form>
  </dialog>;
}
