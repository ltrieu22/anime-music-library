import React, { createContext, useContext, useEffect, useState } from 'react';
import { changePlaylists, loadPlaylists, PLAYLISTS_STORAGE_KEY, type CustomPlaylist, type PlaylistChange } from '../services/playlistsStorage';

const Context = createContext<{
  playlists: CustomPlaylist[]; error: string; refresh: () => void;
  change: (change: PlaylistChange) => CustomPlaylist[];
} | null>(null);

export function PlaylistsProvider({ children }: { children: React.ReactNode }) {
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
    const next = changePlaylists(change);
    setPlaylists(next);
    setError('');
    return next;
  } }}>{children}</Context.Provider>;
}

export function usePlaylists() {
  const value = useContext(Context);
  if (!value) throw new Error('PlaylistsProvider is required');
  return value;
}
