import type { AnimeSongItem } from '../types';
import { unpackCatalog } from './catalogPayload';

type Catalog = [AnimeSongItem[], Record<string, string[]>];

export function createCatalogLoader(baseUrl: () => string) {
  let cached: Catalog | null = null;
  let pending: Promise<Catalog> | null = null;
  const listeners = new Set<(catalog: Catalog) => void>();
  return {
    subscribe(listener: (catalog: Catalog) => void) {
      listeners.add(listener);
      if (cached) listener(cached);
      return () => { listeners.delete(listener); };
    },
    load(): Promise<Catalog> {
      if (cached) return Promise.resolve(cached);
      if (pending) return pending;
      pending = (async () => {
        const base = baseUrl();
        const getJson = async (file: string) => {
          const response = await fetch(`${base}data/${file}`, { cache: 'no-cache' });
          if (!response.ok) throw new Error(`Could not load the catalog (${response.status}). Please retry.`);
          return response.json();
        };
        const [payload, aliases] = await Promise.all([
          getJson('catalog.compact.json'), getJson('artist_aliases.json'),
        ]);
        const songs = unpackCatalog(payload);
        if (!aliases || typeof aliases !== 'object' || Array.isArray(aliases)
          || !Object.values(aliases).every(value => Array.isArray(value) && value.every(name => typeof name === 'string'))) {
          throw new Error('The artist aliases are invalid. Please retry.');
        }
        // Commit both resources together. A failed attempt never becomes an empty cache.
        cached = [songs, aliases];
        for (const listener of listeners) listener(cached);
        return cached;
      })().finally(() => { pending = null; });
      return pending;
    },
  };
}
