import type { AnimeSongItem, AnimeTitleMetadata } from '../types';
import { titlesFromAnisongDb } from './animeTitles';

export type TitleMapping = {
  status: 'matched' | 'unmatched' | 'ambiguous' | 'mismatched';
  annSongId: number | null;
  annId?: number;
  reasons: string[];
  metadata?: AnimeTitleMetadata;
};

/** Only the established catalog ID form is eligible; no AniList or fuzzy fallback. */
export function enrichmentSongId(id: unknown): number | null {
  const match = typeof id === 'string' ? /^song-([1-9]\d*)$/.exec(id) : null;
  const value = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(value) ? value : null;
}

export function matchTitleMetadata(song: AnimeSongItem, candidates: Record<string, unknown>[]): TitleMapping {
  const annSongId = enrichmentSongId(song.id);
  if (annSongId === null) return { status: 'mismatched', annSongId, reasons: ['Unsupported catalog song ID'] };
  const exact = candidates.filter((candidate) => candidate.annSongId === annSongId);
  if (exact.length === 0) return { status: 'unmatched', annSongId, reasons: ['No exact ANN song ID returned'] };
  if (exact.length !== 1) return { status: 'ambiguous', annSongId, reasons: [`${exact.length} candidates for this ANN song ID`] };
  const candidate = exact[0];
  const reasons: string[] = [];
  // Exact comparisons intentionally flag upstream corrections for human review.
  for (const [local, upstream] of [
    ['song_name', 'songName'], ['artist', 'songArtist'], ['theme_type', 'songType'], ['anime_vintage', 'animeVintage'],
  ] as const) {
    if (song[local] !== undefined && song[local] !== null && song[local] !== candidate[upstream]) {
      reasons.push(`${local} differs from ${upstream}`);
    }
  }
  const year = typeof candidate.animeVintage === 'string' ? candidate.animeVintage.match(/\b(\d{4})\b/) : null;
  if (song.anime_year && (!year || song.anime_year !== Number(year[1]))) reasons.push('Anime year differs');
  const linked = candidate.linked_ids as Record<string, unknown> | undefined;
  if (song.anilist_id != null && linked?.anilist != null && song.anilist_id !== linked.anilist) {
    reasons.push('Linked AniList ID differs (never used to choose a candidate)');
  }
  const metadata = titlesFromAnisongDb(candidate);
  if (!metadata.anime_name_english?.trim() || !metadata.anime_name_romaji?.trim()) reasons.push('Missing English or Japanese-display title');
  for (const key of ['anime_name_english', 'anime_name_romaji', 'anime_alt_names'] as const) {
    if (song[key] !== undefined && JSON.stringify(song[key]) !== JSON.stringify(metadata[key])) reasons.push(`Existing ${key} conflicts`);
  }
  const annId = typeof candidate.annId === 'number' ? candidate.annId : undefined;
  return reasons.length
    ? { status: 'mismatched', annSongId, annId, reasons }
    : { status: 'matched', annSongId, annId, reasons, metadata };
}
