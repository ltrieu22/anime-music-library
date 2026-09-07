import { compareAnimeSeason, getAnimeSeason, matchesAnimeSeason } from './animeSeason';
import type { AnimeSongItem } from '../types';
import { createCatalogQueryMatcher } from './catalogSearch';

export interface CatalogParams {
  q?: string;
  yearMin?: number;
  yearMax?: number;
  themeType?: string;
  season?: string;
  limit?: number;
  offset?: number;
  sortKey?: string;
  sortOrder?: string;
}

/** Shared ordering and pagination for static, server, and canonical-artist results. */
export function searchCatalogResults(
  catalog: AnimeSongItem[],
  aliases: Record<string, string[]>,
  params: CatalogParams,
  additionalMatches: AnimeSongItem[] = [],
) {
  const matchesQuery = createCatalogQueryMatcher(params.q || '', aliases);
  const extraIds = new Set(additionalMatches.map((song) => String(song.id)));
  const merged = new Map<string, AnimeSongItem>();
  for (const song of catalog) {
    if (extraIds.has(String(song.id)) || matchesQuery(song)) merged.set(String(song.id), song);
  }
  // Canonical metadata wins; retain note snapshots for songs absent from the catalog.
  for (const song of additionalMatches) {
    if (!merged.has(String(song.id))) merged.set(String(song.id), song);
  }
  const theme = String(params.themeType || 'ALL').toUpperCase();
  const filtered = [...merged.values()].filter((song) => {
    const year = getAnimeSeason(song).year;
    if (!matchesAnimeSeason(song, params.season)) return false;
    if (year && params.yearMin !== undefined && year < params.yearMin) return false;
    if (year && params.yearMax !== undefined && year > params.yearMax) return false;
    const kind = String(song.theme_type || '').toUpperCase();
    if (theme === 'OP') return kind.startsWith('OP') || kind.includes('OPENING');
    if (theme === 'ED') return kind.startsWith('ED') || kind.includes('ENDING');
    if (theme === 'IN') return kind.startsWith('IN') || kind.includes('INSERT');
    return true;
  });
  const key = params.sortKey || 'anime_year';
  const direction = params.sortOrder === 'asc' ? 1 : -1;
  const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
  filtered.sort((a, b) => {
    const left = a[key as keyof AnimeSongItem];
    const right = b[key as keyof AnimeSongItem];
    let comparison = 0;
    if (key === 'anime_year') {
      comparison = compareAnimeSeason(a, b, direction);
      if (comparison) return comparison;
    } else if (left == null || right == null) {
      comparison = left == null ? (right == null ? 0 : 1) : -1;
      if (comparison) return comparison;
    } else {
      comparison = typeof left === 'number' && typeof right === 'number'
        ? left - right : collator.compare(String(left), String(right));
    }
    if (comparison) return comparison * direction;
    comparison = collator.compare(a.anime_name, b.anime_name);
    if (comparison) return comparison;
    // Raw ID fallback also distinguishes IDs the case/accent-insensitive collator equates.
    return collator.compare(String(a.id), String(b.id)) ||
      (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);
  });
  const requestedLimit = Number(params.limit);
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? Math.min(500, Math.max(1, Math.floor(requestedLimit))) : 100;
  const requestedOffset = Number(params.offset);
  const start = Number.isFinite(requestedOffset) ? Math.max(0, Math.floor(requestedOffset)) : 0;
  const total = filtered.length;
  const offset = total === 0 ? 0 : start >= total ? Math.floor((total - 1) / limit) * limit : start;
  return { data: filtered.slice(offset, offset + limit), total, offset, limit, hasMore: offset + limit < total };
}
