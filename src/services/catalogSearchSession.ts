import type { AnimeSongItem } from '../types';
import { compileCatalogResults, paginateCatalogResults, type CatalogParams } from './catalogResults';

/** One bounded query cache per catalog, shared by the worker and non-browser fallback. */
export function createCatalogSearchSession(catalog: AnimeSongItem[], aliases: Record<string, string[]>) {
  const cache = new Map<string, AnimeSongItem[]>();
  return (params: CatalogParams, additionalMatches: AnimeSongItem[] = []) => {
    // Private matches may change independently of the public query. Never cache them.
    if (additionalMatches.length) {
      return paginateCatalogResults(compileCatalogResults(catalog, aliases, params, additionalMatches), params);
    }
    const { offset: _offset, limit: _limit, ...query } = params;
    const key = JSON.stringify(query);
    let ordered = cache.get(key);
    if (!ordered) ordered = compileCatalogResults(catalog, aliases, params);
    cache.delete(key);
    cache.set(key, ordered);
    if (cache.size > 8) cache.delete(cache.keys().next().value!);
    return paginateCatalogResults(ordered, params);
  };
}
