import type { AnimeSeasonMetadata } from '../types';

export const ANIME_SEASONS = ['Winter', 'Spring', 'Summer', 'Fall'] as const;
export type AnimeSeason = typeof ANIME_SEASONS[number];
type SeasonSource = AnimeSeasonMetadata & { anime_year?: number };

export function normalizeAnimeSeason(value: unknown): AnimeSeason | undefined {
  return typeof value === 'string'
    ? ANIME_SEASONS.find((season) => season.toLowerCase() === value.trim().toLowerCase())
    : undefined;
}

/** Catalog anime season, never an inferred song release date. */
export function getAnimeSeason(song: SeasonSource) {
  const vintage = typeof song.anime_vintage === 'string' ? song.anime_vintage.trim() : '';
  const match = /^(Winter|Spring|Summer|Fall)\s+(\d{4})$/i.exec(vintage);
  const season = normalizeAnimeSeason(match?.[1]) ?? normalizeAnimeSeason(song.anime_season);
  const year = match ? Number(match[2]) : /^\d{4}$/.test(vintage) ? Number(vintage) : Number(song.anime_year);
  return { season, year: Number.isInteger(year) && year > 0 ? year : undefined };
}

export function animeSeasonLabel(song: SeasonSource): string {
  const { season, year } = getAnimeSeason(song);
  return `${season ?? 'Unknown'}${year ? ` ${year}` : ''}`;
}

export function matchesAnimeSeason(song: SeasonSource, filter?: string): boolean {
  if (!filter || filter.toUpperCase() === 'ALL') return true;
  const { season } = getAnimeSeason(song);
  const normalized = normalizeAnimeSeason(filter);
  return filter.toUpperCase() === 'UNKNOWN' ? !season : Boolean(normalized && season === normalized);
}

/** Unknown years/seasons stay last in either direction. */
export function compareAnimeSeason(a: SeasonSource, b: SeasonSource, direction: number): number {
  const left = getAnimeSeason(a), right = getAnimeSeason(b);
  if (left.year !== right.year) {
    if (!left.year || !right.year) return left.year ? -1 : 1;
    return (left.year - right.year) * direction;
  }
  if (!left.season || !right.season) return left.season ? -1 : right.season ? 1 : 0;
  return (ANIME_SEASONS.indexOf(left.season) - ANIME_SEASONS.indexOf(right.season)) * direction;
}

export function copyAnimeSeasonMetadata(value: unknown): AnimeSeasonMetadata {
  if (!value || typeof value !== 'object') return {};
  const source = value as Record<string, unknown>;
  const result: AnimeSeasonMetadata = {};
  if (typeof source.anime_vintage === 'string') result.anime_vintage = source.anime_vintage;
  else if (source.anime_vintage === null) result.anime_vintage = null;
  const season = normalizeAnimeSeason(source.anime_season);
  if (season) result.anime_season = season;
  return result;
}

export function resolveAnimeSeason<T extends SeasonSource & { id?: string | number; source_song_id?: string | number }>(
  song: T, catalog: ReadonlyMap<string, SeasonSource>,
): T {
  const metadata = catalog.get(String(song.source_song_id ?? song.id));
  if (!metadata || getAnimeSeason(song).season) return song;
  return { ...song, ...copyAnimeSeasonMetadata(metadata) };
}
