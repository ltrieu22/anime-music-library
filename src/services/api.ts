import { AnimeSongEntry, AnimeSearchResult } from '../types';
import { INITIAL_ANIME_SONGS } from '../data/initialData';
import { searchStaticCatalog, loadStaticCatalog } from './catalogEngine';

const LOCAL_STORAGE_KEY = 'anime_songs_db_v1';
let isServerApiAvailable: boolean | null = null;

// Pre-warm static catalog in background
if (typeof window !== 'undefined') {
  setTimeout(() => {
    loadStaticCatalog().catch(() => {});
  }, 100);
}

// Synchronize local cache with localStorage
export function getLocalEntries(): AnimeSongEntry[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Could not read from localStorage', err);
  }
  return INITIAL_ANIME_SONGS;
}

export function saveLocalEntries(entries: AnimeSongEntry[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(entries));
  } catch (err) {
    console.warn('Could not save to localStorage', err);
  }
}

export async function fetchEntries(): Promise<AnimeSongEntry[]> {
  try {
    const res = await fetch('/api/entries');
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json.data) && json.data.length > 0) {
        saveLocalEntries(json.data);
        return json.data;
      }
    }
  } catch (err) {
    console.warn('API /api/entries unreachable, using local storage fallback', err);
  }
  return getLocalEntries();
}

export async function createEntry(entry: Omit<AnimeSongEntry, 'id'>): Promise<AnimeSongEntry> {
  // Try server first
  try {
    const res = await fetch('/api/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.entry) {
        const current = getLocalEntries();
        const updated = [...current, data.entry];
        saveLocalEntries(updated);
        return data.entry;
      }
    }
  } catch (err) {
    console.warn('Server offline, saving locally', err);
  }

  // Local fallback
  const current = getLocalEntries();
  const maxId = current.length > 0 ? Math.max(...current.map((e) => e.id)) : 0;
  const newEntry: AnimeSongEntry = {
    ...entry,
    id: maxId + 1,
  };
  const updated = [...current, newEntry];
  saveLocalEntries(updated);
  return newEntry;
}

export async function updateEntry(id: number, entry: Partial<AnimeSongEntry>): Promise<AnimeSongEntry> {
  try {
    const res = await fetch(`/api/entries/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.entry) {
        const current = getLocalEntries();
        const idx = current.findIndex((e) => e.id === id);
        if (idx !== -1) {
          current[idx] = data.entry;
          saveLocalEntries(current);
        }
        return data.entry;
      }
    }
  } catch (err) {
    console.warn('Server offline, updating locally', err);
  }

  const current = getLocalEntries();
  const idx = current.findIndex((e) => e.id === id);
  if (idx !== -1) {
    current[idx] = { ...current[idx], ...entry };
    saveLocalEntries(current);
    return current[idx];
  }
  throw new Error('Entry not found');
}

export async function deleteEntry(id: number): Promise<void> {
  try {
    await fetch(`/api/entries/${id}`, { method: 'DELETE' });
  } catch (err) {
    console.warn('Server delete failed, continuing locally', err);
  }

  const current = getLocalEntries();
  const filtered = current.filter((e) => e.id !== id);
  saveLocalEntries(filtered);
}

export async function resetEntriesToDefault(): Promise<AnimeSongEntry[]> {
  try {
    const res = await fetch('/api/entries/reset', { method: 'POST' });
    if (res.ok) {
      const refreshed = await fetch('/api/entries').then((r) => r.json());
      if (refreshed.data) {
        saveLocalEntries(refreshed.data);
        return refreshed.data;
      }
    }
  } catch (err) {
    console.warn('Server reset failed, resetting local', err);
  }

  saveLocalEntries(INITIAL_ANIME_SONGS);
  return INITIAL_ANIME_SONGS;
}

export async function importEntries(entries: AnimeSongEntry[]): Promise<AnimeSongEntry[]> {
  try {
    const res = await fetch('/api/entries/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries }),
    });
    if (res.ok) {
      const refreshed = await fetch('/api/entries').then((r) => r.json());
      if (refreshed.data) {
        saveLocalEntries(refreshed.data);
        return refreshed.data;
      }
    }
  } catch (err) {
    console.warn('Server import failed, importing locally', err);
  }

  saveLocalEntries(entries);
  return entries;
}

// Search anime themes from AnimeThemes.moe + AniList
export async function searchAnime(query: string): Promise<AnimeSearchResult[]> {
  if (!query.trim()) return [];

  // Try server endpoint first
  try {
    const res = await fetch(`/api/anime/search?q=${encodeURIComponent(query)}`);
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json.results)) {
        return json.results;
      }
    }
  } catch (err) {
    console.warn('Server search proxy offline, trying direct client fallback', err);
  }

  // Client-side fallback to AniList GraphQL if server proxy is unavailable
  try {
    const queryDoc = `
      query ($search: String) {
        Page(page: 1, perPage: 5) {
          media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
            id
            title { romaji english }
            seasonYear
            startDate { year }
            coverImage { medium large }
          }
        }
      }
    `;
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: queryDoc, variables: { search: query } }),
    });
    const data = await res.json();
    const media = data?.data?.Page?.media || [];
    return media.map((m: any) => ({
      id: `al-${m.id}`,
      name: m.title?.english || m.title?.romaji,
      year: m.seasonYear || m.startDate?.year || 2020,
      coverImage: m.coverImage?.large || m.coverImage?.medium,
      themes: [],
    }));
  } catch (err) {
    console.error('All search fallbacks failed', err);
    return [];
  }
}

// Fetch Anime Cover & Details (AniList GraphQL proxy with direct client fallback)
export async function fetchAnimeCoverDetails(animeTitle: string, anilistId?: number | null) {
  if (isServerApiAvailable !== false) {
    try {
      const params = new URLSearchParams();
      if (animeTitle) params.set('title', animeTitle);
      if (anilistId) params.set('id', String(anilistId));

      const res = await fetch(`/api/anime/cover?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        isServerApiAvailable = true;
        return json.data;
      }
    } catch {
      // Server unreachable, proceed to client fallback
    }
  }

  // Client-side direct AniList GraphQL query (works 100% on static GitHub Pages)
  try {
    const query = `
      query ($search: String, $id: Int) {
        Media(search: $search, id: $id, type: ANIME) {
          id
          title { romaji english native }
          coverImage { large medium color }
          bannerImage
          format
          season
          seasonYear
          startDate { year }
          episodes
          genres
          averageScore
          studios(isMain: true) { nodes { name } }
        }
      }
    `;
    const variables: any = {};
    if (anilistId) variables.id = anilistId;
    else if (animeTitle) variables.search = animeTitle;

    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });

    if (res.ok) {
      const json = await res.json();
      const media = json?.data?.Media;
      if (media) {
        return {
          anime: animeTitle || media.title?.english || media.title?.romaji,
          romaji: media.title?.romaji || animeTitle,
          english: media.title?.english || null,
          native: media.title?.native || null,
          coverImage: media.coverImage?.large || media.coverImage?.medium || null,
          bannerImage: media.bannerImage || null,
          year: media.seasonYear || media.startDate?.year || null,
          season: media.season || null,
          format: media.format || null,
          genres: media.genres || [],
          score: media.averageScore || null,
          episodes: media.episodes || null,
          studio: media.studios?.nodes?.[0]?.name || null,
        };
      }
    }
  } catch (err) {
    console.warn('Client AniList fallback failed:', err);
  }

  return { anime: animeTitle };
}

// Query song catalog (Supports both Node server API and 100% static GitHub Pages)
export async function fetchAniSongDbSongs(params: {
  q?: string;
  yearMin?: number;
  yearMax?: number;
  themeType?: string;
  limit?: number;
  sortKey?: string;
  sortOrder?: string;
}) {
  if (isServerApiAvailable !== false) {
    const queryParams = new URLSearchParams();
    if (params.q) queryParams.set('q', params.q);
    if (params.yearMin !== undefined) queryParams.set('yearMin', String(params.yearMin));
    if (params.yearMax !== undefined) queryParams.set('yearMax', String(params.yearMax));
    if (params.themeType) queryParams.set('themeType', params.themeType);
    if (params.limit !== undefined) queryParams.set('limit', String(params.limit));
    if (params.sortKey) queryParams.set('sortKey', params.sortKey);
    if (params.sortOrder) queryParams.set('sortOrder', params.sortOrder);

    try {
      const res = await fetch(`/api/catalog/songs?${queryParams.toString()}`);
      if (res.ok) {
        isServerApiAvailable = true;
        return await res.json();
      } else {
        // If 404 (e.g. static GitHub Pages), permanently switch to client static mode
        isServerApiAvailable = false;
      }
    } catch {
      // Network error or server offline
      isServerApiAvailable = false;
    }
  }

  // Seamless static client-side catalog search
  return await searchStaticCatalog(params);
}

// Backward compatibility alias
export const fetchAnimeThemesSongs = fetchAniSongDbSongs;

