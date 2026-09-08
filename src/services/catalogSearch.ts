import type { AnimeSongItem } from '../types';
import { getSearchableAnimeTitles } from './animeTitles';
import { getSearchTerms, normalizeSearchText } from './searchText';

type SearchableSong = Pick<AnimeSongItem, 'anime_name' | 'anime_name_english' | 'anime_name_romaji' | 'anime_alt_names' | 'artist' | 'song_name'>;
const normalizedSongs = new WeakMap<object, { artist: string; combined: string }>();

function normalize(value: string): string {
  return normalizeSearchText(value);
}

function artistPhrasePattern(phrase: string): RegExp {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Unicode boundaries also prevent short aliases matching inside non-Latin names.
  return new RegExp(`(?<![\\p{L}\\p{N}\\p{M}_])${escaped}(?![\\p{L}\\p{N}\\p{M}_])`, 'u');
}

/** Shared typed-search matching for the static catalog and optional server. */
export function createCatalogQueryMatcher(query: string, aliases: Record<string, string[]>) {
  const q = normalize(query);
  const queryTerms = getSearchTerms(q);
  if (queryTerms.length === 0) return () => true;
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
    let normalized = normalizedSongs.get(item);
    if (!normalized) {
      const artist = normalize(item.artist || '');
      normalized = {
        artist,
        combined: `${getSearchableAnimeTitles(item).map(normalize).join(' ')} ${artist} ${normalize(item.song_name || '')}`,
      };
      normalizedSongs.set(item, normalized);
    }
    const { artist, combined } = normalized;
    // Ordinary anime/song/artist searches keep their existing partial-word behavior.
    if (queryTerms.every((term) => combined.includes(term))) return true;

    return expansions.some(({ artists, remainingTerms }) =>
      artists.some((pattern) => pattern.test(artist)) &&
      remainingTerms.every((term) => combined.includes(term))
    );
  };
}
