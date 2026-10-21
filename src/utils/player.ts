import { AnimeSongEntry, AnimeSongItem, NoteSongSnapshot } from '../types';
import { SongTrack } from '../types/player';
import { copyAnimeTitleMetadata } from '../services/animeTitles';

export function toSongTrack(
  song: AnimeSongEntry | AnimeSongItem | NoteSongSnapshot,
  source: 'collection' | 'catalog' | 'notes',
  fallback?: AnimeSongItem
): SongTrack | null {
  const sourceId = 'source_song_id' in song ? song.source_song_id : undefined;
  const catalogMatch = sourceId !== undefined && String(sourceId) === String(fallback?.id) ? fallback : undefined;
  const mediaUrl = song.video_url || song.audio_url || catalogMatch?.video_url || catalogMatch?.audio_url;
  if (!mediaUrl) return null;

  return {
    // Distinguish a saved copy from its catalog original; the queue assigns occurrence IDs.
    id: `${source}:${song.id}`,
    animeTitle: song.anime_name,
    animeTitles: {
      ...copyAnimeTitleMetadata(song),
      anime_name: song.anime_name,
      id: song.id,
      source_song_id: 'source_song_id' in song ? song.source_song_id : undefined,
    },
    songName: song.song_name || undefined,
    artist: song.artist || undefined,
    type: song.theme_type || undefined,
    anilistId: ('anilist_id' in song ? song.anilist_id : undefined) ?? catalogMatch?.anilist_id,
    videoUrl: mediaUrl,
    actionSong: structuredClone(song),
  };
}
