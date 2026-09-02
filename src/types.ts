export interface AnimeSongEntry {
  id: number;
  anime_name: string;
  anime_year: number;
  artist: string;
  song_name: string;
  theme_type?: string;
  video_url?: string;
}

export interface AnimeSongItem {
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
}

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

export type DatabaseMode = 'anisongdb' | 'collection' | 'animethemes';
