import { useEffect, useRef, useState } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { loadStaticCatalog } from '../services/catalogEngine';
import { resolveSharedSong } from '../services/songSharing';
import { toSongTrack } from '../utils/player';

export function SharedSongLink() {
  const { playTrack, currentTrack } = usePlayer();
  const active = useRef(currentTrack);
  active.current = currentTrack;
  const [id, setId] = useState(() => new URL(window.location.href).searchParams.get('play'));
  const [error, setError] = useState('');
  useEffect(() => {
    const navigate = () => setId(new URL(window.location.href).searchParams.get('play'));
    window.addEventListener('popstate', navigate);
    return () => window.removeEventListener('popstate', navigate);
  }, []);
  useEffect(() => {
    setError('');
    if (id === null) return;
    let cancelled = false;
    const previous = active.current;
    void loadStaticCatalog().then(([catalog]) => {
      if (cancelled || active.current !== previous) return;
      const song = resolveSharedSong(id, catalog);
      const track = toSongTrack(song, 'catalog');
      if (!track) throw new Error('This shared song has no playable media.');
      playTrack(track);
    }).catch(error => {
      if (!cancelled) setError(error instanceof Error ? error.message : 'Could not open this song link. Reload to try again.');
    });
    return () => { cancelled = true; };
    // Only a changed play ID opens a song; search/history changes with the same ID do not restart it.
  }, [id, playTrack]);
  return error ? <div role="alert" className="mb-4 rounded-lg border border-amber-700 bg-neutral-900 p-3 text-sm text-amber-200">
    {error}<button className="ml-3 underline" onClick={() => setError('')}>Dismiss</button>
  </div> : null;
}
