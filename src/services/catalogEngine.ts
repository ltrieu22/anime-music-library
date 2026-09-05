import { AnimeSongItem } from '../types';
import { createCatalogQueryMatcher } from './catalogSearch';

interface CatalogParams {
  q?: string;
  yearMin?: number;
  yearMax?: number;
  themeType?: string;
  limit?: number;
  sortKey?: string;
  sortOrder?: string;
}

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
export async function searchStaticCatalog(params: CatalogParams): Promise<{
  data: AnimeSongItem[];
  total: number;
  hasMore: boolean;
}> {
  const [catalog, aliases] = await loadStaticCatalog();

  const q = String(params.q || '').trim().toLowerCase();
  const yearMin = params.yearMin !== undefined ? Number(params.yearMin) : null;
  const yearMax = params.yearMax !== undefined ? Number(params.yearMax) : null;
  const themeType = String(params.themeType || 'all').toUpperCase();
  const sortKey = String(params.sortKey || 'anime_year');
  const sortOrder = String(params.sortOrder || 'desc').toLowerCase();
  const limit = Math.min(500, Math.max(10, Number(params.limit) || (q ? 250 : 80)));

  let filtered = catalog;

  // Filter by query and related artist aliases
  if (q) {
    filtered = filtered.filter(createCatalogQueryMatcher(q, aliases));
  }

  // Filter by year range
  if (yearMin !== null || yearMax !== null) {
    filtered = filtered.filter((item) => {
      const y = Number(item.anime_year);
      if (!y) return true;
      if (yearMin !== null && y < yearMin) return false;
      if (yearMax !== null && y > yearMax) return false;
      return true;
    });
  }

  // Filter by theme type
  if (themeType && themeType !== 'ALL') {
    filtered = filtered.filter((item) => {
      const t = (item.theme_type || '').toUpperCase();
      if (themeType === 'OP') return t.startsWith('OP') || t.includes('OPENING');
      if (themeType === 'ED') return t.startsWith('ED') || t.includes('ENDING');
      if (themeType === 'IN') return t.startsWith('IN') || t.includes('INSERT');
      return true;
    });
  }

  // Sort
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const sorted = [...filtered].sort((a, b) => {
    const valA = (a as any)[sortKey];
    const valB = (b as any)[sortKey];

    if (valA === undefined && valB === undefined) return 0;
    if (valA === undefined) return 1;
    if (valB === undefined) return -1;

    let comp = 0;
    if (typeof valA === 'number' && typeof valB === 'number') {
      comp = valA - valB;
    } else {
      comp = collator.compare(String(valA), String(valB));
    }

    if (comp === 0) {
      comp = collator.compare(String(a.anime_name || ''), String(b.anime_name || ''));
    }

    return sortOrder === 'desc' ? -comp : comp;
  });

  const total = sorted.length;
  const paged = sorted.slice(0, limit);

  return {
    data: paged,
    total,
    hasMore: total > limit,
  };
}
