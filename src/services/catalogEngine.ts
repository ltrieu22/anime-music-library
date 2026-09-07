import { AnimeSongItem } from '../types';
import { searchCatalogResults, type CatalogParams } from './catalogResults';

let cachedCatalog: AnimeSongItem[] | null = null;
let cachedAliases: Record<string, string[]> | null = null;
let loadPromise: Promise<[AnimeSongItem[], Record<string, string[]>]> | null = null;

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
  return searchCatalogResults(catalog, aliases, params, additionalMatches);
}
