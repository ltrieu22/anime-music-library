import { AnimeSongItem } from '../types';
import { compileCatalogResults, paginateCatalogResults, type CatalogParams } from './catalogResults';

let cachedCatalog: AnimeSongItem[] | null = null;
let cachedAliases: Record<string, string[]> | null = null;
let loadPromise: Promise<[AnimeSongItem[], Record<string, string[]>]> | null = null;
const searchCache = new Map<string, AnimeSongItem[]>();

/**
 * Get base URL for static assets (handles GitHub Pages repo subpath)
 */
function getBaseUrl(): string {
  const metaEnv = (import.meta as any).env;
  const base = metaEnv?.BASE_URL || './';
  return base.endsWith('/') ? base : `${base}/`;
}

/**
 * Load catalog and artist aliases from static public files
 */
export async function loadStaticCatalog(): Promise<[AnimeSongItem[], Record<string, string[]>]> {
  if (cachedCatalog && cachedAliases) {
    return [cachedCatalog, cachedAliases];
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    const base = getBaseUrl();
    try {
      const [catalogRes, aliasesRes] = await Promise.all([
        fetch(`${base}data/anime_catalog.json`),
        fetch(`${base}data/artist_aliases.json`),
      ]);

      if (!catalogRes.ok) {
        throw new Error(`Failed to load anime_catalog.json: ${catalogRes.statusText}`);
      }

      const catalogData = await catalogRes.json();
      const aliasesData = aliasesRes.ok ? await aliasesRes.json() : {};

      cachedCatalog = catalogData;
      cachedAliases = aliasesData;
      return [catalogData, aliasesData];
    } catch (err) {
      console.warn('Error loading static catalog:', err);
      // Fallback to empty if failed
      cachedCatalog = cachedCatalog || [];
      cachedAliases = cachedAliases || {};
      return [cachedCatalog, cachedAliases];
    } finally {
      loadPromise = null;
    }
  })();

  return loadPromise;
}

/**
 * Perform client-side filter and sort on the catalog
 */
export async function searchStaticCatalog(params: CatalogParams, additionalMatches: AnimeSongItem[] = []) {
  const [catalog, aliases] = await loadStaticCatalog();
  if (additionalMatches.length) {
    return paginateCatalogResults(compileCatalogResults(catalog, aliases, params, additionalMatches), params);
  }
  const { offset: _offset, limit: _limit, ...query } = params;
  const key = JSON.stringify(query);
  let ordered = searchCache.get(key);
  if (!ordered) {
    ordered = compileCatalogResults(catalog, aliases, params);
    searchCache.set(key, ordered);
    if (searchCache.size > 8) searchCache.delete(searchCache.keys().next().value!);
  } else {
    // Refresh recency so repeated pagination retains this query in the small cache.
    searchCache.delete(key);
    searchCache.set(key, ordered);
  }
  return paginateCatalogResults(ordered, params);
}
