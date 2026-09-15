import { usePlaylists } from '../../context/PlaylistsContext';
import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bookmark, History, ListMusic, Pencil, Plus, Trash2, X } from 'lucide-react';
import { PLAYLIST_NAME_LIMIT, SAVED_SONGS_ID, type CustomPlaylist, type PlaylistChange } from '../../services/playlistsStorage';
import { RecentSongs } from './RecentSongs';
import { usePlayer } from '../../context/PlayerContext';

const RECENT_SONGS_ID = 'recent-songs';

const buttonStyle = 'min-h-11 min-w-11 cursor-pointer rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300';
type DialogAction = { type: 'create' } | { type: 'rename' | 'delete'; playlist: CustomPlaylist }
  | { type: 'deleteMany'; playlists: CustomPlaylist[] };

// Uses the same native modal, cancellation, focus containment and restoration
// pattern as RemoveSongModal. Deletion starts on Cancel.
function PlaylistDialog({ action, onClose, onSave }: {
  action: DialogAction;
  onClose: () => void;
  onSave: (change: PlaylistChange) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [name, setName] = useState('playlist' in action ? action.playlist.name : '');
  const [error, setError] = useState('');
  const deleting = action.type === 'delete' || action.type === 'deleteMany';
  const deletingLists = action.type === 'deleteMany' ? action.playlists : action.type === 'delete' ? [action.playlist] : [];
  const title = action.type === 'deleteMany' ? `Delete ${deletingLists.length} playlist${deletingLists.length === 1 ? '' : 's'}?` : deleting ? 'Delete playlist?' : action.type === 'create' ? 'Create playlist' : 'Rename playlist';

  useEffect(() => {
    const returnTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current!;
    dialog.showModal();
    if (deleting) cancelRef.current?.focus();
    else { inputRef.current?.focus(); inputRef.current?.select(); }
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (returnTarget?.isConnected && !returnTarget.matches(':disabled')) returnTarget.focus();
      else document.getElementById('collection-library-heading')?.focus();
    };
  }, [deleting]);

  return (
    <dialog ref={dialogRef} aria-labelledby="playlist-dialog-title" aria-describedby={deleting ? 'playlist-delete-description' : undefined}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)'));
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-neutral-800 bg-[#1e2022] p-0 text-neutral-100 shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-xs">
      <div className="flex items-center justify-between gap-3 border-b border-neutral-800 px-5 py-3">
        <h2 id="playlist-dialog-title" className="font-bold">{title}</h2>
        <button onClick={onClose} aria-label="Close playlist dialog" className={`${buttonStyle} text-neutral-400 hover:bg-neutral-800`}><X aria-hidden="true" className="h-5 w-5" /></button>
      </div>
      <form className="space-y-4 p-5" onSubmit={(event) => {
        event.preventDefault();
        try {
          onSave(action.type === 'create' ? { type: 'create', name } : action.type === 'rename'
            ? { type: 'rename', id: action.playlist.id, name } : action.type === 'deleteMany'
              ? { type: 'deleteMany', ids: action.playlists.map((list) => list.id) } : { type: 'delete', id: action.playlist.id });
          onClose();
        } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save this change. Please retry.'); }
      }}>
        {deleting ? (
          <div id="playlist-delete-description" className="space-y-3 text-sm leading-6 text-neutral-300">
            <ul className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-900 p-4 font-semibold text-white">
              {deletingLists.map((list) => <li key={list.id} className="break-words">{list.name}</li>)}
            </ul>
            <p>{deletingLists.length === 1 ? 'Delete this playlist?' : 'Delete these playlists?'} Saved Songs, other playlists, and your personal notes will stay.</p>
            <p>Your current playback and queue will continue. This cannot be undone.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <label htmlFor="playlist-name" className="block text-sm text-neutral-300">Playlist name</label>
            <input ref={inputRef} id="playlist-name" value={name} onChange={(event) => { setName(event.target.value); setError(''); }}
              maxLength={PLAYLIST_NAME_LIMIT} autoComplete="off" aria-invalid={Boolean(error)} aria-describedby={error ? 'playlist-dialog-error' : 'playlist-name-hint'}
              className="min-h-11 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-base outline-none focus:border-emerald-400" />
            <p id="playlist-name-hint" className="text-xs text-neutral-500">Up to {PLAYLIST_NAME_LIMIT} characters. Each playlist needs a unique name.</p>
          </div>
        )}
        {error && <p id="playlist-dialog-error" role="alert" className="rounded-lg border border-rose-800/60 bg-rose-950/50 p-3 text-sm text-rose-300">{error}</p>}
        <div className="flex flex-wrap justify-end gap-3 border-t border-neutral-800 pt-4">
          <button ref={cancelRef} type="button" onClick={onClose} className={`${buttonStyle} text-neutral-300 hover:bg-neutral-800`}>Cancel</button>
          <button type="submit" className={`${buttonStyle} font-semibold ${deleting ? 'bg-rose-500 text-white hover:bg-rose-400' : 'bg-emerald-400 text-neutral-950 hover:bg-emerald-300'}`}>
            {action.type === 'deleteMany' ? `Delete selected (${deletingLists.length})` : deleting ? 'Delete playlist' : action.type === 'create' ? 'Create playlist' : 'Save name'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

export function CollectionLibrary({ savedCount, children, renderPlaylist }: { savedCount: number; children: React.ReactNode; renderPlaylist: (playlist: CustomPlaylist) => React.ReactNode }) {
  const { recentSongs, playbackStorageError, retryPlaybackStorage } = usePlayer();
  const { playlists, error, refresh, change: applyChange } = usePlaylists();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [action, setAction] = useState<DialogAction | null>(null);
  const [status, setStatus] = useState('');
  const [managing, setManaging] = useState(false);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const doneRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (managing) doneRef.current?.focus(); }, [managing]);
  const checkedLists = playlists.filter((list) => checkedIds.includes(list.id));
  const finishManaging = () => {
    setManaging(false);
    setCheckedIds([]);
    document.getElementById('collection-library-heading')?.focus();
  };

  const selected = playlists.find((list) => list.id === selectedId);
  const showingSaved = selectedId === SAVED_SONGS_ID;
  const showingRecent = selectedId === RECENT_SONGS_ID;
  const showingDetail = showingSaved || showingRecent || Boolean(selected);
  const navigate = (id: string | null) => {
    setSelectedId(id);
    document.getElementById('collection-library-heading')?.focus();
  };

  return (
    <section aria-labelledby="collection-library-heading">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          {showingDetail && <button onClick={() => navigate(null)} className={`${buttonStyle} -ml-3 mb-1 flex items-center gap-2 text-neutral-400 hover:text-white`}><ArrowLeft aria-hidden="true" className="h-4 w-4" />My Collection</button>}
          <h1 id="collection-library-heading" tabIndex={-1} className="break-words text-2xl font-bold text-white outline-none">{showingSaved ? 'Saved Songs' : showingRecent ? 'Recent songs' : selected?.name ?? 'My Collection'}</h1>
          <p className="mt-1 text-sm text-neutral-400">{showingSaved ? `${savedCount} saved song${savedCount === 1 ? '' : 's'} · Catalog Save adds here` : showingRecent ? 'Listening history · Stored in this browser' : selected ? 'Custom playlist · Stored in this browser' : 'Your saved songs, playlists and recent listening, stored in this browser.'}</p>
        </div>
        {!showingDetail && <div className="grid w-full sm:w-auto">
          <div aria-hidden={managing} className={`col-start-1 row-start-1 flex gap-2 ${managing ? 'invisible' : ''}`}>
          <button onClick={() => { setCheckedIds([]); setManaging(true); }} disabled={Boolean(error) || !playlists.length} className={`${buttonStyle} bg-neutral-800 text-neutral-200 hover:bg-neutral-700 disabled:opacity-50`}>Manage playlists</button>
          <button onClick={() => setAction({ type: 'create' })} disabled={Boolean(error)} className={`${buttonStyle} flex items-center justify-center gap-2 bg-emerald-400 font-semibold text-neutral-950 hover:bg-emerald-300 disabled:opacity-50`}><Plus aria-hidden="true" className="h-4 w-4 shrink-0" />Create playlist</button>
          </div>
          <div aria-label="Playlist selection" aria-hidden={!managing} className={`col-start-1 row-start-1 flex gap-2 ${managing ? '' : 'invisible'}`}>
            <button ref={doneRef} onClick={finishManaging} className={`${buttonStyle} bg-neutral-800 text-neutral-200 hover:bg-neutral-700`}>Done</button>
            <button disabled={Boolean(error) || !playlists.length || checkedLists.length === playlists.length} onClick={() => setCheckedIds(playlists.map((list) => list.id))} className={`${buttonStyle} text-emerald-300 hover:bg-neutral-800 disabled:opacity-50`}>Select all</button>
            <button aria-label={`Delete selected (${checkedLists.length})`} disabled={Boolean(error) || !checkedLists.length} onClick={() => setAction({ type: 'deleteMany', playlists: checkedLists })} className={`${buttonStyle} flex items-center justify-center gap-2 bg-rose-600 font-semibold text-white hover:bg-rose-500 disabled:opacity-50`}><Trash2 aria-hidden="true" className="h-4 w-4 shrink-0" /><span className="whitespace-nowrap">Delete ({checkedLists.length})</span></button>
            <span role="status" className="sr-only">{checkedLists.length} selected</span>
          </div>
        </div>}
        {selected && <div className="flex flex-wrap gap-2">
          <button disabled={Boolean(error)} onClick={() => setAction({ type: 'rename', playlist: selected })} className={`${buttonStyle} flex items-center gap-2 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 disabled:opacity-50`}><Pencil aria-hidden="true" className="h-4 w-4" />Rename playlist</button>
          <button disabled={Boolean(error)} onClick={() => setAction({ type: 'delete', playlist: selected })} className={`${buttonStyle} flex items-center gap-2 text-rose-300 hover:bg-rose-950/50 disabled:opacity-50`}><Trash2 aria-hidden="true" className="h-4 w-4" />Delete playlist</button>
        </div>}
      </div>
      {error && <div role="alert" className="mb-4 rounded-xl border border-rose-800/60 bg-rose-950/30 p-4 text-sm text-rose-300">{error}<button onClick={refresh} className={`${buttonStyle} ml-2 underline`}>Retry</button></div>}
      <p role="status" className="sr-only">{status}</p>
      {playbackStorageError && <div role="alert" className="mb-4 rounded-xl border border-rose-800/60 p-4 text-sm text-rose-300">{playbackStorageError}<button onClick={retryPlaybackStorage} className={`${buttonStyle} ml-2 underline`}>Retry saving playback</button></div>}
      {showingSaved ? children : showingRecent ? <RecentSongs /> : selected ? renderPlaylist(selected) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <button disabled={managing} onClick={() => navigate(SAVED_SONGS_ID)} className="flex min-h-40 flex-col justify-center cursor-pointer rounded-xl border border-emerald-800/60 bg-gradient-to-br from-emerald-950/70 to-neutral-900 p-5 text-left transition-colors hover:border-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:cursor-default">
            <Bookmark aria-hidden="true" className="mb-5 h-6 w-6 text-emerald-400" />
            <h2 className="text-base font-semibold text-white">Saved Songs</h2>
            <div className="mt-1 grid text-sm">
              <p className={`col-start-1 row-start-1 text-neutral-400 ${managing ? 'invisible' : ''}`} aria-hidden={managing}>{savedCount} song{savedCount === 1 ? '' : 's'} · Built-in playlist</p>
              <p className={`col-start-1 row-start-1 text-emerald-300 ${managing ? '' : 'invisible'}`} aria-hidden={!managing}>Protected · Cannot be deleted</p>
            </div>
          </button>
          {playlists.map((list) => managing ? <label key={list.id} className={`flex min-h-40 min-w-0 flex-col justify-center cursor-pointer rounded-xl border p-5 transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-emerald-300 ${checkedIds.includes(list.id) ? 'border-emerald-400 bg-emerald-950/50' : 'border-neutral-800 bg-[#232628] hover:border-neutral-500'}`}>
            <span className="mb-5 flex items-center justify-between gap-3"><ListMusic aria-hidden="true" className="h-6 w-6 text-neutral-400" /><input type="checkbox" aria-label={`Select ${list.name}`} checked={checkedIds.includes(list.id)} disabled={Boolean(error)} onChange={(event) => setCheckedIds((ids) => event.target.checked ? [...ids, list.id] : ids.filter((id) => id !== list.id))} className="h-5 w-5 shrink-0 accent-emerald-400" /></span>
            <span className="block break-words text-base font-semibold text-white">{list.name}</span>
            <span className="mt-1 block text-sm text-neutral-400">{list.songs.length} song{list.songs.length === 1 ? '' : 's'} · Custom playlist</span>
          </label> : <button key={list.id} onClick={() => navigate(list.id)} className="flex min-h-40 min-w-0 flex-col justify-center cursor-pointer rounded-xl border border-neutral-800 bg-[#232628] p-5 text-left transition-colors hover:border-neutral-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300">
            <ListMusic aria-hidden="true" className="mb-5 h-6 w-6 text-neutral-400" />
            <h2 className="break-words text-base font-semibold text-white">{list.name}</h2>
            <p className="mt-1 text-sm text-neutral-400">{list.songs.length} song{list.songs.length === 1 ? '' : 's'} · Custom playlist</p>
          </button>)}
          <button disabled={managing} onClick={() => navigate(RECENT_SONGS_ID)} className="flex min-h-40 min-w-0 cursor-pointer flex-col justify-center rounded-xl border border-neutral-800 bg-[#232628] p-5 text-left hover:border-neutral-500 focus-visible:outline-2 focus-visible:outline-emerald-300 disabled:cursor-default">
            <History aria-hidden="true" className="mb-5 h-6 w-6 text-neutral-400" />
            <h2 className="text-base font-semibold text-white">Recent songs</h2>
            <p className="mt-1 text-sm text-neutral-400">{recentSongs.length} song{recentSongs.length === 1 ? '' : 's'} · Listening history</p>
          </button>
        </div>
      )}
      {action && <PlaylistDialog action={action} onClose={() => setAction(null)} onSave={(change) => {
        applyChange(change);
        if (change.type === 'delete') setSelectedId(null);
        if (change.type === 'deleteMany') {
          setCheckedIds([]);
          setStatus(`${change.ids.length} playlist${change.ids.length === 1 ? '' : 's'} deleted. Current playback and queue continue.`);
        } else setStatus(change.type === 'create' ? 'Playlist created.' : change.type === 'rename' ? 'Playlist renamed.' : 'Playlist deleted.');
      }} />}
    </section>
  );
}
