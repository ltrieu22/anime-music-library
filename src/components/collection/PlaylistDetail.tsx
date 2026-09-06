import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUp, ArrowDown, Trash2, Play, Shuffle } from 'lucide-react';
import { SongTable, type SongMenuAction } from '../SongTable';
import { RemoveSongModal } from '../RemoveSongModal';
import { usePlayer } from '../../context/PlayerContext';
import { usePlaylists } from '../../context/PlaylistsContext';
import { useTitleLanguage } from '../../context/TitleLanguageContext';
import { loadStaticCatalog } from '../../services/catalogEngine';
import { resolvePlaylistSong, songReferenceKey, type CustomPlaylist } from '../../services/playlistsStorage';
import { toSongTrack } from '../../utils/player';
import type { AnimeSongItem, NoteMap, NoteSongSnapshot } from '../../types';

const button = 'min-h-11 min-w-11 inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-300 disabled:opacity-30 disabled:cursor-default';

export function PlaylistDetail({ playlist, notes, onEditNote, onAddToPlaylist, isSongSaved, onToggleSaved }: {
  playlist: CustomPlaylist;
  notes: NoteMap;
  onEditNote: (song: NoteSongSnapshot) => void;
  onAddToPlaylist: (song: NoteSongSnapshot) => void;
  isSongSaved: (song: NoteSongSnapshot) => boolean;
  onToggleSaved: (song: NoteSongSnapshot) => void | Promise<void>;
}) {
  const { change, error: storageError } = usePlaylists();
  const { playQueue } = usePlayer();
  const { displayTitle } = useTitleLanguage();
  const [catalog, setCatalog] = useState<AnimeSongItem[]>([]);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [removing, setRemoving] = useState<{ song: NoteSongSnapshot; key: string } | null>(null);
  useEffect(() => {
    let active = true;
    loadStaticCatalog().then(([songs]) => { if (active) setCatalog(songs); }).catch(() => {});
    return () => { active = false; };
  }, []);
  const rows = useMemo(() => playlist.songs.map((ref) => {
    const song = resolvePlaylistSong(ref, catalog);
    const key = songReferenceKey(ref);
    const track = toSongTrack(song, 'collection');
    return { song, key, track: track ? { ...track, id: `playlist:${playlist.id}:${key}` } : null };
  }), [playlist, catalog]);
  const tracks = rows.flatMap((row) => row.track ? [row.track] : []);
  const play = (song: NoteSongSnapshot) => {
    const row = rows.find((row) => row.song === song);
    if (row?.track) playQueue(tracks, tracks.indexOf(row.track));
  };
  const shuffle = () => {
    const shuffled = [...tracks];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    playQueue(shuffled);
  };
  return <div>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <div><h2 id="playlist-detail-heading" tabIndex={-1} className="text-sm font-semibold outline-none">{rows.length} song{rows.length === 1 ? '' : 's'} · Playlist order</h2>
        <p className="mt-1 text-xs text-neutral-400">Use the arrows to reorder. Changes apply when you start this playlist again.</p>
        {tracks.length < rows.length && <p className="mt-1 text-xs text-amber-300">{rows.length - tracks.length} song(s) have no playable media and will be skipped.</p>}
      </div>
      <div className="flex flex-wrap gap-2"><button disabled={!tracks.length} onClick={() => playQueue(tracks)} className={`${button} bg-emerald-400 font-semibold text-neutral-950`}><Play aria-hidden="true" className="h-4 w-4" />Play Playlist</button><button disabled={!tracks.length} onClick={shuffle} className={`${button} bg-neutral-800`}><Shuffle aria-hidden="true" className="h-4 w-4" />Shuffle</button></div>
    </div>
    {error && <p role="alert" className="mb-4 text-sm text-rose-300">{error}</p>}
    <p role="status" className="sr-only">{status}</p>
    {!rows.length ? <div className="rounded-xl border border-neutral-800 bg-[#232628] p-8 text-center"><h3 className="font-semibold">No songs yet</h3><p className="mt-2 text-sm text-neutral-400">Use Add to playlist on a song in Catalog or Saved Songs.</p></div> :
      <SongTable
        entries={rows.map((row) => row.song)}
        sortKey="id"
        sortOrder="asc"
        onSort={() => {}}
        searchQuery=""
        notes={notes}
        onEditNote={onEditNote}
        onAddToPlaylist={onAddToPlaylist}
        isSongSaved={isSongSaved}
        onToggleSaved={onToggleSaved}
        playlistView={{
          getTrack: (song) => rows.find((row) => row.song === song)?.track ?? null,
          play,
          rowKey: (index) => rows[index].key,
          menuActions: (index) => {
            const row = rows[index];
            const name = row.song.song_name || displayTitle(row.song);
            const actions: SongMenuAction[] = [
              {
                id: 'move-up',
                label: 'Move up',
                icon: ArrowUp,
                disabled: Boolean(storageError) || index === 0,
                onSelect: () => {
                  try {
                    change({ type: 'moveSong', id: playlist.id, songKey: row.key, direction: -1 });
                    setError('');
                    setStatus(`${name} moved up.`);
                  } catch (cause) {
                    setError(cause instanceof Error ? cause.message : 'Could not reorder songs.');
                  }
                },
              },
              {
                id: 'move-down',
                label: 'Move down',
                icon: ArrowDown,
                disabled: Boolean(storageError) || index === rows.length - 1,
                onSelect: () => {
                  try {
                    change({ type: 'moveSong', id: playlist.id, songKey: row.key, direction: 1 });
                    setError('');
                    setStatus(`${name} moved down.`);
                  } catch (cause) {
                    setError(cause instanceof Error ? cause.message : 'Could not reorder songs.');
                  }
                },
              },
              {
                id: 'remove-from-playlist',
                label: 'Remove from playlist',
                icon: Trash2,
                tone: 'danger',
                disabled: Boolean(storageError),
                onSelect: () => setRemoving({ song: row.song, key: row.key }),
              },
            ];
            return actions;
          },
        }}
      />}
    {removing && <RemoveSongModal entry={removing.song} playlistName={playlist.name} onClose={() => setRemoving(null)} onConfirm={async () => {
      change({ type: 'removeSong', id: playlist.id, songKey: removing.key });
      setStatus('Song removed from this playlist.');
    }} />}
  </div>;
}
