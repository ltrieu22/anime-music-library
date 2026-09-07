const COMBINING_MARK = /^\p{M}$/u;
const LATIN_CHARACTER = /\p{Script=Latin}/u;
const ASCII_ONLY = /^[\x00-\x7F]*$/;

interface SourceSpan {
  start: number;
  end: number;
}

interface FoldedText {
  text: string;
  spans: SourceSpan[];
}

export interface SearchMatchRange {
  start: number;
  end: number;
}

/**
 * Fold case and Latin diacritics for search without erasing meaningful marks
 * from other scripts. Clustering base characters with their combining marks
 * also makes precomposed and decomposed input equivalent.
 */
function foldText(value: string): FoldedText {
  const clusters: Array<{ text: string; start: number; end: number }> = [];
  let offset = 0;

  for (const character of value) {
    const start = offset;
    offset += character.length;

    if (COMBINING_MARK.test(character) && clusters.length > 0) {
      const cluster = clusters[clusters.length - 1];
      cluster.text += character;
      cluster.end = offset;
    } else {
      clusters.push({ text: character, start, end: offset });
    }
  }

  let text = '';
  const spans: SourceSpan[] = [];

  for (const cluster of clusters) {
    const decomposed = cluster.text.normalize('NFD');
    const base = Array.from(decomposed).find((character) => !COMBINING_MARK.test(character));
    const foldedCluster = (base && LATIN_CHARACTER.test(base)
      ? Array.from(decomposed).filter((character) => !COMBINING_MARK.test(character)).join('')
      : cluster.text.normalize('NFC')
    ).toLowerCase();

    text += foldedCluster;
    for (let index = 0; index < foldedCluster.length; index += 1) {
      spans.push({ start: cluster.start, end: cluster.end });
    }
  }

  return { text, spans };
}

/** Search-only normalization. Original display and persisted strings stay intact. */
export function normalizeSearchText(value: string): string {
  if (ASCII_ONLY.test(value)) {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
  }
  return foldText(value).text.trim().replace(/\s+/g, ' ');
}

export function getSearchTerms(query: string): string[] {
  return normalizeSearchText(query).split(/\s+/).filter(Boolean);
}

export function matchesSearchText(values: Array<unknown>, query: string): boolean {
  const terms = getSearchTerms(query);
  if (terms.length === 0) return true;

  const searchableText = values
    .map((value) => normalizeSearchText(String(value ?? '')))
    .join(' ');
  return terms.every((term) => searchableText.includes(term));
}

/**
 * Return original-string ranges for normalized query-term matches. The source
 * spans avoid assuming that folded and displayed strings have equal offsets.
 */
export function findSearchMatchRanges(value: string, query: string): SearchMatchRange[] {
  const terms = Array.from(new Set(getSearchTerms(query))).sort((a, b) => b.length - a.length);
  if (terms.length === 0 || value.length === 0) return [];

  const folded = foldText(value);
  const candidates: SearchMatchRange[] = [];

  for (const term of terms) {
    let fromIndex = 0;
    while (fromIndex <= folded.text.length - term.length) {
      const matchIndex = folded.text.indexOf(term, fromIndex);
      if (matchIndex < 0) break;

      const firstSpan = folded.spans[matchIndex];
      const lastSpan = folded.spans[matchIndex + term.length - 1];
      if (firstSpan && lastSpan) {
        candidates.push({ start: firstSpan.start, end: lastSpan.end });
      }
      fromIndex = matchIndex + Math.max(1, term.length);
    }
  }

  candidates.sort((a, b) => a.start - b.start || b.end - a.end);
  const ranges: SearchMatchRange[] = [];
  for (const candidate of candidates) {
    const previous = ranges[ranges.length - 1];
    if (!previous || candidate.start >= previous.end) ranges.push(candidate);
  }
  return ranges;
}
