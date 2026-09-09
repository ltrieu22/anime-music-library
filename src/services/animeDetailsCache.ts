import type { AnimeDetails } from '../types';

const STORAGE_KEY = 'anime_details_v1';
export const DETAILS_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 500;
type Entry = { details: AnimeDetails; savedAt: number };

export function animeDetailsKey(title: string, id?: number | null) {
  return id ? `id:${id}` : `title:${title.trim().toLowerCase()}`;
}

function validDetails(value: any): value is AnimeDetails {
  return value && typeof value.anime === 'string' && typeof value.coverImage === 'string' &&
    /^https?:\/\//.test(value.coverImage) &&
    ['romaji', 'english', 'native', 'bannerImage', 'season', 'format', 'studio'].every(key => value[key] == null || typeof value[key] === 'string') &&
    ['id', 'year', 'score', 'episodes'].every(key => value[key] == null || Number.isFinite(value[key])) &&
    (value.genres == null || (Array.isArray(value.genres) && value.genres.every((genre: unknown) => typeof genre === 'string')));
}

export function createAnimeDetailsCache(storage: () => Pick<Storage, 'getItem' | 'setItem'>, now = Date.now) {
  const entries = new Map<string, Entry>();
  let loaded = false;
  function load() {
    if (loaded) return;
    loaded = true;
    try {
      const saved: unknown = JSON.parse(storage().getItem(STORAGE_KEY) || '[]');
      if (!Array.isArray(saved)) return;
      for (const row of saved.slice(-MAX_ENTRIES)) {
        if (!Array.isArray(row)) continue;
        const [key, entry] = row;
        if (typeof key === 'string' && validDetails(entry?.details) && Number.isFinite(entry.savedAt) &&
            entry.savedAt <= now() && now() - entry.savedAt < DETAILS_MAX_AGE) entries.set(key, entry);
      }
    } catch { /* Corrupt/unavailable storage must not break artwork. */ }
  }
  return {
    get(key: string): AnimeDetails | null {
      load();
      const entry = entries.get(key);
      if (!entry || now() - entry.savedAt >= DETAILS_MAX_AGE) {
        entries.delete(key);
        return null;
      }
      return entry.details;
    },
    set(key: string, details: AnimeDetails) {
      load();
      // Never persist provider failures or empty placeholder results.
      if (!validDetails(details)) return;
      entries.delete(key);
      entries.set(key, { details, savedAt: now() });
      while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!);
      try { storage().setItem(STORAGE_KEY, JSON.stringify([...entries])); } catch { /* Keep memory cache. */ }
    },
  };
}

export const animeDetailsCache = createAnimeDetailsCache(() => localStorage);
