import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AnimeSongItem } from '../types';
import { searchCatalogResults } from './catalogResults';
import { searchSongsByArtistIds } from './anisongdbArtists';

const song = (id: number, extra: Partial<AnimeSongItem> = {}): AnimeSongItem => ({
  id: `song-${id}`, anime_name: 'Same anime', anime_year: 2020,
  song_name: 'Same song', artist: 'Same artist', theme_type: 'Opening 1',
  ...extra,
});

test('stable ID ties, bounded pages, offsets and empty/out-of-range clamping', () => {
  const rows = Array.from({ length: 1203 }, (_, i) => song(1203 - i));
  const seen: string[] = [];
  for (let offset = 0; offset < rows.length; offset += 100) {
    const result = searchCatalogResults(rows, {}, { offset, limit: 100 });
    assert.equal(result.total, rows.length);
    assert.equal(result.offset, offset);
    assert.equal(result.hasMore, offset + 100 < rows.length);
    seen.push(...result.data.map((item) => String(item.id)));
  }
  assert.deepEqual(seen, Array.from({ length: 1203 }, (_, i) => `song-${i + 1}`));
  assert.equal(rows[0].id, 'song-1203');
  assert.equal(searchCatalogResults(rows, {}, { offset: 99999 }).offset, 1200);
  assert.equal(searchCatalogResults(rows, {}, { offset: -1 }).offset, 0);
  assert.equal(searchCatalogResults(rows, {}, { offset: Infinity, limit: Infinity }).data.length, 100);
  assert.equal(searchCatalogResults(rows, {}, { limit: 99999 }).data.length, 500);
  assert.deepEqual(searchCatalogResults([], {}, { offset: 900 }).data, []);
  assert.equal(searchCatalogResults([], {}, { offset: 900 }).offset, 0);
});

test('note-only matches merge before filters, ordering and slicing, with canonical metadata winning', () => {
  const rows = [song(1, { song_name: 'query', anime_year: 2022 }), song(2), song(3, { theme_type: 'Ending 1' })];
  const extras = [song(1, { song_name: 'stale' }), song(2), song(3), song(4, { anime_year: 2021 })];
  const params = { q: 'query', themeType: 'OP', sortKey: 'anime_year', sortOrder: 'asc', limit: 1 };
  const pages = [0, 1, 2].map((offset) => searchCatalogResults(rows, {}, { ...params, offset }, extras));
  assert.deepEqual(pages.map((page) => page.data[0].id), ['song-2', 'song-4', 'song-1']);
  assert.ok(pages.every((page) => page.total === 3));
  assert.equal(pages[2].data[0].song_name, 'query');
  assert.equal(searchCatalogResults(rows, {}, { ...params, yearMin: 2021 }, extras).total, 2);
  assert.equal(searchCatalogResults(rows, {}, { ...params, q: 'absent' }).total, 0);
});

test('canonical artist results beyond 500 paginate a cached deduplicated response and retry failed requests', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  let fail = true;
  globalThis.fetch = async (_input, init) => {
    calls++;
    assert.deepEqual(JSON.parse(String(init?.body)).artist_ids, [987654]);
    if (fail) { fail = false; throw new Error('offline'); }
    const rows = Array.from({ length: 601 }, (_, i) => ({
      annSongId: 900000 + i, animeENName: 'Same', animeVintage: 'Winter 2020',
      songArtist: 'Artist', songName: 'Song', songType: 'Opening 1', artists: [],
    }));
    return Response.json([...rows.reverse(), rows[0]]);
  };
  try {
    await assert.rejects(searchSongsByArtistIds([987654]), /offline/);
    const first = await searchSongsByArtistIds([987654, 987654], { limit: 500 });
    const last = await searchSongsByArtistIds([987654], { limit: 500, offset: 500 });
    assert.equal(first.total, 601);
    assert.equal(first.hasMore, true);
    assert.equal(last.data.length, 101);
    assert.equal(last.hasMore, false);
    assert.equal(new Set([...first.data, ...last.data].map((row) => row.id)).size, 601);
    assert.equal(calls, 2);
    assert.equal((await searchSongsByArtistIds([987654], { yearMin: 2021 })).total, 0);
    assert.equal(calls, 2);
  } finally { globalThis.fetch = original; }
});
