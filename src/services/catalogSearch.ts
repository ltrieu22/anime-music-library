import type { AnimeSongItem } from '../types';
import { getSearchableAnimeTitles } from './animeTitles';

type SearchableSong = Pick<AnimeSongItem, 'anime_name' | 'anime_name_english' | 'anime_name_romaji' | 'anime_alt_names' | 'artist' | 'song_name'>;

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function artistPhrasePattern(phrase: string): RegExp {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Unicode boundaries also prevent short aliases matching inside non-Latin names.
  return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'u');
}

/** Shared typed-search matching for the static catalog and optional server. */
export function createCatalogQueryMatcher(query: string, aliases: Record<string, string[]>) {
  const q = normalize(query);
  const queryTerms = q.split(' ').filter(Boolean);
  const expansions: { artists: RegExp[]; remainingTerms: string[] }[] = [];

  for (const [key, relatedArtists] of Object.entries(aliases)) {
    const phrase = normalize(key);
    if (!phrase) continue;
    const match = artistPhrasePattern(phrase).exec(q);
    if (!match) continue;

    // Expand a complete artist phrase, while still requiring the rest of the query.
    const remainder = `${q.slice(0, match.index)} ${q.slice(match.index + match[0].length)}`;
    expansions.push({
      artists: relatedArtists.map(normalize).filter(Boolean).map(artistPhrasePattern),
      remainingTerms: remainder.split(/\s+/).filter(Boolean),
    });
  }

  return (item: SearchableSong): boolean => {
    const artist = normalize(item.artist || '');
    const combined = `${getSearchableAnimeTitles(item).map(normalize).join(' ')} ${artist} ${normalize(item.song_name || '')}`;
    // Ordinary anime/song/artist searches keep their existing partial-word behavior.
    if (queryTerms.every((term) => combined.includes(term))) return true;

    return expansions.some(({ artists, remainingTerms }) =>
      artists.some((pattern) => pattern.test(artist)) &&
      remainingTerms.every((term) => combined.includes(term))
    );
  };
}
