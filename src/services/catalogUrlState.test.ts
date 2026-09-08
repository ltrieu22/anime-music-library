import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_CATALOG_STATE, parseCatalogUrl, serializeCatalogUrl } from './catalogUrlState';
import { searchCatalogResults } from './catalogResults';
import type { AnimeSongItem } from '../types';

test('public search round trips Unicode, filters, artist IDs, sorting and pages', () => {
  for (const artistIds of [[], [12, 54]]) {
    const state = { ...DEFAULT_CATALOG_STATE, q: artistIds.length ? '' : 'fhána 日本 & + #',
      yearMin: 1990, yearMax: 2020, season: 'Fall', theme: 'ED', artistIds,
      sortKey: 'song_name' as const, sortOrder: 'asc' as const, page: 3 };
    assert.deepEqual(parseCatalogUrl(serializeCatalogUrl(state, new URL('https://example.com/anime_db/'))), state);
  }
});

test('defaults omitted; base path, unrelated repeated parameters, play and hash survive', () => {
  const base = new URL('https://example.com/anime_db/?q=old&q=duplicate&season=bad&play=song-34830&x=1&x=2#songs');
  const result = serializeCatalogUrl(DEFAULT_CATALOG_STATE, base);
  assert.equal(result.href, 'https://example.com/anime_db/?play=song-34830&x=1&x=2#songs');
  assert.equal(base.searchParams.get('q'), 'old');
  assert.deepEqual(parseCatalogUrl(result), DEFAULT_CATALOG_STATE);
});

test('malformed numbers and enums fall back; reversed years and artist lists normalize', () => {
  const parse = (query: string) => parseCatalogUrl(new URL(`https://example.com/?${query}`));
  for (const bad of ['-2', '0', '1.5', '2oops', 'Infinity', '9007199254740991']) {
    assert.equal(parse(`page=${bad}`).page, 0);
  }
  assert.deepEqual(parse('yearMin=banana&yearMax=9999&season=winter&theme=bad&sort=notes&order=nope'), DEFAULT_CATALOG_STATE);
  const valid = parse('yearMin=2020&yearMax=1990&artists=54,12,12,-1,nope,0,1.5&q=ignored');
  assert.deepEqual(valid.artistIds, [12, 54]);
  assert.equal(valid.q, '');
  assert.equal(valid.yearMin, 1990);
  assert.equal(valid.yearMax, 2020);
  const canonical = serializeCatalogUrl(valid, new URL('https://example.com/'));
  assert.equal(serializeCatalogUrl(parseCatalogUrl(canonical), canonical).href, canonical.href);
});

test('copied search URLs restore identical filtered and paginated catalog results', () => {
  const rows: AnimeSongItem[] = Array.from({ length: 320 }, (_, i) => ({
    id: `song-${i}`, anime_name: 'Anime', song_name: 'fhána song', artist: 'Artist',
    anime_year: 2020, anime_season: 'Fall', theme_type: 'Ending 1',
  }));
  const original = { ...DEFAULT_CATALOG_STATE, q: 'fhana', season: 'Fall', theme: 'ED', page: 2 };
  const restored = parseCatalogUrl(serializeCatalogUrl(original, new URL('https://example.com/anime_db/')));
  const results = (state: typeof original) => searchCatalogResults(rows, {}, {
    q: state.q, season: state.season, themeType: state.theme, yearMin: state.yearMin,
    yearMax: state.yearMax, sortKey: state.sortKey, sortOrder: state.sortOrder, offset: state.page * 100, limit: 100,
  });
  assert.deepEqual(results(restored), results(original));
  assert.equal(results(restored).data.length, 100);
  assert.equal(results(restored).offset, 200);
});
