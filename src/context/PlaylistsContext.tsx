import React, { createContext, useContext, useEffect, useState } from 'react';
import { changePlaylists, loadPlaylists, PLAYLISTS_STORAGE_KEY, type CustomPlaylist, type PlaylistChange } from '../services/playlistsStorage';
import { songReferenceKey } from '../services/playlistsStorage';
import { RemovalUndoProvider, useRemovalUndo } from './RemovalUndoContext';

const Context = createContext<{
  playlists: CustomPlaylist[]; error: string; refresh: () => void;
  change: (change: PlaylistChange) => CustomPlaylist[];
} | null>(null);

export function PlaylistsProvider({ children }: { children: React.ReactNode }) {
  return <RemovalUndoProvider><PlaylistStateProvider>{children}</PlaylistStateProvider></RemovalUndoProvider>;
}

function PlaylistStateProvider({ children }: { children: React.ReactNode }) {
  const { offer } = useRemovalUndo();
  const [playlists, setPlaylists] = useState<CustomPlaylist[]>([]);
  const [error, setError] = useState('');
  const refresh = () => {
    try { setPlaylists(loadPlaylists()); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not read playlists.'); }
  };
  useEffect(() => {
    refresh();
    const sync = (event: StorageEvent) => { if (event.key === PLAYLISTS_STORAGE_KEY || event.key === null) refresh(); };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  return <Context.Provider value={{ playlists, error, refresh, change: (change) => {
    const before = ['removeSong', 'delete', 'deleteMany'].includes(change.type) ? loadPlaylists() : [];
    const list = change.type === 'removeSong' ? before.find(list => list.id === change.id) : undefined;
    const item = list && change.type === 'removeSong' ? list.songs.find(song => songReferenceKey(song) === change.songKey) : undefined;
    const next = changePlaylists(change);
    setPlaylists(next);
    setError('');
    const deleted = before.filter(list => !next.some(current => current.id === list.id));
    if (deleted.length) {
      offer(deleted.length === 1 ? `Deleted “${deleted[0].name}”.` : `Deleted ${deleted.length} playlists.`, () => {
        setPlaylists(changePlaylists({ type: 'restoreLists', removed: deleted, order: before.map(list => list.id) }));
        setError('');
      });
    }
    if (list && item) {
      const removed = { item: structuredClone(item), order: list.songs.map(songReferenceKey) };
      offer(`Removed “${item.snapshot?.song_name || item.songId}” from ${list.name}.`, () => {
        setPlaylists(changePlaylists({ type: 'restoreSong', id: list.id, removed }));
        setError('');
      });
    }
    return next;
  } }}>{children}</Context.Provider>;
}

export function usePlaylists() {
  const value = useContext(Context);
  if (!value) throw new Error('PlaylistsProvider is required');
  return value;
}
