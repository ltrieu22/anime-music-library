import type { SortKey, SortOrder } from '../types';

export const CATALOG_MIN_YEAR = 1924;
export const CATALOG_MAX_YEAR = 2026;
export interface CatalogUrlState {
  q: string;
  yearMin: number;
  yearMax: number;
  season: string;
  theme: string;
  artistIds: number[];
  sortKey: SortKey;
  sortOrder: SortOrder;
  /** Zero based internally; URLs use one based pages. */
  page: number;
}
export const DEFAULT_CATALOG_STATE: CatalogUrlState = {
  q: '', yearMin: CATALOG_MIN_YEAR, yearMax: CATALOG_MAX_YEAR,
  season: 'ALL', theme: 'ALL', artistIds: [], sortKey: 'anime_year', sortOrder: 'desc', page: 0,
};
const keys = ['q', 'yearMin', 'yearMax', 'season', 'theme', 'artists', 'sort', 'order', 'page'];
const sorts: SortKey[] = ['id', 'anime_name', 'anime_year', 'theme_type', 'artist', 'song_name'];
function integer(value: string | null, fallback: number, min: number, max: number) {
  if (!value || !/^\d+$/.test(value)) return fallback;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : fallback;
}

export function parseCatalogUrl(url: URL): CatalogUrlState {
  const p = url.searchParams;
  let yearMin = integer(p.get('yearMin'), CATALOG_MIN_YEAR, CATALOG_MIN_YEAR, CATALOG_MAX_YEAR);
  let yearMax = integer(p.get('yearMax'), CATALOG_MAX_YEAR, CATALOG_MIN_YEAR, CATALOG_MAX_YEAR);
  if (yearMin > yearMax) [yearMin, yearMax] = [yearMax, yearMin];
  const artistIds = [...new Set((p.get('artists') || '').split(',')
    .map(value => integer(value, 0, 1, Number.MAX_SAFE_INTEGER)).filter(Boolean))].sort((a, b) => a - b);
  return {
    q: artistIds.length ? '' : p.get('q') || '', yearMin, yearMax, artistIds,
    season: ['Winter', 'Spring', 'Summer', 'Fall', 'UNKNOWN'].includes(p.get('season') || '') ? p.get('season')! : 'ALL',
    theme: ['OP', 'ED', 'IN'].includes(p.get('theme') || '') ? p.get('theme')! : 'ALL',
    sortKey: sorts.includes(p.get('sort') as SortKey) ? p.get('sort') as SortKey : 'anime_year',
    sortOrder: p.get('order') === 'asc' ? 'asc' : 'desc',
    page: integer(p.get('page'), 1, 1, Math.floor(Number.MAX_SAFE_INTEGER / 100)) - 1,
  };
}

/** Only owns public search keys. In particular, preserve play, pathname and hash. */
export function serializeCatalogUrl(state: CatalogUrlState, base: URL): URL {
  const url = stripCatalogUrl(base);
  const values = [state.artistIds.length ? '' : state.q, state.yearMin, state.yearMax, state.season,
    state.theme, [...new Set(state.artistIds)].sort((a, b) => a - b).join(','), state.sortKey, state.sortOrder, state.page + 1];
  const defaults = ['', CATALOG_MIN_YEAR, CATALOG_MAX_YEAR, 'ALL', 'ALL', '', 'anime_year', 'desc', 1];
  values.forEach((value, index) => {
    if (value !== defaults[index]) url.searchParams.set(keys[index], String(value));
  });
  return url;
}

export function stripCatalogUrl(base: URL): URL {
  const url = new URL(base.href);
  for (const key of keys) url.searchParams.delete(key);
  return url;
}

export function catalogSearchShareUrl(state: CatalogUrlState, base: URL): string {
  const url = serializeCatalogUrl(state, base);
  url.searchParams.delete('play');
  return url.href;
}
