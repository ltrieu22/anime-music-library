import { AnimeSongItem } from '../types';
import { type CatalogParams } from './catalogResults';
import { createCatalogLoader } from './catalogLoader';
import { createCatalogSearchSession } from './catalogSearchSession';
import { createCatalogWorkerClient } from './catalogWorkerClient';

const loader = createCatalogLoader(getBaseUrl);
export const subscribeStaticCatalog = loader.subscribe;
const workerSearch = createCatalogWorkerClient(() => new Worker(new URL('./catalog.worker.ts', import.meta.url), { type: 'module' }));
let fallbackSearch: ReturnType<typeof createCatalogSearchSession>;

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
  return loader.load();
}

/**
 * Perform client-side filter and sort on the catalog
 */
export async function searchStaticCatalog(params: CatalogParams, additionalMatches: AnimeSongItem[] = [], signal?: AbortSignal) {
  const [catalog, aliases] = await loadStaticCatalog();
  if (signal?.aborted) throw new DOMException('Search canceled', 'AbortError');
  if (typeof Worker !== 'undefined') return workerSearch(catalog, aliases, params, additionalMatches, signal);
  fallbackSearch ??= createCatalogSearchSession(catalog, aliases);
  return fallbackSearch(params, additionalMatches);
}
