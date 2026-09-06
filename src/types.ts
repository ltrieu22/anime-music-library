export interface AnimeTitleMetadata {
  anime_name_english?: string;
  anime_name_romaji?: string;
  anime_alt_names?: string[];
}

export interface AnimeSongEntry extends AnimeTitleMetadata {
  id: number;
  /** Persistent manual-song identity shared by custom playlists. */
  local_song_id?: string;
  /** Stable catalog identifier when this collection entry was copied from the catalog. */
  source_song_id?: string | number;
  anime_name: string;
  anime_year: number;
  artist: string;
  song_name: string;
  theme_type?: string;
  video_url?: string;
  audio_url?: string;
}

export interface AnimeSongItem extends AnimeTitleMetadata {
  id: string | number;
  anime_name: string;
  anime_year: number;
  artist: string;
  song_name: string;
  theme_type?: string;
  video_url?: string | null;
  audio_url?: string | null;
  anilist_id?: number | null;
  anime_vintage?: string | null;
  source?: 'anisongdb' | 'animethemes' | 'collection';
  /** Structured AnisongDB credits. The numeric ID identifies the artist across aliases and groups. */
  artists?: ArtistCredit[];
}

export interface ArtistCredit {
  id: number;
  names: string[];
  line_up_id?: number;
  groups?: ArtistCredit[] | null;
  members?: ArtistCredit[] | null;
}

export interface ActiveArtistFilter {
  ids: number[];
  label: string;
}

/**
 * The song metadata kept alongside a browser-only note. Keeping a snapshot lets
 * the Notes view continue to render even when a song is no longer in the local
 * collection or the catalog is temporarily unavailable.
 */
export interface NoteSongSnapshot extends AnimeTitleMetadata {
  id: string | number;
  anime_name: string;
  anime_year: number;
  artist: string;
  song_name: string;
  theme_type?: string;
  video_url?: string | null;
  audio_url?: string | null;
  anilist_id?: number | null;
  source?: 'anisongdb' | 'animethemes' | 'collection';
}

export interface PersonalSongNote {
  songKey: string;
  text: string;
  updatedAt: string;
  song: NoteSongSnapshot;
}

export type NoteMap = Record<string, PersonalSongNote>;

export type SortKey = 'id' | 'anime_name' | 'anime_year' | 'theme_type' | 'artist' | 'song_name';
export type SortOrder = 'asc' | 'desc';

export interface ThemeSongItem {
  type: string; // 'OP', 'ED', 'IN'
  title: string;
  artist: string;
  video_url?: string;
}

export interface AnimeSearchResult {
  id: string | number;
  name: string;
  year: number;
  coverImage?: string;
  themes: ThemeSongItem[];
}

export interface AnimeDetails {
  id?: number | null;
  anime: string;
  romaji?: string;
  english?: string;
  native?: string;
  coverImage?: string;
  bannerImage?: string;
  year?: number;
  season?: string;
  format?: string;
  genres?: string[];
  score?: number;
  episodes?: number;
  studio?: string;
}

export type DatabaseMode = 'anisongdb' | 'collection' | 'animethemes' | 'notes';
