import { AnimeSongEntry, AnimeSongItem, NoteSongSnapshot } from '../types';
import { SongTrack } from '../types/player';

export function toSongTrack(
  song: AnimeSongEntry | AnimeSongItem | NoteSongSnapshot,
  source: 'collection' | 'catalog' | 'notes',
  fallback?: AnimeSongItem
): SongTrack | null {
  const mediaUrl = song.video_url || song.audio_url || fallback?.video_url || fallback?.audio_url;
  if (!mediaUrl) return null;

  return {
    // A saved copy and its catalog original belong to different playback contexts.
    id: `${source}:${song.id}`,
    animeTitle: song.anime_name,
    songName: song.song_name || undefined,
    artist: song.artist || undefined,
    type: song.theme_type || undefined,
    anilistId: ('anilist_id' in song ? song.anilist_id : undefined) ?? fallback?.anilist_id,
    videoUrl: mediaUrl,
  };
}
