export interface AnimeSongEntry {
  id: number;
  anime_name: string;
  anime_year: number;
  artist: string;
  song_name: string;
  created_at?: string;
}

// Intentionally empty: the personal collection starts empty (0 tracks) by default.
export const INITIAL_ANIME_SONGS: AnimeSongEntry[] = [];
