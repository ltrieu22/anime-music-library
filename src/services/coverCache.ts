const STORAGE_KEY = 'anime_cover_urls_v1';
const MAX_AGE = 30 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 500;
type Cover = { url: string; savedAt: number };
const covers = new Map<string, Cover>();
let loaded = false;

function key(title: string, id?: number | null) {
  return id ? `id:${id}` : `title:${title.trim().toLowerCase()}`;
}

function load() {
  if (loaded) return;
  loaded = true;
  try {
    const entries: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(entries)) return;
    for (const entry of entries.slice(-MAX_ENTRIES)) {
      if (!Array.isArray(entry)) continue;
      const [cacheKey, cover] = entry;
      if (typeof cacheKey === 'string' && typeof cover?.url === 'string' &&
          /^https?:\/\//.test(cover.url) && typeof cover.savedAt === 'number' &&
          Date.now() - cover.savedAt < MAX_AGE) covers.set(cacheKey, cover);
    }
  } catch { /* Storage can be unavailable or corrupted. */ }
}

export function getCachedCover(title: string, id?: number | null): string | null {
  load();
  const cover = covers.get(key(title, id));
  return cover && Date.now() - cover.savedAt < MAX_AGE ? cover.url : null;
}

export function rememberCover(title: string, id: number | null | undefined, url: string) {
  load();
  const cacheKey = key(title, id);
  covers.delete(cacheKey);
  covers.set(cacheKey, { url, savedAt: Date.now() });
  while (covers.size > MAX_ENTRIES) covers.delete(covers.keys().next().value!);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...covers])); } catch { /* Keep memory cache. */ }
}
