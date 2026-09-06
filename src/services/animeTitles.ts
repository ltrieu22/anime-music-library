import type { AnimeTitleMetadata } from '../types';

export type TitleSource = AnimeTitleMetadata & { anime_name?: string; id?: string | number; source_song_id?: string | number };
export type TitleLanguage = 'en' | 'jp';
export const TITLE_LANGUAGE_STORAGE_KEY = 'anime-db:title-language';

export function readTitleLanguage(): TitleLanguage {
  try { return globalThis.localStorage?.getItem(TITLE_LANGUAGE_STORAGE_KEY) === 'jp' ? 'jp' : 'en'; }
  catch { return 'en'; }
}

/** Resolve old saved copies by exact catalog ID, without rewriting their identity. */
export function resolveAnimeTitles(song: TitleSource, catalog: ReadonlyMap<string, AnimeTitleMetadata>): TitleSource {
  const metadata = catalog.get(String(song.source_song_id ?? song.id));
  if (!metadata) return song;
  return {
    ...song,
    anime_name_english: song.anime_name_english?.trim() ? song.anime_name_english : metadata.anime_name_english,
    anime_name_romaji: song.anime_name_romaji?.trim() ? song.anime_name_romaji : metadata.anime_name_romaji,
    anime_alt_names: [...(song.anime_alt_names ?? []), ...(metadata.anime_alt_names ?? [])],
  };
}

/** Preserve valid optional metadata verbatim; normalization belongs to matching only. */
export function copyAnimeTitleMetadata(value: unknown): AnimeTitleMetadata {
  if (!value || typeof value !== 'object') return {};
  const source = value as Record<string, unknown>;
  const result: AnimeTitleMetadata = {};
  for (const key of ['anime_name_english', 'anime_name_romaji'] as const) {
    if (typeof source[key] === 'string') result[key] = source[key];
  }
  if (Array.isArray(source.anime_alt_names)) {
    result.anime_alt_names = source.anime_alt_names.filter((name): name is string => typeof name === 'string');
  }
  return result;
}

/** AniSongDB supplies the Japanese-display name; never generate a romanization. */
export function titlesFromAnisongDb(value: Record<string, unknown>): AnimeTitleMetadata {
  return copyAnimeTitleMetadata({
    anime_name_english: value.animeENName,
    anime_name_romaji: value.animeJPName,
    anime_alt_names: value.animeAltName,
  });
}

export function getAnimeDisplayTitle(song: TitleSource, language: TitleLanguage = 'jp'): string {
  const preferred = language === 'en'
    ? [song.anime_name_english, song.anime_name_romaji]
    : [song.anime_name_romaji, song.anime_name_english];
  return [...preferred, song.anime_name]
    .find((title) => typeof title === 'string' && title.trim().length > 0) ?? 'Unknown Anime';
}

/** Matching variants, preserving the first spelling and leaving the record untouched. */
export function getSearchableAnimeTitles(song: TitleSource): string[] {
  const seen = new Set<string>();
  return [song.anime_name, song.anime_name_english, song.anime_name_romaji, ...(song.anime_alt_names ?? [])]
    .filter((title): title is string => {
      if (typeof title !== 'string') return false;
      const key = title.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
