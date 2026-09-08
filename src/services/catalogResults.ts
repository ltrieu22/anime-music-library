import { ANIME_SEASONS, getAnimeSeason, normalizeAnimeSeason } from './animeSeason';
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

/** Shared filtering and ordering for static, server, and canonical-artist results. */
export function compileCatalogResults(
  catalog: AnimeSongItem[],
  aliases: Record<string, string[]>,
  params: CatalogParams,
  additionalMatches: AnimeSongItem[] = [],
): AnimeSongItem[] {
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
  const seasonFilter = String(params.season || 'ALL').toUpperCase();
  const requestedSeason = normalizeAnimeSeason(params.season);
  const filtered = [...merged.values()].map(song => ({ song, period: getAnimeSeason(song) })).filter(({ song, period }) => {
    if (seasonFilter !== 'ALL') {
      if (seasonFilter === 'UNKNOWN'
        ? Boolean(period.season)
        : !requestedSeason || period.season !== requestedSeason) return false;
    }
    if (period.year && params.yearMin !== undefined && period.year < params.yearMin) return false;
    if (period.year && params.yearMax !== undefined && period.year > params.yearMax) return false;
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
    const left = a.song[key as keyof AnimeSongItem];
    const right = b.song[key as keyof AnimeSongItem];
    let comparison = 0;
    if (key === 'anime_year') {
      if (a.period.year !== b.period.year) {
        if (!a.period.year || !b.period.year) comparison = a.period.year ? -1 : 1;
        else comparison = (a.period.year - b.period.year) * direction;
      } else if (!a.period.season || !b.period.season) {
        comparison = a.period.season ? -1 : b.period.season ? 1 : 0;
      } else {
        comparison = (ANIME_SEASONS.indexOf(a.period.season) - ANIME_SEASONS.indexOf(b.period.season)) * direction;
      }
      if (comparison) return comparison;
    } else if (left == null || right == null) {
      comparison = left == null ? (right == null ? 0 : 1) : -1;
      if (comparison) return comparison;
    } else {
      comparison = typeof left === 'number' && typeof right === 'number'
        ? left - right : collator.compare(String(left), String(right));
    }
    if (comparison) return comparison * direction;
    comparison = collator.compare(a.song.anime_name, b.song.anime_name);
    if (comparison) return comparison;
    // Raw ID fallback also distinguishes IDs the case/accent-insensitive collator equates.
    return collator.compare(String(a.song.id), String(b.song.id)) ||
      (String(a.song.id) < String(b.song.id) ? -1 : String(a.song.id) > String(b.song.id) ? 1 : 0);
  });
  return filtered.map(({ song }) => song);
}

export function paginateCatalogResults(filtered: AnimeSongItem[], params: CatalogParams) {
  const requestedLimit = Number(params.limit);
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? Math.min(500, Math.max(1, Math.floor(requestedLimit))) : 100;
  const requestedOffset = Number(params.offset);
  const start = Number.isFinite(requestedOffset) ? Math.max(0, Math.floor(requestedOffset)) : 0;
  const total = filtered.length;
  const offset = total === 0 ? 0 : start >= total ? Math.floor((total - 1) / limit) * limit : start;
  return { data: filtered.slice(offset, offset + limit), total, offset, limit, hasMore: offset + limit < total };
}

/** Shared ordering and pagination for static, server, and canonical-artist results. */
export function searchCatalogResults(
  catalog: AnimeSongItem[],
  aliases: Record<string, string[]>,
  params: CatalogParams,
  additionalMatches: AnimeSongItem[] = [],
) {
  return paginateCatalogResults(compileCatalogResults(catalog, aliases, params, additionalMatches), params);
}
