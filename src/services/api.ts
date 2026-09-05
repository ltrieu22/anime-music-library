import { AnimeSongEntry, AnimeSearchResult } from '../types';
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
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Could not read from localStorage', err);
  }
  return [];
}

export function saveLocalEntries(entries: AnimeSongEntry[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(entries));
  } catch (err) {
    console.warn('Could not save to localStorage', err);
  }
}

export function clearLocalEntries(): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify([]));
  } catch (err) {
    console.warn('Could not clear localStorage', err);
  }
}

export async function fetchEntries(): Promise<AnimeSongEntry[]> {
  return getLocalEntries();
}

export async function createEntry(entry: Omit<AnimeSongEntry, 'id'>): Promise<AnimeSongEntry> {
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
  const current = getLocalEntries();
  const filtered = current.filter((e) => e.id !== id);
  // Let the removal dialog report a failed write instead of hiding a song that
  // would reappear on reload. Leave the UI unchanged until storage succeeds.
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered));
}

export async function resetEntriesToDefault(): Promise<AnimeSongEntry[]> {
  saveLocalEntries([]);
  return [];
}

export async function importEntries(entries: AnimeSongEntry[]): Promise<AnimeSongEntry[]> {
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

// Fetch Anime Cover & Details (Server API + AniList GraphQL + Kitsu fallback)
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
        if (json.data?.coverImage) {
          return json.data;
        }
      }
    } catch {
      // Server unreachable, proceed to client fallback
    }
  }

  // Client-side direct AniList GraphQL query (works on static GitHub Pages)
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
      if (media && (media.coverImage?.large || media.coverImage?.medium)) {
        return {
          id: media.id || anilistId || null,
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

  // Direct fast Kitsu client fallback (CORS friendly, works everywhere)
  if (animeTitle) {
    try {
      const kitsuUrl = `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(animeTitle)}&page[limit]=1`;
      const kRes = await fetch(kitsuUrl, { headers: { Accept: 'application/vnd.api+json' } });
      if (kRes.ok) {
        const kJson = await kRes.json();
        const item = kJson.data?.[0]?.attributes;
        if (item) {
          return {
            id: anilistId || null,
            anime: item.canonicalTitle || animeTitle,
            romaji: item.titles?.ja_jp || item.canonicalTitle || animeTitle,
            english: item.titles?.en || item.titles?.en_jp || null,
            coverImage: item.posterImage?.small || item.posterImage?.medium || item.posterImage?.original || null,
            year: item.startDate ? parseInt(item.startDate.slice(0, 4)) : null,
            score: item.averageRating ? Math.round(parseFloat(item.averageRating)) : null,
          };
        }
      }
    } catch (kErr) {
      console.warn('Client Kitsu fallback failed:', kErr);
    }
  }

  return { anime: animeTitle, id: anilistId || null };
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
